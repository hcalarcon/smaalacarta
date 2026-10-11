-- Varios repartidores, etapa 1: repartidores y zonas (ENVIO-45 a 58).
--
-- Esta etapa prepara los datos y las pantallas. El circuito del pedido NO cambia: sigue naciendo
-- con un repartidor asignado (ver `-- TRANSICIÓN` más abajo); la etapa 2 lo reemplaza.
--
-- - Puede haber varios repartidores activos (se borra `couriers_one_active_idx`).
-- - `delivery_zones`: las zonas son comunes a la plataforma, con un precio de referencia. Las
--   administra solo el superadmin. Se carga copiando `courier_zones` CON LOS MISMOS `id`, así
--   `orders.delivery_zone_id` sigue valiendo. `courier_zones` se borra al final.
-- - `courier_zone_coverage`: qué zonas cubre cada repartidor. GLOBAL, como `couriers`: no tiene
--   `business_id` y el filtro es por repartidor (`my_courier_id()`), no por negocio.
-- - `business_delivery_zones`: a qué zonas envía cada local (RLS por `business_id`).
-- - `business_settings` gana `favorite_courier_id` y `favorite_minutes`. Se guardan con
--   `set_courier_preferences()`; `save_delivery_preferences()` hace zonas + favorito en una sola
--   transacción (es lo que usa Configuración).
-- - `couriers`: escritura solo del superadmin. Un repartidor ve su fila y un miembro ve los
--   repartidores activos que cubren alguna de sus zonas.
-- - `create_courier_with_user()`: alta atómica de repartidor + su usuario (solo superadmin).
--
-- Errores nuevos: `P0017` (el favorito no está activo o no cubre ninguna zona del local).

-- ---------------------------------------------------------------------------
-- Varios repartidores activos
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.couriers_one_active_idx;

-- ---------------------------------------------------------------------------
-- Zonas de la plataforma
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 60),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Con los mismos `id`. Si dos repartidores tuvieran un barrio con el mismo nombre, queda uno solo
-- y los pedidos se pasan al que quedó.
INSERT INTO public.delivery_zones (id, name, price, sort_order, active)
SELECT DISTINCT ON (z.name) z.id, z.name, z.price, z.sort_order, z.active
FROM public.courier_zones z
ORDER BY z.name, z.sort_order, z.id
ON CONFLICT DO NOTHING;

UPDATE public.orders o
SET delivery_zone_id = dz.id
FROM public.courier_zones cz
JOIN public.delivery_zones dz ON dz.name = cz.name
WHERE o.delivery_zone_id = cz.id AND o.delivery_zone_id <> dz.id;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_zone_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_zone_id_fkey
  FOREIGN KEY (delivery_zone_id) REFERENCES public.delivery_zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS delivery_zones_order_idx ON public.delivery_zones (sort_order, name);

CREATE TABLE IF NOT EXISTS public.courier_zone_coverage (
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  PRIMARY KEY (courier_id, zone_id)
);

CREATE INDEX IF NOT EXISTS courier_zone_coverage_zone_idx ON public.courier_zone_coverage (zone_id);

-- Cada repartidor cubre, al arrancar, las zonas activas que ya tenía.
INSERT INTO public.courier_zone_coverage (courier_id, zone_id)
SELECT cz.courier_id, dz.id
FROM public.courier_zones cz
JOIN public.delivery_zones dz ON dz.name = cz.name
WHERE cz.active AND dz.active
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.business_delivery_zones (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  PRIMARY KEY (business_id, zone_id)
);

CREATE INDEX IF NOT EXISTS business_delivery_zones_zone_idx ON public.business_delivery_zones (zone_id);

-- Los negocios con envío arrancan enviando a todas las zonas activas: no cambia lo que ven sus
-- clientes.
INSERT INTO public.business_delivery_zones (business_id, zone_id)
SELECT b.id, z.id
FROM public.businesses b
CROSS JOIN public.delivery_zones z
WHERE b.courier_delivery AND z.active
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Favorito del local
-- ---------------------------------------------------------------------------

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS favorite_courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS favorite_minutes integer NOT NULL DEFAULT 5
    CHECK (favorite_minutes BETWEEN 1 AND 60);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_zone_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_delivery_zones ENABLE ROW LEVEL SECURITY;

