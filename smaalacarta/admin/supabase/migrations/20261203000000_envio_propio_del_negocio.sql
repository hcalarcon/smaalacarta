-- Envío propio del negocio (ENVIO-245 a 257).
--
-- Un local fuera del centro tiene su propio delivery: sus zonas, sus precios y su repartidor, fuera de la red común.
-- Reemplaza el modelo de las tareas 47 y 48 (tipos de precio, zonas del repartidor, favorito fijado por el superadmin),
-- que esta migración elimina al final. Las migraciones anteriores no se tocan.
--
-- - `businesses.delivery_type` (`free` | `own`): `free` es la red común de siempre; `own` usa `business_own_zones` y el
--   repartidor propio del negocio.
-- - `couriers.courier_type` (`free` | `own`) y `couriers.own_business_id`: un repartidor propio sirve a un solo negocio y no
--   entra en la puja de ningún otro. A lo sumo un propio activo por negocio.
-- - `business_own_zones`: las zonas y precios del negocio. RLS por `business_id`; las lee además su repartidor propio.
-- - `delivery_zones_for_business()` sigue siendo el único lugar que resuelve las zonas de un negocio.
-- - Un pedido de un negocio propio va directo a su repartidor (`assign_direct_delivery`), sin ofertas; sin repartidor propio
--   queda "Lo llevo yo". Sin zonas con precio el envío se ofrece "a coordinar": `orders.delivery_fee_coordinated` y el local
--   carga el precio con `set_delivery_fee()`.
-- - `effective_favorite_courier()` devuelve solo el favorito que eligió el negocio y `default_courier_id()` desaparece.
--
-- Cada función de abajo es la última versión de su archivo de origen (se nombra en el comentario) con el cambio indicado.

-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'free';

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_delivery_type_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_delivery_type_check CHECK (delivery_type IN ('free', 'own'));

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS courier_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS own_business_id uuid REFERENCES public.businesses(id);

ALTER TABLE public.couriers DROP CONSTRAINT IF EXISTS couriers_type_check;
ALTER TABLE public.couriers
  ADD CONSTRAINT couriers_type_check CHECK (
    (courier_type = 'free' AND own_business_id IS NULL)
    OR (courier_type = 'own' AND own_business_id IS NOT NULL)
  );

-- A lo sumo un repartidor propio activo por negocio.
CREATE UNIQUE INDEX IF NOT EXISTS couriers_one_own_per_business_idx
  ON public.couriers (own_business_id)
  WHERE courier_type = 'own' AND active;

-- Solo el superadmin cambia el tipo de un repartidor y su negocio. Hoy `couriers` solo la escribe el superadmin por RLS;
-- la guarda lo deja protegido aunque algún día se abra la escritura.
CREATE OR REPLACE FUNCTION public.guard_courier_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated')
     AND NOT public.is_super_admin()
     AND (
       new.courier_type IS DISTINCT FROM old.courier_type
       OR new.own_business_id IS DISTINCT FROM old.own_business_id
     )
  THEN
    RAISE EXCEPTION 'Solo un superadmin puede cambiar el tipo de repartidor' USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_courier_type() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS couriers_guard_type ON public.couriers;
CREATE TRIGGER couriers_guard_type
  BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.guard_courier_type();

-- ---------------------------------------------------------------------------
-- Zonas del negocio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_own_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  -- Una zona sin precio no se ofrece: el negocio puede cargar el nombre y completar el precio después.
  price numeric(10,2) CHECK (price >= 0 AND price < 100000000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_own_zones_name_idx
  ON public.business_own_zones (business_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS business_own_zones_order_idx
  ON public.business_own_zones (business_id, sort_order, name);

ALTER TABLE public.business_own_zones ENABLE ROW LEVEL SECURITY;

-- ¿La sesión es el repartidor propio de este negocio? SECURITY DEFINER para no depender de que las políticas de
-- `couriers` la dejen leer la fila.
CREATE OR REPLACE FUNCTION public.is_own_courier_of(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_business_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = public.my_courier_id()
        AND c.courier_type = 'own'
        AND c.own_business_id = p_business_id
    )
$$;

REVOKE ALL ON FUNCTION public.is_own_courier_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_courier_of(uuid) TO authenticated;

DROP POLICY IF EXISTS business_own_zones_all_super_admin ON public.business_own_zones;
CREATE POLICY business_own_zones_all_super_admin
ON public.business_own_zones
FOR ALL TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS business_own_zones_select_member ON public.business_own_zones;
CREATE POLICY business_own_zones_select_member
ON public.business_own_zones
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_own_zones.business_id
  )
);

-- El repartidor propio las lee, nunca las escribe.
DROP POLICY IF EXISTS business_own_zones_select_own_courier ON public.business_own_zones;
CREATE POLICY business_own_zones_select_own_courier
ON public.business_own_zones
FOR SELECT TO authenticated
USING ((select public.is_own_courier_of(business_own_zones.business_id)));

DROP POLICY IF EXISTS business_own_zones_insert_member ON public.business_own_zones;
CREATE POLICY business_own_zones_insert_member
ON public.business_own_zones
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_own_zones.business_id
  )
);

DROP POLICY IF EXISTS business_own_zones_update_member ON public.business_own_zones;
CREATE POLICY business_own_zones_update_member
ON public.business_own_zones
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_own_zones.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_own_zones.business_id
  )
);

DROP POLICY IF EXISTS business_own_zones_delete_member ON public.business_own_zones;
CREATE POLICY business_own_zones_delete_member
ON public.business_own_zones
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_own_zones.business_id
  )
);

REVOKE ALL ON public.business_own_zones FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_own_zones TO authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS own_zone_id uuid REFERENCES public.business_own_zones(id) ON DELETE SET NULL,
  -- El costo del envío se coordina con el local: sin zona con precio. Mientras `delivery_fee` esté vacío, está pendiente.
  ADD COLUMN IF NOT EXISTS delivery_fee_coordinated boolean NOT NULL DEFAULT false;

-- Una zona con un pedido en curso no se borra (P0029): si no, el pedido quedaba sin zona. Se desactiva.
CREATE OR REPLACE FUNCTION public.guard_business_zone_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.own_zone_id = old.id
      AND o.status NOT IN ('delivered', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'La zona tiene un pedido en curso' USING ERRCODE = 'P0029';
  END IF;

  RETURN old;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_business_zone_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS business_own_zones_guard_delete ON public.business_own_zones;
CREATE TRIGGER business_own_zones_guard_delete
  BEFORE DELETE ON public.business_own_zones
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_zone_delete();

-- ---------------------------------------------------------------------------
-- Los negocios de la tarea 47 con tipo `courier` pasan a envío propio
-- ---------------------------------------------------------------------------

-- Todo esto corre antes de redefinir nada: usa `effective_favorite_courier` como era (el favorito, o Repartos al Toque).
UPDATE public.businesses SET delivery_type = 'own' WHERE delivery_pricing = 'courier';

-- Su favorito pasa a ser el repartidor propio: uno por negocio, y cada repartidor de un solo negocio.
WITH pick AS (
  SELECT DISTINCT ON (f.courier_id) b.id AS business_id, f.courier_id
  FROM public.businesses b
  CROSS JOIN LATERAL (SELECT public.effective_favorite_courier(b.id) AS courier_id) f
  JOIN public.couriers c ON c.id = f.courier_id AND c.active
  WHERE b.delivery_pricing = 'courier'
  ORDER BY f.courier_id, b.id
)
UPDATE public.couriers c
SET courier_type = 'own',
    own_business_id = pick.business_id
FROM pick
WHERE c.id = pick.courier_id;

-- Sus zonas, con los mismos id, y los pedidos apuntan a la zona nueva.
INSERT INTO public.business_own_zones (id, business_id, name, price, active, sort_order)
SELECT cz.id, c.own_business_id, cz.name, cz.price, cz.active, cz.sort_order
FROM public.courier_own_zones cz
JOIN public.couriers c ON c.id = cz.courier_id AND c.courier_type = 'own'
ON CONFLICT DO NOTHING;

UPDATE public.orders o
SET own_zone_id = o.courier_zone_id
WHERE o.courier_zone_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.business_own_zones z WHERE z.id = o.courier_zone_id);