-- delivery_zones: las lee cualquier usuario con sesión; las escribe solo el superadmin.
DROP POLICY IF EXISTS delivery_zones_select ON public.delivery_zones;
CREATE POLICY delivery_zones_select
ON public.delivery_zones
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS delivery_zones_insert_super_admin ON public.delivery_zones;
CREATE POLICY delivery_zones_insert_super_admin
ON public.delivery_zones
FOR INSERT
TO authenticated
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS delivery_zones_update_super_admin ON public.delivery_zones;
CREATE POLICY delivery_zones_update_super_admin
ON public.delivery_zones
FOR UPDATE
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS delivery_zones_delete_super_admin ON public.delivery_zones;
CREATE POLICY delivery_zones_delete_super_admin
ON public.delivery_zones
FOR DELETE
TO authenticated
USING ((select public.is_super_admin()));

-- courier_zone_coverage: el repartidor ve, agrega y borra solo las suyas; el superadmin todas.
DROP POLICY IF EXISTS courier_zone_coverage_all_super_admin ON public.courier_zone_coverage;
CREATE POLICY courier_zone_coverage_all_super_admin
ON public.courier_zone_coverage
FOR ALL
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS courier_zone_coverage_select_own ON public.courier_zone_coverage;
CREATE POLICY courier_zone_coverage_select_own
ON public.courier_zone_coverage
FOR SELECT
TO authenticated
USING (courier_id = (select public.my_courier_id()));

DROP POLICY IF EXISTS courier_zone_coverage_insert_own ON public.courier_zone_coverage;
CREATE POLICY courier_zone_coverage_insert_own
ON public.courier_zone_coverage
FOR INSERT
TO authenticated
WITH CHECK (courier_id = (select public.my_courier_id()));

DROP POLICY IF EXISTS courier_zone_coverage_delete_own ON public.courier_zone_coverage;
CREATE POLICY courier_zone_coverage_delete_own
ON public.courier_zone_coverage
FOR DELETE
TO authenticated
USING (courier_id = (select public.my_courier_id()));

-- business_delivery_zones: los miembros del negocio leen, agregan y borran las suyas.
DROP POLICY IF EXISTS business_delivery_zones_all_super_admin ON public.business_delivery_zones;
CREATE POLICY business_delivery_zones_all_super_admin
ON public.business_delivery_zones
FOR ALL
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS business_delivery_zones_select_member ON public.business_delivery_zones;
CREATE POLICY business_delivery_zones_select_member
ON public.business_delivery_zones
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_delivery_zones.business_id
  )
);

DROP POLICY IF EXISTS business_delivery_zones_insert_member ON public.business_delivery_zones;
CREATE POLICY business_delivery_zones_insert_member
ON public.business_delivery_zones
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_delivery_zones.business_id
  )
);

DROP POLICY IF EXISTS business_delivery_zones_delete_member ON public.business_delivery_zones;
CREATE POLICY business_delivery_zones_delete_member
ON public.business_delivery_zones
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_delivery_zones.business_id
  )
);

-- couriers: la escritura sigue siendo solo del superadmin (`couriers_all_super_admin`). La lectura
-- de un miembro pasa de "el repartidor activo" a "los activos que cubren alguna zona de mi negocio".
-- La función es SECURITY DEFINER para que la política no dependa del RLS de las otras tablas.
CREATE OR REPLACE FUNCTION public.courier_covers_my_zones(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_users bu
    JOIN public.businesses b ON b.id = bu.business_id AND b.courier_delivery
    JOIN public.business_delivery_zones bz ON bz.business_id = bu.business_id
    JOIN public.courier_zone_coverage cc ON cc.zone_id = bz.zone_id
    WHERE bu.user_id = (select auth.uid()) AND cc.courier_id = p_courier_id
  );
$$;

REVOKE ALL ON FUNCTION public.courier_covers_my_zones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_covers_my_zones(uuid) TO authenticated;

DROP POLICY IF EXISTS couriers_select_member ON public.couriers;
CREATE POLICY couriers_select_member
ON public.couriers
FOR SELECT
TO authenticated
USING (active AND (select public.courier_covers_my_zones(id)));

-- ---------------------------------------------------------------------------
-- El repartidor que atiende los pedidos de un local
-- ---------------------------------------------------------------------------

-- TRANSICIÓN (etapa 2 lo reemplaza): el pedido sigue naciendo con un repartidor asignado. Es el
-- favorito del local (si está activo) y, si no tiene, Repartos al Toque. Lo usan
-- `create_public_order` y `public_delivery_zones`, para que el menú muestre al mismo repartidor
-- que después queda en el pedido.
CREATE OR REPLACE FUNCTION public.business_transition_courier(p_business_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT c.id
      FROM public.business_settings s
      JOIN public.couriers c ON c.id = s.favorite_courier_id AND c.active
      WHERE s.business_id = p_business_id
    ),
    (
      SELECT c.id
      FROM public.couriers c
      WHERE c.id = '7a0c0e00-0000-4000-8000-000000000001' AND c.active
    )
  );