-- ---------------------------------------------------------------------------
-- Guarda de las columnas que solo mueve el superadmin
-- ---------------------------------------------------------------------------

-- Misma `guard_business_admin_columns` de `20261124000000_tipo_de_precio_del_envio.sql`: `delivery_type` reemplaza a las tres
-- columnas de la tarea 47.
CREATE OR REPLACE FUNCTION public.guard_business_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated')
     AND NOT public.is_super_admin()
     AND (
       new.plan_pdf IS DISTINCT FROM old.plan_pdf
       OR new.plan_web IS DISTINCT FROM old.plan_web
       OR new.plan_completo IS DISTINCT FROM old.plan_completo
       OR new.active IS DISTINCT FROM old.active
       OR new.courier_delivery IS DISTINCT FROM old.courier_delivery
       OR new.mp_oauth_enabled IS DISTINCT FROM old.mp_oauth_enabled
       OR new.delivery_type IS DISTINCT FROM old.delivery_type
     )
  THEN
    RAISE EXCEPTION 'Solo un superadmin puede cambiar el plan o el estado del negocio'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- El favorito: solo el que eligió el negocio
-- ---------------------------------------------------------------------------

-- Misma `effective_favorite_courier` de `20261028000000_envio_listo_al_activar.sql`, sin el repartidor por defecto.
CREATE OR REPLACE FUNCTION public.effective_favorite_courier(p_business uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = p_business;
$$;

REVOKE ALL ON FUNCTION public.effective_favorite_courier(uuid) FROM PUBLIC, anon, authenticated;

-- Misma `assert_valid_favorite_courier` de `20261021000000_varios_repartidores_zonas.sql`: el favorito de un negocio libre
-- tiene que ser un repartidor libre.
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
    WHERE c.id = p_courier_id AND c.active AND c.courier_type = 'free'
  ) THEN
    RAISE EXCEPTION 'El repartidor favorito tiene que estar activo y cubrir alguna de tus zonas'
      USING ERRCODE = 'P0017';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_valid_favorite_courier(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Misma `assert_my_favorite_courier` de `20261021000000_varios_repartidores_zonas.sql`.
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

-- Misma `guard_favorite_courier` de `20261021000000_varios_repartidores_zonas.sql`.
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

-- Misma `business_delivery_options` de `20261127000000_favorito_del_repartidor_propio.sql`, sin las zonas propias del
-- repartidor, sin el bloqueo del favorito ni el repartidor por defecto, y solo con repartidores libres.
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
                   JOIN public.couriers c ON c.id = cc.courier_id AND c.active AND c.courier_type = 'free'
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
               ) || CASE
                 WHEN public.courier_vehicles(c.id) IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('vehiculo', public.courier_vehicles(c.id))
               END
               ORDER BY c.name, c.id
             )
      FROM public.couriers c
      WHERE c.active
        AND c.courier_type = 'free'
        AND public.courier_terms_accepted(c.id)
        AND EXISTS (
          SELECT 1 FROM public.courier_zone_coverage cc
          JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
          WHERE cc.courier_id = c.id
        )
    ), '[]'::jsonb),
    'favorite_id', (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_business)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_options() TO authenticated;

-- ---------------------------------------------------------------------------
-- Zonas al activar el envío: solo con envío libre
-- ---------------------------------------------------------------------------

-- Misma `load_zones_on_courier_delivery` de `20261028000000_envio_listo_al_activar.sql`: solo con `delivery_type = 'free'`,
-- también al volver a `free`.
CREATE OR REPLACE FUNCTION public.load_zones_on_courier_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.courier_delivery
     AND new.delivery_type = 'free'
     AND NOT EXISTS (SELECT 1 FROM public.business_delivery_zones bz WHERE bz.business_id = new.id) THEN
    INSERT INTO public.business_delivery_zones (business_id, zone_id)
    SELECT new.id, z.id
    FROM public.delivery_zones z
    WHERE z.active
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.load_zones_on_courier_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_load_delivery_zones ON public.businesses;
CREATE TRIGGER businesses_load_delivery_zones
  AFTER INSERT OR UPDATE OF courier_delivery, delivery_type ON public.businesses
  FOR EACH ROW
  WHEN (new.courier_delivery AND new.delivery_type = 'free')
  EXECUTE FUNCTION public.load_zones_on_courier_delivery();

-- ---------------------------------------------------------------------------
-- Las zonas de un negocio, en un solo lugar
-- ---------------------------------------------------------------------------

-- El repartidor propio activo del negocio, si lo hay.
CREATE OR REPLACE FUNCTION public.own_courier_id(p_business_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM public.couriers c
  WHERE c.courier_type = 'own' AND c.own_business_id = p_business_id AND c.active
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.own_courier_id(uuid) FROM PUBLIC, anon, authenticated;

-- ¿El envío de este negocio puede ofrecerse "a coordinar" (sin zona con precio)? Con envío propio siempre; con envío
-- libre, solo si no tildó ninguna zona.
CREATE OR REPLACE FUNCTION public.business_can_coordinate_delivery(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT CASE b.delivery_type
             WHEN 'own' THEN true
             ELSE NOT EXISTS (
               SELECT 1
               FROM public.business_delivery_zones bz
               JOIN public.delivery_zones z ON z.id = bz.zone_id AND z.active
               WHERE bz.business_id = b.id
             )
           END
    FROM public.businesses b
    WHERE b.id = p_business_id
  ), false)
$$;

REVOKE ALL ON FUNCTION public.business_can_coordinate_delivery(uuid) FROM PUBLIC, anon, authenticated;