$$;

REVOKE ALL ON FUNCTION public.business_transition_courier(uuid) FROM PUBLIC, anon, authenticated;

-- Nombre y WhatsApp de ese repartidor, para el mensaje de "Pedir envío" del panel del local.
-- Solo para miembros de un negocio con `courier_delivery`.
CREATE OR REPLACE FUNCTION public.my_delivery_courier()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('name', c.name, 'whatsapp', c.whatsapp)
  FROM public.business_users bu
  JOIN public.businesses b ON b.id = bu.business_id AND b.courier_delivery
  JOIN public.couriers c ON c.id = public.business_transition_courier(b.id)
  WHERE bu.user_id = (select auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_delivery_courier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_delivery_courier() TO authenticated;

-- ---------------------------------------------------------------------------
-- Preferencias de envío del local
-- ---------------------------------------------------------------------------

-- ¿El favorito está activo y cubre al menos una zona de ese local? (P0017 si no.) Lo comparten
-- `set_courier_preferences` y el trigger, que cubre los UPDATE directos de un miembro.
CREATE OR REPLACE FUNCTION public.assert_valid_favorite_courier(p_business_id uuid, p_courier_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_courier_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.couriers c
    JOIN public.courier_zone_coverage cc ON cc.courier_id = c.id
    JOIN public.business_delivery_zones bz ON bz.zone_id = cc.zone_id AND bz.business_id = p_business_id
    JOIN public.delivery_zones z ON z.id = bz.zone_id AND z.active
    WHERE c.id = p_courier_id AND c.active
  ) THEN
    RAISE EXCEPTION 'El repartidor favorito tiene que estar activo y cubrir alguna de tus zonas'
      USING ERRCODE = 'P0017';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_valid_favorite_courier(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- La misma comprobación para el negocio de quien llama (la usa `set_courier_preferences`, que corre
-- con los permisos de quien la llama y no puede leer la cobertura de los repartidores).
CREATE OR REPLACE FUNCTION public.assert_my_favorite_courier(p_courier_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_valid_favorite_courier(public.my_courier_business_id(), p_courier_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_my_favorite_courier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_my_favorite_courier(uuid) TO authenticated;

-- SECURITY DEFINER: el UPDATE lo hace un miembro, que no lee la cobertura de los repartidores.
CREATE OR REPLACE FUNCTION public.guard_favorite_courier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.favorite_courier_id IS NOT NULL
     AND (tg_op = 'INSERT' OR new.favorite_courier_id IS DISTINCT FROM old.favorite_courier_id) THEN
    PERFORM public.assert_valid_favorite_courier(new.business_id, new.favorite_courier_id);
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS business_settings_guard_favorite ON public.business_settings;
CREATE TRIGGER business_settings_guard_favorite
  BEFORE INSERT OR UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_favorite_courier();

-- El negocio de quien llama, solo si tiene el envío habilitado. Las dos funciones de abajo corren
-- con los permisos de quien las llama (SECURITY INVOKER): el RLS las respalda.
CREATE OR REPLACE FUNCTION public.my_courier_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT bu.business_id
  FROM public.business_users bu
  JOIN public.businesses b ON b.id = bu.business_id AND b.courier_delivery
  WHERE bu.user_id = (select auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_courier_business_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_courier_business_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_courier_preferences(p_favorite uuid, p_minutes integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
BEGIN
  IF v_business IS NULL THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor' USING ERRCODE = '42501';
  END IF;

  IF p_minutes IS NULL OR p_minutes NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Los minutos para el favorito van de 1 a 60' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_my_favorite_courier(p_favorite);

  INSERT INTO public.business_settings (business_id, favorite_courier_id, favorite_minutes)
  VALUES (v_business, p_favorite, p_minutes)
  ON CONFLICT (business_id) DO UPDATE
  SET favorite_courier_id = excluded.favorite_courier_id,
      favorite_minutes = excluded.favorite_minutes;
END;
$$;

REVOKE ALL ON FUNCTION public.set_courier_preferences(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_courier_preferences(uuid, integer) TO authenticated;

-- Zonas + favorito en una sola transacción: el favorito se valida contra las zonas NUEVAS.
CREATE OR REPLACE FUNCTION public.save_delivery_preferences(
  p_zone_ids uuid[],
  p_favorite uuid,
  p_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
  v_zones uuid[] := coalesce(p_zone_ids, ARRAY[]::uuid[]);
BEGIN
  IF v_business IS NULL THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_zones) AS requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.delivery_zones z WHERE z.id = requested.id AND z.active
    )
  ) THEN
    RAISE EXCEPTION 'Alguna zona no existe o no está disponible' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.business_delivery_zones
  WHERE business_id = v_business AND zone_id <> ALL (v_zones);

  INSERT INTO public.business_delivery_zones (business_id, zone_id)
  SELECT v_business, requested.id
  FROM unnest(v_zones) AS requested(id)
  ON CONFLICT DO NOTHING;

  PERFORM public.set_courier_preferences(p_favorite, p_minutes);
END;
$$;

REVOKE ALL ON FUNCTION public.save_delivery_preferences(uuid[], uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_delivery_preferences(uuid[], uuid, integer) TO authenticated;

-- Lo que necesita la pantalla "Envíos" del local: las zonas activas (con la marca del local y si
-- las cubre algún repartidor activo) y los repartidores activos con las zonas que cubren. Es
-- SECURITY DEFINER porque la cobertura de cada repartidor es suya y el local no la lee por RLS.
CREATE OR REPLACE FUNCTION public.business_delivery_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
BEGIN
  IF v_business IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', z.id,
                 'name', z.name,
                 'price', z.price,
                 'selected', EXISTS (
                   SELECT 1 FROM public.business_delivery_zones bz
                   WHERE bz.business_id = v_business AND bz.zone_id = z.id
                 ),
                 'covered', EXISTS (
                   SELECT 1
                   FROM public.courier_zone_coverage cc
                   JOIN public.couriers c ON c.id = cc.courier_id AND c.active
                   WHERE cc.zone_id = z.id
                 )
               )
               ORDER BY z.sort_order, z.name
             )
      FROM public.delivery_zones z
      WHERE z.active
    ), '[]'::jsonb),
    'couriers', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', c.id,
                 'name', c.name,
                 'whatsapp', c.whatsapp,
                 'zone_ids', (
                   SELECT coalesce(jsonb_agg(cc.zone_id), '[]'::jsonb)
                   FROM public.courier_zone_coverage cc
                   JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
                   WHERE cc.courier_id = c.id
                 )
               )
               ORDER BY c.name, c.id
             )
      FROM public.couriers c
      WHERE c.active
        AND EXISTS (
          SELECT 1 FROM public.courier_zone_coverage cc
          JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
          WHERE cc.courier_id = c.id
        )
    ), '[]'::jsonb),
    'favorite_id', (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_business),
    'favorite_minutes', coalesce(
      (SELECT s.favorite_minutes FROM public.business_settings s WHERE s.business_id = v_business), 5
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_options() TO authenticated;

-- ---------------------------------------------------------------------------
-- Alta de repartidor con su usuario (solo superadmin)
-- ---------------------------------------------------------------------------

-- `courier_users` no tiene políticas de escritura a propósito: las dos filas se crean acá, juntas.
CREATE OR REPLACE FUNCTION public.create_courier_with_user(
  p_name text,
  p_whatsapp text,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo un superadmin puede crear repartidores' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.couriers (name, whatsapp)
  VALUES (btrim(p_name), NULLIF(btrim(coalesce(p_whatsapp, '')), ''))
  RETURNING id INTO v_courier_id;

  INSERT INTO public.courier_users (courier_id, user_id)
  VALUES (v_courier_id, p_user_id);

  RETURN v_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_courier_with_user(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_courier_with_user(text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lo que usa `courier_zones`, sobre `delivery_zones` y `courier_zone_coverage`
-- ---------------------------------------------------------------------------

-- Misma `create_public_order` de `20261018000000_envio_repartos_al_toque.sql` (11 parámetros).
-- Cambia la búsqueda de la zona: tiene que estar activa, ser una de las que el local marcó y tener
-- al menos un repartidor activo que la cubra. El repartidor del pedido es el de la TRANSICIÓN.
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_slug text,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_preorder boolean DEFAULT false,
  p_delivery_zone uuid DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery text := NULLIF(btrim(coalesce(p_delivery, '')), '');
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_address text := btrim(coalesce(p_delivery_address, ''));
  v_business_found boolean;
  v_business_id uuid;
  v_courier_delivery boolean;
  v_with_courier boolean;
  v_zone_id uuid;
  v_zone_name text;
  v_courier_id uuid;
  v_price numeric;
  v_result jsonb;
BEGIN
  SELECT b.id, b.courier_delivery INTO v_business_id, v_courier_delivery
  FROM public.businesses b
  WHERE b.slug = p_slug;
  v_business_found := FOUND;

  -- Si el negocio no existe, lo dice la función base (P0002).
  v_with_courier := v_business_found AND v_courier_delivery AND v_delivery = 'delivery';

  IF v_business_found AND p_delivery_zone IS NOT NULL AND NOT v_with_courier THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor para esa entrega' USING ERRCODE = 'P0016';
  END IF;

  IF v_with_courier THEN
    IF p_delivery_zone IS NULL THEN
      RAISE EXCEPTION 'Elegí el barrio del envío' USING ERRCODE = 'P0016';
    END IF;

    SELECT z.id, z.name, z.price
    INTO v_zone_id, v_zone_name, v_price
    FROM public.delivery_zones z
    WHERE z.id = p_delivery_zone
      AND z.active
      AND EXISTS (
        SELECT 1 FROM public.business_delivery_zones bz
        WHERE bz.business_id = v_business_id AND bz.zone_id = z.id
      )
      AND EXISTS (
        SELECT 1
        FROM public.courier_zone_coverage cc
        JOIN public.couriers c ON c.id = cc.courier_id AND c.active
        WHERE cc.zone_id = z.id
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
    END IF;

    -- TRANSICIÓN (etapa 2 lo reemplaza): el favorito del local o, si no tiene, Repartos al Toque.
    v_courier_id := public.business_transition_courier(v_business_id);

    IF v_courier_id IS NULL THEN
      RAISE EXCEPTION 'No hay un repartidor disponible' USING ERRCODE = 'P0016';
    END IF;

    IF char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
      RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_address) NOT BETWEEN 5 AND 200 THEN
      RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_result := public.create_public_order_base(
    p_slug, p_customer_name, p_delivery, p_payment, p_notes, p_items, p_scheduled_for, p_preorder
  );

  IF v_with_courier THEN
    UPDATE public.orders
    SET courier_id = v_courier_id,
        delivery_zone_id = v_zone_id,
        delivery_zone_name = v_zone_name,
        delivery_fee_list = v_price,
        delivery_fee = v_price,
        customer_phone = v_phone,
        delivery_address = v_address,
        courier_status = 'waiting'
    WHERE code = v_result ->> 'code';

    v_result := v_result || jsonb_build_object('delivery_fee', v_price);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text
) TO anon, authenticated;

-- Misma `public_delivery_zones` de `20261020000000_telefono_repartidor_publico.sql`, con la forma
-- de la respuesta intacta (`repartidor`, `whatsapp`, `zonas`). Ahora `zonas` son las activas que el
-- local marcó y que cubre al menos un repartidor activo; `repartidor` y `whatsapp` son los del
-- repartidor de la TRANSICIÓN (el mismo que va a quedar en el pedido).
CREATE OR REPLACE FUNCTION public.public_delivery_zones(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_courier_id uuid;
  v_courier_name text;
  v_courier_whatsapp text;
BEGIN
  SELECT b.id
  INTO v_business_id
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug
    AND s.published
    AND b.active
    AND b.plan_completo
    AND b.courier_delivery;

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- TRANSICIÓN (etapa 2 lo reemplaza).
  v_courier_id := public.business_transition_courier(v_business_id);

  SELECT c.name, c.whatsapp
  INTO v_courier_name, v_courier_whatsapp
  FROM public.couriers c
  WHERE c.id = v_courier_id;

  IF v_courier_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'zonas', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('id', z.id, 'nombre', z.name, 'precio', z.price)
               ORDER BY z.sort_order, z.name
             )
      FROM public.delivery_zones z
      JOIN public.business_delivery_zones bz ON bz.zone_id = z.id AND bz.business_id = v_business_id
      WHERE z.active
        AND EXISTS (
          SELECT 1
          FROM public.courier_zone_coverage cc
          JOIN public.couriers c ON c.id = cc.courier_id AND c.active
          WHERE cc.zone_id = z.id
        )
    ), '[]'::jsonb)
  )
  -- Sin WhatsApp cargado, la clave no va (solo se limpia este nivel, no `zonas`).
  || jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_courier_name,
    'whatsapp', v_courier_whatsapp
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_delivery_zones(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_delivery_zones(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fuera `courier_zones`: nada la usa ya (sus políticas se van con la tabla).
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.courier_zones;

-- `is_member_of_courier_business()` ya no la usa ninguna política (la de `couriers` es otra y
-- `courier_zones` no existe más), así que se retira.
DROP FUNCTION IF EXISTS public.is_member_of_courier_business();