-- Misma `delivery_zones_for_business` de `20261124000000_tipo_de_precio_del_envio.sql`, según `delivery_type`. `zone_id` es el
-- id de `delivery_zones` (`source = 'common'`) o de `business_own_zones` (`source = 'own'`): como son uuid, el menú manda ese
-- id y nunca hay choque. `price_fixed`: el precio no cambia (con envío propio, siempre).
CREATE OR REPLACE FUNCTION public.delivery_zones_for_business(p_business_id uuid)
RETURNS TABLE (zone_id uuid, source text, zone_name text, price numeric, price_fixed boolean, zone_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT z.id, 'common'::text, z.name, z.price,
         (public.effective_delivery_mode(b.id) = 'fixed'), z.sort_order
  FROM public.businesses b
  JOIN public.business_delivery_zones bd ON bd.business_id = b.id
  JOIN public.delivery_zones z ON z.id = bd.zone_id AND z.active
  WHERE b.id = p_business_id
    AND b.delivery_type = 'free'
    AND EXISTS (
      SELECT 1
      FROM public.courier_zone_coverage cc
      JOIN public.couriers c ON c.id = cc.courier_id AND c.active AND c.courier_type = 'free'
      WHERE cc.zone_id = z.id
    )
  UNION ALL
  SELECT oz.id, 'own'::text, oz.name, oz.price, true, oz.sort_order
  FROM public.businesses b
  JOIN public.business_own_zones oz ON oz.business_id = b.id AND oz.active AND oz.price IS NOT NULL
  WHERE b.id = p_business_id
    AND b.delivery_type = 'own'
$$;

REVOKE ALL ON FUNCTION public.delivery_zones_for_business(uuid) FROM PUBLIC, anon, authenticated;

-- Misma `public_delivery_zones` de `20261124000000_tipo_de_precio_del_envio.sql`. Devuelve `zonas`, `coordinar` (el envío se
-- ofrece sin precio, a coordinar con el local) y `propio`. Es nula si el local no ofrece envío con repartidor: sin
-- `courier_delivery`, sin "Envío" en los tipos de entrega, o sin zonas y sin poder coordinar.
CREATE OR REPLACE FUNCTION public.public_delivery_zones(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_own boolean;
  v_zones jsonb;
  v_coordinate boolean;
BEGIN
  SELECT b.id, b.delivery_type = 'own'
  INTO v_business_id, v_own
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug
    AND s.published
    AND b.active
    AND b.plan_completo
    AND b.courier_delivery
    AND 'delivery' = ANY (coalesce(s.delivery_options, ARRAY['delivery', 'retiro']::text[]));

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object('id', r.zone_id, 'nombre', r.zone_name, 'precio', r.price, 'fijo', r.price_fixed)
           ORDER BY r.zone_order, r.zone_name
         )
  INTO v_zones
  FROM public.delivery_zones_for_business(v_business_id) r;

  v_coordinate := public.business_can_coordinate_delivery(v_business_id);

  -- Sin ninguna zona y sin poder coordinar, el local no ofrece envío con repartidor.
  IF v_zones IS NULL AND NOT v_coordinate THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'zonas', coalesce(v_zones, '[]'::jsonb),
    'coordinar', v_coordinate,
    'propio', v_own
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_delivery_zones(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_delivery_zones(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Envío directo: el pedido de un negocio propio, o a coordinar, no busca repartidor
-- ---------------------------------------------------------------------------

-- Asigna el pedido de un negocio propio a su repartidor propio (sin ofertas) o, si no tiene, lo deja "Lo llevo yo". Un
-- envío a coordinar de un negocio libre queda también "Lo llevo yo". Espera a que el pedido esté listo para asignarse:
-- confirmado por el local (como la búsqueda de repartidor, ENVIO-155) y pagado (Mercado Pago).
CREATE OR REPLACE FUNCTION public.assign_direct_delivery(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
  v_courier uuid;
  v_name text;
BEGIN
  SELECT o.id, o.business_id, o.status, b.delivery_type
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id
    AND o.courier_status = 'waiting'
    AND o.courier_id IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
    AND o.payment_status NOT IN ('awaiting', 'failed')
    AND o.status <> 'pending'
    AND (b.delivery_type = 'own' OR (o.delivery_zone_id IS NULL AND o.delivery_fee_coordinated))
  FOR UPDATE OF o;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_courier := CASE WHEN v_order.delivery_type = 'own' THEN public.own_courier_id(v_order.business_id) END;

  IF v_courier IS NOT NULL THEN
    SELECT c.name INTO v_name FROM public.couriers c WHERE c.id = v_courier;

    UPDATE public.orders
    SET courier_id = v_courier,
        courier_status = 'accepted',
        courier_responded_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
    VALUES (p_order_id, v_order.business_id, v_order.status, NULL,
            'Envío asignado a ' || v_name || ', ' || v_time, 'delivery');
  ELSE
    UPDATE public.orders
    SET courier_status = 'self',
        courier_responded_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
    VALUES (p_order_id, v_order.business_id, v_order.status, NULL, 'Lo lleva el local, ' || v_time, 'delivery');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_direct_delivery(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_assign_direct_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assign_direct_delivery(new.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_assign_direct_delivery() FROM PUBLIC, anon, authenticated;

-- Un pedido de Mercado Pago se asigna recién cuando se paga.
DROP TRIGGER IF EXISTS orders_assign_direct_delivery_on_paid ON public.orders;
CREATE TRIGGER orders_assign_direct_delivery_on_paid
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW
  WHEN (old.payment_status = 'awaiting' AND new.payment_status NOT IN ('awaiting', 'failed'))
  EXECUTE FUNCTION public.orders_assign_direct_delivery();

-- Misma `open_courier_search_on_confirm` de `20261024000000_ofertas_al_confirmar_anticipados.sql`: al confirmar, un
-- pedido de envío directo se asigna; los demás abren la búsqueda como siempre.
CREATE OR REPLACE FUNCTION public.open_courier_search_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assign_direct_delivery(new.id);

  UPDATE public.orders
  SET courier_status = 'searching',
      offered_at = now()
  WHERE id = new.id
    AND courier_status = 'waiting'
    AND courier_id IS NULL
    AND delivery_zone_id IS NOT NULL;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.open_courier_search_on_confirm() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos: la zona sale de la función única
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text
);

-- Misma `create_public_order` de `20261124000000_tipo_de_precio_del_envio.sql`. Suma el barrio en texto
-- (`p_delivery_zone_text`) para el envío a coordinar, la zona propia (`own_zone_id`) y el envío directo.
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
  p_delivery_address text DEFAULT NULL,
  p_delivery_zone_text text DEFAULT NULL
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
  v_zone_text text := btrim(coalesce(p_delivery_zone_text, ''));
  v_business_found boolean;
  v_business_id uuid;
  v_courier_delivery boolean;
  v_with_courier boolean;
  v_coordinate boolean := false;
  v_zone_id uuid;
  v_zone_source text;
  v_zone_name text;
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
    IF p_delivery_zone IS NOT NULL THEN
      SELECT r.zone_id, r.source, r.zone_name, r.price
      INTO v_zone_id, v_zone_source, v_zone_name, v_price
      FROM public.delivery_zones_for_business(v_business_id) r
      WHERE r.zone_id = p_delivery_zone;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
      END IF;
    ELSIF public.business_can_coordinate_delivery(v_business_id) THEN
      -- Sin zona con precio (o "Mi barrio no está" en un negocio con envío propio): el costo se coordina con el local.
      IF char_length(v_zone_text) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Escribí tu barrio (hasta 80 caracteres)' USING ERRCODE = 'P0016';
      END IF;

      v_coordinate := true;
      v_zone_name := v_zone_text;
    ELSE
      RAISE EXCEPTION 'Elegí el barrio del envío' USING ERRCODE = 'P0016';
    END IF;
  END IF;

  IF v_business_found AND char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = 'P0018';
  END IF;

  IF v_with_courier AND char_length(v_address) NOT BETWEEN 5 AND 200 THEN
    RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
  END IF;

  v_result := public.create_public_order_base(
    p_slug, p_customer_name, p_delivery, p_payment, p_notes, p_items, p_scheduled_for, p_preorder
  );

  IF v_with_courier THEN
    -- Todo pedido con envío espera (`waiting`) a que el local lo confirme. Un negocio libre con zona abre entonces la
    -- búsqueda; uno propio, o un envío a coordinar, no busca: `assign_direct_delivery` lo resuelve.
    UPDATE public.orders o
    SET courier_id = NULL,
        delivery_zone_id = CASE WHEN v_zone_source = 'common' THEN v_zone_id END,
        own_zone_id = CASE WHEN v_zone_source = 'own' THEN v_zone_id END,
        delivery_zone_name = v_zone_name,
        delivery_fee_list = v_price,
        delivery_fee = v_price,
        delivery_fee_coordinated = v_coordinate,
        customer_phone = v_phone,
        delivery_address = v_address,
        courier_status = 'waiting',
        offered_at = NULL
    WHERE o.code = v_result ->> 'code';

    v_result := v_result || jsonb_build_object('delivery_fee', v_price, 'delivery_fee_pending', v_coordinate);
  ELSE
    UPDATE public.orders
    SET customer_phone = v_phone
    WHERE code = v_result ->> 'code';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text, text
) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.create_manual_order(
  uuid, text, text, text, text, jsonb, timestamptz, text, uuid, text, text
);

-- Misma `create_manual_order` de `20261124000000_tipo_de_precio_del_envio.sql`. Suma el barrio en texto para el envío a
-- coordinar y el envío directo del negocio propio: el modo es `own` (su repartidor propio) o `self` (lo lleva el local).
CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_business_id uuid,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_delivery_zone uuid DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_courier_mode text DEFAULT NULL,
  p_delivery_zone_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_delivery text := NULLIF(btrim(coalesce(p_delivery, '')), '');
  v_payment text := NULLIF(btrim(coalesce(p_payment, '')), '');
  v_notes text := NULLIF(btrim(coalesce(p_notes, '')), '');
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_address text := btrim(coalesce(p_delivery_address, ''));
  v_mode text := NULLIF(btrim(coalesce(p_courier_mode, '')), '');
  v_zone_text text := btrim(coalesce(p_delivery_zone_text, ''));
  v_delivery_options text[] := ARRAY['delivery', 'retiro']::text[];
  v_payment_options text[] := ARRAY['efectivo', 'transferencia', 'tarjeta']::text[];
  v_courier_delivery boolean;
  v_delivery_type text;
  v_with_courier boolean;
  v_coordinate boolean := false;
  v_zone_id uuid;
  v_zone_source text;
  v_zone_name text;
  v_price numeric;
  v_courier uuid;
  v_courier_name text;
  v_courier_status text;
  v_resolved jsonb;
  v_lines jsonb;
  v_total numeric;
  v_order_id uuid;
  v_code text;
  v_number integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = v_uid
      AND bu.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'No sos miembro de este negocio' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'El nombre es obligatorio (hasta 80 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_notes) > 500 THEN
    RAISE EXCEPTION 'Las notas admiten hasta 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Un pedido lleva de 1 a 40 productos' USING ERRCODE = '22023';
  END IF;

  SELECT b.courier_delivery,
         b.delivery_type,
         coalesce(s.delivery_options, v_delivery_options),
         coalesce(s.payment_options, v_payment_options)
  INTO v_courier_delivery, v_delivery_type, v_delivery_options, v_payment_options
  FROM public.businesses b
  LEFT JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.id = p_business_id;

  -- Entrega: lo que el negocio ofrece, más el consumo en el local (solo existe en el pedido manual).
  IF v_delivery IS NULL THEN
    RAISE EXCEPTION 'Elegí cómo se entrega el pedido' USING ERRCODE = '22023';
  END IF;
  IF v_delivery <> 'local' AND NOT (v_delivery = ANY (v_delivery_options)) THEN
    RAISE EXCEPTION 'El negocio no ofrece ese tipo de entrega' USING ERRCODE = 'P0007';
  END IF;

  -- Pago: lo que el negocio acepta, sin Mercado Pago en línea, más QR (solo en el pedido manual).
  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Elegí cómo paga el cliente' USING ERRCODE = '22023';
  END IF;
  IF v_payment <> 'qr'
     AND (v_payment = 'mercadopago' OR NOT (v_payment = ANY (v_payment_options))) THEN
    RAISE EXCEPTION 'El negocio no acepta ese medio de pago' USING ERRCODE = 'P0008';
  END IF;

  v_with_courier := v_courier_delivery AND v_delivery = 'delivery';

  IF p_delivery_zone IS NOT NULL AND NOT v_with_courier THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor para esa entrega' USING ERRCODE = 'P0016';
  END IF;

  -- Teléfono: obligatorio con envío (de 8 a 15 dígitos, como en el menú); en retiro y consumo en el
  -- local es opcional, pero si se carga tiene que ser válido.
  IF v_delivery = 'delivery' AND char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = 'P0018';
  END IF;
  IF v_phone <> '' AND char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = 'P0018';
  END IF;

  IF v_delivery = 'delivery' AND char_length(v_address) > 200 THEN
    RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
  END IF;

  IF v_with_courier THEN
    IF p_delivery_zone IS NOT NULL THEN
      SELECT r.zone_id, r.source, r.zone_name, r.price
      INTO v_zone_id, v_zone_source, v_zone_name, v_price
      FROM public.delivery_zones_for_business(p_business_id) r
      WHERE r.zone_id = p_delivery_zone;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
      END IF;
    ELSIF public.business_can_coordinate_delivery(p_business_id) THEN
      IF char_length(v_zone_text) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Escribí el barrio (hasta 80 caracteres)' USING ERRCODE = 'P0016';
      END IF;

      v_coordinate := true;
      v_zone_name := v_zone_text;
    ELSE
      RAISE EXCEPTION 'Elegí el barrio del envío' USING ERRCODE = 'P0016';
    END IF;

    IF char_length(v_address) NOT BETWEEN 5 AND 200 THEN
      RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
    END IF;

    IF v_delivery_type = 'own' THEN
      -- Envío propio: va a su repartidor propio, o lo lleva el local. No hay ofertas ni favorito.
      v_mode := CASE WHEN v_mode = 'self' THEN 'self' ELSE 'own' END;
    ELSIF v_coordinate THEN
      -- Sin zonas tildadas no hay a quién ofrecérselo: lo lleva el local.
      v_mode := 'self';
    ELSE
      IF v_mode IS NULL OR v_mode NOT IN ('favorite', 'offers', 'self') THEN
        RAISE EXCEPTION 'Elegí cómo se resuelve el envío' USING ERRCODE = '22023';
      END IF;

      IF v_mode = 'favorite' THEN
        v_courier := public.effective_favorite_courier(p_business_id);

        -- El favorito tiene que cubrir la zona.
        SELECT c.name INTO v_courier_name
        FROM public.couriers c
        WHERE c.id = v_courier
          AND c.active
          AND EXISTS (
            SELECT 1 FROM public.courier_zone_coverage cc WHERE cc.courier_id = c.id AND cc.zone_id = v_zone_id
          );

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tu repartidor favorito no está disponible para ese barrio' USING ERRCODE = 'P0016';
        END IF;
      END IF;
    END IF;

    IF v_mode = 'own' THEN
      v_courier := public.own_courier_id(p_business_id);
      SELECT c.name INTO v_courier_name FROM public.couriers c WHERE c.id = v_courier;
    END IF;
  END IF;

  -- Los ítems del menú con el precio de la base, o libres. La nota la escribe el propio local, así
  -- que no depende del interruptor de notas del negocio.
  v_resolved := public.resolve_order_lines(p_business_id, p_items, true, true, 99);
  v_lines := v_resolved -> 'lines';
  v_total := (v_resolved ->> 'total')::numeric;

  v_number := public.next_order_number(p_business_id);

  v_courier_status := CASE
    WHEN NOT v_with_courier THEN NULL
    WHEN v_mode = 'favorite' THEN 'accepted'
    WHEN v_mode = 'own' AND v_courier IS NOT NULL THEN 'accepted'
    WHEN v_mode IN ('self', 'own') THEN 'self'
    ELSE 'searching'
  END;

  INSERT INTO public.orders
    (business_id, order_number, status, total, notes, customer_name, delivery, payment, source,
     scheduled_for, payment_status, customer_phone, delivery_address,
     delivery_zone_id, own_zone_id, delivery_zone_name, delivery_fee_list, delivery_fee, delivery_fee_coordinated,
     courier_id, courier_status, courier_responded_at, offered_at)
  VALUES
    (p_business_id, v_number::text, 'confirmed', v_total, v_notes, v_name, v_delivery, v_payment, 'manual',
     p_scheduled_for, 'not_required', NULLIF(v_phone, ''),
     CASE WHEN v_delivery = 'delivery' THEN NULLIF(v_address, '') END,
     CASE WHEN v_zone_source = 'common' THEN v_zone_id END,
     CASE WHEN v_zone_source = 'own' THEN v_zone_id END,
     v_zone_name, v_price, v_price, v_coordinate,
     CASE WHEN v_courier_status = 'accepted' THEN v_courier END,
     v_courier_status,
     CASE WHEN v_courier_status IN ('accepted', 'self') THEN now() END,
     CASE WHEN v_courier_status = 'searching' THEN now() END)
  RETURNING id, code INTO v_order_id, v_code;

  INSERT INTO public.order_items
    (order_id, business_id, product_id, promotion_id, name, unit_price, quantity, sort_order, options, note, free)
  SELECT v_order_id,
         p_business_id,
         CASE WHEN l ->> 'kind' = 'product' THEN (l ->> 'id')::uuid END,
         CASE WHEN l ->> 'kind' = 'promo' THEN (l ->> 'id')::uuid END,
         l ->> 'name',
         (l ->> 'price')::numeric,
         (l ->> 'quantity')::integer,
         (l ->> 'position')::integer,
         CASE WHEN jsonb_typeof(l -> 'options') = 'array' THEN l -> 'options' END,
         l ->> 'note',
         l ->> 'kind' = 'free'
  FROM jsonb_array_elements(v_lines) AS l;

  -- La línea de tiempo de un pedido del menú recién confirmado: entró y el local lo aceptó.
  -- `clock_timestamp()` y no `now()`: dentro de una transacción `now()` es el mismo para todos y el
  -- orden de la línea de tiempo (`created_at, id`) quedaría librado al azar del id.
  INSERT INTO public.order_events (order_id, business_id, status, changed_by, created_at)
  VALUES (v_order_id, p_business_id, 'pending', v_uid, clock_timestamp());
  INSERT INTO public.order_events (order_id, business_id, status, changed_by, created_at)
  VALUES (v_order_id, p_business_id, 'confirmed', v_uid, clock_timestamp());

  IF v_courier_status = 'accepted' THEN
    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind, created_at)
    VALUES (v_order_id, p_business_id, 'confirmed', v_uid,
            'Envío asignado a ' || v_courier_name || ', ' || v_time, 'delivery', clock_timestamp());
  ELSIF v_courier_status = 'self' THEN
    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind, created_at)
    VALUES (v_order_id, p_business_id, 'confirmed', v_uid, 'Lo lleva el local, ' || v_time, 'delivery',
            clock_timestamp());
  END IF;

  RETURN jsonb_build_object('id', v_order_id, 'code', v_code, 'number', v_number, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_order(
  uuid, text, text, text, text, jsonb, timestamptz, text, uuid, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_order(
  uuid, text, text, text, text, jsonb, timestamptz, text, uuid, text, text, text
) TO authenticated;

-- El local carga (o corrige) el costo de un envío a coordinar. Guarda el precio también como precio de lista: si el
-- repartidor devuelve el pedido, el precio no se pierde.
CREATE OR REPLACE FUNCTION public.set_delivery_fee(p_order_id uuid, p_fee numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF p_fee IS NULL OR p_fee < 0 OR p_fee >= 100000000 THEN
    RAISE EXCEPTION 'El precio del envío no es válido' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.business_id, o.status, o.delivery_fee_coordinated
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
    )
  FOR UPDATE;

  -- Quien no es del negocio no se entera de que el pedido existe.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_order.delivery_fee_coordinated OR v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Este pedido no lleva un costo de envío a coordinar' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders
  SET delivery_fee = p_fee,
      delivery_fee_list = p_fee,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (p_order_id, v_order.business_id, v_order.status, v_uid,
          'Costo del envío: $' || trim(to_char(p_fee, 'FM999999990.00')) || ', ' || v_time, 'delivery');
END;
$$;

REVOKE ALL ON FUNCTION public.set_delivery_fee(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_delivery_fee(uuid, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Quién ve, asigna y oferta un pedido
-- ---------------------------------------------------------------------------

-- Misma `courier_sees_order` de `20261124000000_tipo_de_precio_del_envio.sql`: solo un repartidor libre de un negocio libre
-- ve un pedido que busca. Los pedidos de un negocio propio van directo a su repartidor y no pasan por acá.
CREATE OR REPLACE FUNCTION public.courier_sees_order(p_order_id uuid, p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.couriers c ON c.id = p_courier_id AND c.active AND c.courier_type = 'free'
    JOIN public.businesses b ON b.id = o.business_id AND b.delivery_type = 'free'
    WHERE o.id = p_order_id
      AND o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND o.payment_status NOT IN ('awaiting', 'failed')
      AND EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.courier_order_declines d
        WHERE d.order_id = o.id AND d.courier_id = p_courier_id
      )
      AND public.courier_vehicle_ok(o.business_id, c.moto, c.auto, o.needs_car)
      AND public.courier_terms_accepted(p_courier_id)
  );
$$;

REVOKE ALL ON FUNCTION public.courier_sees_order(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Misma `courier_blocked_by_car` de `20261124000000_tipo_de_precio_del_envio.sql`, con la misma regla.
CREATE OR REPLACE FUNCTION public.courier_blocked_by_car(p_order_id uuid, p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.couriers c ON c.id = p_courier_id AND c.active AND c.courier_type = 'free'
    JOIN public.businesses b ON b.id = o.business_id AND b.delivery_type = 'free'
    WHERE o.id = p_order_id
      AND o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND NOT public.courier_vehicle_ok(o.business_id, c.moto, c.auto, o.needs_car)
      AND EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.courier_blocked_by_car(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Misma `business_assign_courier` de `20261124000000_tipo_de_precio_del_envio.sql`: un negocio propio solo asigna a su
-- repartidor propio; uno libre, a un repartidor libre que cubra la zona.
CREATE OR REPLACE FUNCTION public.business_assign_courier(
  p_order_id uuid,
  p_courier_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.business_id, o.status, o.courier_status, o.delivery_zone_id, o.needs_car, b.delivery_type
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id
    AND EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
    )
  FOR UPDATE OF o;

  -- Quien no es del negocio no se entera de que el pedido existe.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.courier_status IS DISTINCT FROM 'searching' OR v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'El pedido no está buscando repartidor' USING ERRCODE = 'P0004';
  END IF;

  IF char_length(coalesce(v_note, '')) > 120 THEN
    RAISE EXCEPTION 'La nota admite hasta 120 caracteres' USING ERRCODE = '22023';
  END IF;

  SELECT c.name INTO v_name
  FROM public.couriers c
  WHERE c.id = p_courier_id
    AND c.active
    AND CASE
          WHEN v_order.delivery_type = 'own' THEN c.courier_type = 'own' AND c.own_business_id = v_order.business_id
          ELSE c.courier_type = 'free' AND EXISTS (
            SELECT 1 FROM public.courier_zone_coverage cc
            WHERE cc.courier_id = c.id AND cc.zone_id = v_order.delivery_zone_id
          )
        END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El repartidor no está activo o no cubre la zona del pedido' USING ERRCODE = '22023';
  END IF;

  IF v_order.delivery_type = 'free' AND NOT public.courier_terms_accepted(p_courier_id) THEN
    RAISE EXCEPTION 'El repartidor todavía no aceptó los términos para repartidores' USING ERRCODE = 'P0026';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = p_courier_id AND public.courier_vehicle_ok(v_order.business_id, c.moto, c.auto, v_order.needs_car)
  ) THEN
    RAISE EXCEPTION 'Este pedido necesita un vehículo que el repartidor no tiene' USING ERRCODE = 'P0024';
  END IF;

  UPDATE public.orders
  SET courier_id = p_courier_id,
      courier_status = 'accepted',
      courier_note = v_note,
      courier_responded_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.courier_offers SET closed_at = now() WHERE order_id = p_order_id AND closed_at IS NULL;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Envío asignado a ' || v_name || coalesce(': ' || v_note, '') || ', ' || v_time,
    'delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_assign_courier(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_assign_courier(uuid, uuid, text) TO authenticated;

-- Misma `order_pulse_audience` de `20261124000000_tipo_de_precio_del_envio.sql`, sin las zonas propias del repartidor: el
-- repartidor propio se entera cuando se le asigna el pedido (`courier_id`).
CREATE OR REPLACE FUNCTION public.order_pulse_audience(p_order_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT a.id), '{}'::uuid[])
  FROM (
    SELECT o.courier_id AS id
    FROM public.orders o
    WHERE o.id = p_order_id AND o.courier_id IS NOT NULL
    UNION
    SELECT cc.courier_id
    FROM public.orders o
    JOIN public.courier_zone_coverage cc ON cc.zone_id = o.delivery_zone_id
    WHERE o.id = p_order_id AND public.courier_sees_order(o.id, cc.courier_id)
    UNION
    SELECT f.courier_id
    FROM public.courier_offers f
    WHERE f.order_id = p_order_id
  ) a
$$;

REVOKE ALL ON FUNCTION public.order_pulse_audience(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_pulse_couriers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Un pedido sin envío con repartidor no le importa a ninguno.
  IF NEW.delivery_zone_id IS NULL AND NEW.courier_id IS NULL AND OLD.courier_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.pulse_couriers(
    NEW.id,
    public.order_pulse_audience(NEW.id) || ARRAY[OLD.courier_id]
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_pulse_couriers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_pulse_couriers_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.delivery_zone_id IS NOT NULL OR NEW.courier_id IS NOT NULL THEN
    PERFORM public.pulse_couriers(NEW.id, public.order_pulse_audience(NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_pulse_couriers_insert() FROM PUBLIC, anon, authenticated;

-- Misma `courier_make_offer` de `20261124000000_tipo_de_precio_del_envio.sql`, sin el interruptor de ofertas con otro
-- precio: cambiar el precio siempre exige un motivo.
CREATE OR REPLACE FUNCTION public.courier_make_offer(
  p_order_id uuid,
  p_price numeric,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_list numeric;
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF p_price IS NULL OR p_price < 0 OR p_price >= 100000000 THEN
    RAISE EXCEPTION 'El precio del envío no es válido' USING ERRCODE = '22023';
  END IF;

  IF NOT public.courier_terms_accepted(v_courier) THEN
    RAISE EXCEPTION 'Tenés que aceptar los términos para repartidores' USING ERRCODE = 'P0025';
  END IF;

  -- Si ya pasó el tiempo, el pedido se resuelve primero: una oferta tardía no cambia lo elegido.
  PERFORM public.settle_courier_offers(p_order_id);

  IF public.courier_blocked_by_car(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'Este pedido necesita auto' USING ERRCODE = 'P0024';
  END IF;

  IF NOT public.courier_sees_order(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'El pedido ya no recibe ofertas' USING ERRCODE = 'P0020';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.delivery_mode = 'fixed') THEN
    RAISE EXCEPTION 'Este pedido no acepta ofertas' USING ERRCODE = 'P0023';
  END IF;

  SELECT o.delivery_fee_list INTO v_list FROM public.orders o WHERE o.id = p_order_id;

  IF p_price IS DISTINCT FROM v_list THEN
    IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 3 AND 140 THEN
      RAISE EXCEPTION 'Cambiar el precio del envío exige un motivo (de 3 a 140 caracteres)'
        USING ERRCODE = 'P0021';
    END IF;
  ELSE
    v_reason := NULL;
  END IF;

  INSERT INTO public.courier_offers (order_id, courier_id, price, reason)
  VALUES (p_order_id, v_courier, p_price, v_reason)
  ON CONFLICT (order_id, courier_id) DO UPDATE
  SET price = excluded.price,
      reason = excluded.reason,
      closed_at = NULL,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.courier_make_offer(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_make_offer(uuid, numeric, text) TO authenticated;

-- Misma `courier_available_orders` de `20261125000000_otro_precio_en_disponibles.sql`, sin `otro_precio`.
CREATE OR REPLACE FUNCTION public.courier_available_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  -- Sin aceptar los términos vigentes no ve ningún pedido (ENVIO-182).
  IF NOT public.courier_terms_accepted(v_courier) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Lo vencido se resuelve antes de leer.
  PERFORM public.settle_due_courier_offers();

  RETURN coalesce((
    SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.id,
               'numero', o.order_number,
               'estado', o.status,
               'modo', o.delivery_mode,
               'creado', o.created_at,
               'ofrecido_el', o.offered_at,
               'listo_a', public.order_ready_at(o),
               'demora_min', public.order_prep_minutes(o),
               'programado', o.scheduled_for,
               'anticipado', o.preorder,
               'necesita_auto', (o.needs_car AND public.vehicle_enabled()),
               'negocio', jsonb_build_object('nombre', b.name, 'direccion', s.address),
               'total', o.total,
               'pago', o.payment,
               'pago_estado', o.payment_status,
               'envio', jsonb_build_object(
                 'zona', o.delivery_zone_name,
                 'precio_lista', o.delivery_fee_list
               ),
               'ofertas', (
                 SELECT count(*) FROM public.courier_offers f
                 WHERE f.order_id = o.id AND f.closed_at IS NULL
               ),
               'mi_oferta', (
                 SELECT jsonb_build_object(
                          'id', f.id, 'precio', f.price, 'motivo', f.reason, 'creada', f.created_at
                        )
                 FROM public.courier_offers f
                 WHERE f.order_id = o.id AND f.courier_id = v_courier AND f.closed_at IS NULL
               ),
               'resultado', CASE
                 WHEN o.courier_status = 'searching' AND o.status NOT IN ('delivered', 'cancelled') THEN NULL
                 WHEN o.status = 'cancelled' THEN 'cancelled'
                 WHEN o.courier_status = 'accepted' THEN 'chosen_other'
                 ELSE 'closed'
               END,
               'cerrado_el', (
                 SELECT f.closed_at FROM public.courier_offers f
                 WHERE f.order_id = o.id AND f.courier_id = v_courier
               )
             )
             ORDER BY o.offered_at, o.id
           )
    FROM public.orders o
    JOIN public.businesses b ON b.id = o.business_id
    LEFT JOIN public.business_settings s ON s.business_id = b.id
    WHERE public.courier_sees_order(o.id, v_courier)
       OR EXISTS (
         SELECT 1 FROM public.courier_offers f
         WHERE f.order_id = o.id
           AND f.courier_id = v_courier
           AND f.closed_at IS NOT NULL
           AND f.closed_at > now() - public.courier_offers_notice_window()
           AND o.courier_id IS DISTINCT FROM v_courier
       )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_available_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_available_orders() TO authenticated;

-- Misma `courier_orders` de `20261105000000_circuito_de_tiempos.sql`, más `precio_pendiente` en el envío.
CREATE OR REPLACE FUNCTION public.courier_orders(
  p_since timestamptz DEFAULT now() - interval '2 days'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.id,
               'numero', o.order_number,
               'estado', o.status,
               'creado', o.created_at,
               'programado', o.scheduled_for,
               'anticipado', o.preorder,
               'negocio', jsonb_build_object(
                 'nombre', b.name,
                 'direccion', s.address,
                 'whatsapp', b.whatsapp
               ),
               'cliente', jsonb_build_object(
                 'nombre', o.customer_name,
                 'telefono', o.customer_phone,
                 'direccion', o.delivery_address
               ),
               'total', o.total,
               'pago', o.payment,
               'pago_estado', o.payment_status,
               'notas', o.notes,
               'items', coalesce((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'nombre', i.name,
                            'cantidad', i.quantity,
                            'precio', i.unit_price,
                            'opciones', i.options,
                            'nota', i.note
                          )
                          ORDER BY i.sort_order, i.id
                        )
                 FROM public.order_items i
                 WHERE i.order_id = o.id
               ), '[]'::jsonb),
               'envio', jsonb_build_object(
                 'zona', o.delivery_zone_name,
                 'precio_lista', o.delivery_fee_list,
                 'precio', o.delivery_fee,
                 'precio_pendiente', (o.delivery_fee_coordinated AND o.delivery_fee IS NULL),
                 'motivo_cambio', o.delivery_fee_reason,
                 'cambiado_el', o.delivery_fee_changed_at,
                 'estado', o.courier_status,
                 'nota', o.courier_note,
                 'consultado_el', o.courier_requested_at,
                 'respondido_el', o.courier_responded_at
               ),
               'tiempos', jsonb_build_object(
                 'listo_a', public.order_ready_at(o),
                 'demora_min', public.order_prep_minutes(o),
                 'listo_antes', o.ready_was_at,
                 'llega_local_a', o.courier_eta_pickup_at,
                 'llega_cliente_a', o.courier_eta_dropoff_at
               ),
               'rendicion', jsonb_build_object(
                 'rendido_el', o.settled_at,
                 'recibido_el', o.settlement_received_at
               )
             )
             ORDER BY o.created_at DESC, o.id
           )
    FROM public.orders o
    JOIN public.businesses b ON b.id = o.business_id
    LEFT JOIN public.business_settings s ON s.business_id = b.id
    WHERE o.courier_id = v_courier
      AND (
        o.created_at >= p_since
        OR o.status NOT IN ('delivered', 'cancelled')
        -- Una rendición sin cerrar no desaparece del panel por ser vieja.
        OR (o.status = 'delivered' AND o.payment = 'efectivo' AND o.settlement_received_at IS NULL)
      )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_orders(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_orders(timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- Disponibilidad: solo repartidores libres, y nada para un negocio propio
-- ---------------------------------------------------------------------------

-- Misma `zone_available_couriers` de `20261119000000_vehiculos_del_negocio.sql`, solo con repartidores libres.
CREATE OR REPLACE FUNCTION public.zone_available_couriers(p_zone_id uuid, p_business_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.courier_zone_coverage cc
  JOIN public.couriers c ON c.id = cc.courier_id AND c.courier_type = 'free'
  WHERE cc.zone_id = p_zone_id
    AND public.courier_available_now(cc.courier_id)
    AND (p_business_id IS NULL OR public.courier_vehicle_ok(p_business_id, c.moto, c.auto, false))
$$;

REVOKE ALL ON FUNCTION public.zone_available_couriers(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Misma `business_courier_availability` de `20261119000000_vehiculos_del_negocio.sql`: un negocio propio no tiene
-- disponibilidad de la red (`enabled` falso) y solo cuentan repartidores libres.
CREATE OR REPLACE FUNCTION public.business_courier_availability(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_users bu WHERE bu.user_id = v_uid AND bu.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'No tenés acceso a ese negocio' USING ERRCODE = '42501';
  END IF;

  IF NOT public.courier_availability_enabled()
     OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id AND b.delivery_type = 'own') THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  RETURN jsonb_build_object(
    'enabled', true,
    'total', (
      SELECT count(DISTINCT cc.courier_id)::integer
      FROM public.business_delivery_zones bz
      JOIN public.courier_zone_coverage cc ON cc.zone_id = bz.zone_id
      WHERE bz.business_id = p_business_id
        AND public.courier_available_now(cc.courier_id)
        AND EXISTS (
          SELECT 1 FROM public.couriers c
          WHERE c.id = cc.courier_id
            AND c.courier_type = 'free'
            AND public.courier_vehicle_ok(p_business_id, c.moto, c.auto, false)
        )
    ),
    -- Las zonas del local y las de sus pedidos todavía sin repartidor (aunque ya no envíe a esa zona).
    'empty_zone_ids', coalesce((
      SELECT jsonb_agg(z.zone_id ORDER BY z.zone_id)
      FROM (
        SELECT bz.zone_id FROM public.business_delivery_zones bz WHERE bz.business_id = p_business_id
        UNION
        SELECT o.delivery_zone_id
        FROM public.orders o
        WHERE o.business_id = p_business_id
          AND o.delivery_zone_id IS NOT NULL
          AND o.courier_id IS NULL
          AND o.courier_status IN ('waiting', 'searching')
          AND o.status NOT IN ('delivered', 'cancelled')
      ) z
      WHERE public.zone_available_couriers(z.zone_id, p_business_id) = 0
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_courier_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_courier_availability(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seguimiento: el costo del envío a confirmar
-- ---------------------------------------------------------------------------

-- Misma `public_order_delivery` de `20261113000000_vehiculo_del_repartidor.sql`, más `precio_pendiente`.
CREATE OR REPLACE FUNCTION public.public_order_delivery(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_offers jsonb;
  v_deadline timestamptz;
  v_prefs jsonb;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  PERFORM public.settle_courier_offers(o.id) FROM public.orders o WHERE o.code = p_code;

  SELECT o.id, c.name AS courier_name, c.whatsapp AS courier_whatsapp, o.delivery_zone_name,
         o.delivery_fee_list, o.delivery_fee, o.delivery_fee_reason, o.courier_status, o.courier_note,
         o.business_id, o.status, o.delivery_mode, o.courier_eta_dropoff_at, o.courier_id,
         (o.delivery_fee_coordinated AND o.delivery_fee IS NULL) AS fee_pending
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code
    AND o.courier_status IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_order.courier_status = 'searching'
     AND v_order.status NOT IN ('delivered', 'cancelled')
     AND v_order.delivery_mode IS DISTINCT FROM 'fixed' THEN
    SELECT coalesce(jsonb_agg(
             jsonb_build_object(
               'id', x.id,
               'repartidor', x.name,
               'precio', x.price,
               'motivo', x.reason,
               'favorito', x.favorite,
               'vehiculo', x.vehicle
             )
             ORDER BY x.favorite DESC, x.price ASC, x.created_at ASC, x.id ASC
           ), '[]'::jsonb)
    INTO v_offers
    FROM (
      SELECT f.id, c.name, f.price, f.reason, f.created_at,
             (f.courier_id IS NOT DISTINCT FROM public.effective_favorite_courier(v_order.business_id)) AS favorite,
             public.courier_vehicles(f.courier_id) AS vehicle
      FROM public.courier_offers f
      JOIN public.couriers c ON c.id = f.courier_id AND c.active
      WHERE f.order_id = v_order.id AND f.closed_at IS NULL
    ) x;

    v_deadline := public.courier_offers_deadline(v_order.id);
  END IF;

  -- Lo que el repartidor dejó dicho (SEGUIMIENTO-47): solo del que tiene asignado este pedido, nunca mientras
  -- se busca, solo mientras el pedido sigue abierto (el link del seguimiento queda en manos del cliente: un
  -- texto que el repartidor cambie después no se tiene que ver en un pedido cerrado) y solo si marcó algo.
  IF v_order.courier_id IS NOT NULL
     AND v_order.courier_status NOT IN ('waiting', 'searching')
     AND v_order.status NOT IN ('delivered', 'cancelled') THEN
    SELECT jsonb_build_object(
             'compras_en_camino', p.shops_on_the_way,
             'busca_pedidos', p.seeks_orders,
             'texto', p.note
           )
    INTO v_prefs
    FROM public.courier_preferences p
    WHERE p.courier_id = v_order.courier_id
      AND (p.shops_on_the_way OR p.seeks_orders OR p.note IS NOT NULL);
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_order.courier_name,
    'whatsapp', v_order.courier_whatsapp,
    'vehiculo', CASE WHEN v_order.courier_id IS NOT NULL THEN public.courier_vehicles(v_order.courier_id) END,
    'zona', v_order.delivery_zone_name,
    'precio_lista', v_order.delivery_fee_list,
    'precio', v_order.delivery_fee,
    'precio_pendiente', CASE WHEN v_order.fee_pending THEN true END,
    'motivo_cambio', v_order.delivery_fee_reason,
    'estado', v_order.courier_status,
    'modo', v_order.delivery_mode,
    'nota', v_order.courier_note,
    'llega_a', CASE WHEN v_order.status IN ('handed_to_courier', 'on_the_way') THEN v_order.courier_eta_dropoff_at END,
    'preferencias', v_prefs,
    'ofertas', v_offers,
    'cierra_en', v_deadline
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ven los paneles
-- ---------------------------------------------------------------------------

-- Para Configuración → Envíos (el local) y el detalle del negocio (el superadmin): el tipo de envío, el repartidor propio y
-- cuántas zonas con precio tiene cargadas.
CREATE OR REPLACE FUNCTION public.business_own_delivery(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_type text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (select public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.business_users bu WHERE bu.user_id = v_uid AND bu.business_id = p_business_id
    )
  ) THEN
    RAISE EXCEPTION 'No tenés acceso a ese negocio' USING ERRCODE = '42501';
  END IF;

  SELECT b.delivery_type INTO v_type FROM public.businesses b WHERE b.id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El negocio no existe' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'delivery_type', v_type,
    'courier', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name, 'active', c.active)
      FROM public.couriers c
      WHERE c.courier_type = 'own' AND c.own_business_id = p_business_id
      ORDER BY c.active DESC, c.name, c.id
      LIMIT 1
    ),
    'zones_with_price', (
      SELECT count(*) FROM public.business_own_zones z
      WHERE z.business_id = p_business_id AND z.active AND z.price IS NOT NULL
    ),
    'zones_total', (SELECT count(*) FROM public.business_own_zones z WHERE z.business_id = p_business_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_own_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_own_delivery(uuid) TO authenticated;

-- Para el panel del repartidor propio: su negocio y sus zonas, en solo lectura. Nulo si no es repartidor propio.
CREATE OR REPLACE FUNCTION public.courier_own_business()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_business uuid;
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  SELECT c.own_business_id INTO v_business
  FROM public.couriers c
  WHERE c.id = v_courier AND c.courier_type = 'own';

  IF v_business IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'business', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.businesses b WHERE b.id = v_business),
    'zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('id', z.id, 'name', z.name, 'price', z.price, 'active', z.active)
               ORDER BY z.sort_order, z.name
             )
      FROM public.business_own_zones z
      WHERE z.business_id = v_business
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_own_business() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_own_business() TO authenticated;

-- ---------------------------------------------------------------------------
-- Se elimina el modelo de las tareas 47 y 48
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.business_delivery_pricing(uuid);
DROP FUNCTION IF EXISTS public.superadmin_set_favorite_courier(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.default_courier_id();

DROP TRIGGER IF EXISTS couriers_guard_can_edit_zones ON public.couriers;
DROP FUNCTION IF EXISTS public.guard_courier_can_edit_zones();

ALTER TABLE public.orders DROP COLUMN IF EXISTS courier_zone_id;

DROP TABLE IF EXISTS public.business_zone_prices;
DROP TABLE IF EXISTS public.courier_own_zones;

DROP FUNCTION IF EXISTS public.can_edit_business_prices(uuid);
DROP FUNCTION IF EXISTS public.courier_can_edit_own_zones(uuid);
DROP FUNCTION IF EXISTS public.guard_own_zone_delete();

ALTER TABLE public.couriers DROP COLUMN IF EXISTS can_edit_zones;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_delivery_pricing_check;
ALTER TABLE public.businesses
  DROP COLUMN IF EXISTS delivery_pricing,
  DROP COLUMN IF EXISTS delivery_prices_editable,
  DROP COLUMN IF EXISTS delivery_offers_enabled;
