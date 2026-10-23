-- Tipo de precio del envío por negocio (ENVIO-219 a 228).
--
-- Cada negocio usa uno de tres tipos de precio (`businesses.delivery_pricing`), que solo cambia el superadmin:
--   - `common`:   las zonas comunes con su precio de referencia (como hasta hoy).
--   - `business`: las mismas zonas comunes con el precio que carga el negocio (`business_zone_prices`; si falta
--                 la fila de una zona, vale el precio común).
--   - `courier`:  las zonas y precios propios del favorito efectivo del negocio (`courier_own_zones`).
--
-- Decisiones:
--   - `delivery_zones_for_business()` es el único lugar que resuelve las zonas de un negocio. La usan
--     `public_delivery_zones`, `create_public_order` y `create_manual_order`.
--   - Un pedido con zona del repartidor guarda `orders.courier_zone_id` (y `delivery_zone_id` queda vacío), más el
--     nombre en `delivery_zone_name`. Así `delivery_zone_id` sigue apuntando solo a `delivery_zones`.
--   - Con `courier` ve, toma y oferta el pedido solo el dueño de la zona (el favorito): no depende de la cobertura
--     de zonas comunes. Por eso `courier_sees_order`, `courier_blocked_by_car`, `business_assign_courier` y el pulso
--     aceptan también "es el dueño de la zona".
--   - `delivery_offers_enabled`: apagado, `courier_make_offer` solo acepta el precio de lista (P0028).
--
-- Las migraciones anteriores no se tocan: cada función de abajo es la última versión con el cambio indicado.

-- ---------------------------------------------------------------------------
-- Columnas de negocio y repartidor
-- ---------------------------------------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS delivery_pricing text NOT NULL DEFAULT 'common',
  ADD COLUMN IF NOT EXISTS delivery_prices_editable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_offers_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_delivery_pricing_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_delivery_pricing_check CHECK (delivery_pricing IN ('common', 'business', 'courier'));

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS can_edit_zones boolean NOT NULL DEFAULT false;

-- Misma `guard_business_admin_columns` de `20261026000000_mercadopago_oauth.sql`, con las columnas nuevas.
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
       OR new.delivery_pricing IS DISTINCT FROM old.delivery_pricing
       OR new.delivery_prices_editable IS DISTINCT FROM old.delivery_prices_editable
       OR new.delivery_offers_enabled IS DISTINCT FROM old.delivery_offers_enabled
     )
  THEN
    RAISE EXCEPTION 'Solo un superadmin puede cambiar el plan o el estado del negocio'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

-- Solo el superadmin cambia el permiso de un repartidor para editar sus zonas. Hoy `couriers` solo la escribe el
-- superadmin por RLS; la guarda deja el permiso protegido aunque algún día se abra la escritura.
CREATE OR REPLACE FUNCTION public.guard_courier_can_edit_zones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated')
     AND NOT public.is_super_admin()
     AND new.can_edit_zones IS DISTINCT FROM old.can_edit_zones
  THEN
    RAISE EXCEPTION 'Solo un superadmin puede dar el permiso de editar zonas' USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_courier_can_edit_zones() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS couriers_guard_can_edit_zones ON public.couriers;
CREATE TRIGGER couriers_guard_can_edit_zones
  BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.guard_courier_can_edit_zones();

-- ---------------------------------------------------------------------------
-- Precios del negocio por zona común
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_zone_prices (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  price numeric(10,2) NOT NULL CHECK (price >= 0 AND price < 100000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, zone_id)
);

ALTER TABLE public.business_zone_prices ENABLE ROW LEVEL SECURITY;

-- ¿Puede la sesión cargar los precios de este negocio? Es miembro, el tipo es `business` y el superadmin le dio
-- el permiso. SECURITY DEFINER para no depender de que las políticas de `businesses` la dejen leer la fila.
CREATE OR REPLACE FUNCTION public.can_edit_business_prices(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    JOIN public.business_users bu ON bu.business_id = b.id
    WHERE b.id = p_business_id
      AND bu.user_id = (select auth.uid())
      AND b.delivery_pricing = 'business'
      AND b.delivery_prices_editable
  )
$$;

REVOKE ALL ON FUNCTION public.can_edit_business_prices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_business_prices(uuid) TO authenticated;

DROP POLICY IF EXISTS business_zone_prices_all_super_admin ON public.business_zone_prices;
CREATE POLICY business_zone_prices_all_super_admin
ON public.business_zone_prices
FOR ALL TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS business_zone_prices_select_member ON public.business_zone_prices;
CREATE POLICY business_zone_prices_select_member
ON public.business_zone_prices
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid()) AND bu.business_id = business_zone_prices.business_id
  )
);

DROP POLICY IF EXISTS business_zone_prices_insert_editor ON public.business_zone_prices;
CREATE POLICY business_zone_prices_insert_editor
ON public.business_zone_prices
FOR INSERT TO authenticated
WITH CHECK ((select public.can_edit_business_prices(business_zone_prices.business_id)));

DROP POLICY IF EXISTS business_zone_prices_update_editor ON public.business_zone_prices;
CREATE POLICY business_zone_prices_update_editor
ON public.business_zone_prices
FOR UPDATE TO authenticated
USING ((select public.can_edit_business_prices(business_zone_prices.business_id)))
WITH CHECK ((select public.can_edit_business_prices(business_zone_prices.business_id)));

DROP POLICY IF EXISTS business_zone_prices_delete_editor ON public.business_zone_prices;
CREATE POLICY business_zone_prices_delete_editor
ON public.business_zone_prices
FOR DELETE TO authenticated
USING ((select public.can_edit_business_prices(business_zone_prices.business_id)));

REVOKE ALL ON public.business_zone_prices FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_zone_prices TO authenticated;

-- ---------------------------------------------------------------------------
-- Zonas propias del repartidor
-- ---------------------------------------------------------------------------

-- RLS por `courier_id`, no por `business_id`: la zona es del repartidor, que no tiene negocio (mismo criterio que
-- `courier_preferences`).
CREATE TABLE IF NOT EXISTS public.courier_own_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  price numeric(10,2) NOT NULL CHECK (price >= 0 AND price < 100000000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS courier_own_zones_name_idx
  ON public.courier_own_zones (courier_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS courier_own_zones_order_idx
  ON public.courier_own_zones (courier_id, sort_order, name);

ALTER TABLE public.courier_own_zones ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.courier_can_edit_own_zones(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_courier_id IS NOT NULL
    AND p_courier_id IS NOT DISTINCT FROM public.my_courier_id()
    AND EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = p_courier_id AND c.can_edit_zones)
$$;

REVOKE ALL ON FUNCTION public.courier_can_edit_own_zones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_can_edit_own_zones(uuid) TO authenticated;

DROP POLICY IF EXISTS courier_own_zones_all_super_admin ON public.courier_own_zones;
CREATE POLICY courier_own_zones_all_super_admin
ON public.courier_own_zones
FOR ALL TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS courier_own_zones_select_own ON public.courier_own_zones;
CREATE POLICY courier_own_zones_select_own
ON public.courier_own_zones
FOR SELECT TO authenticated
USING (courier_id = (select public.my_courier_id()));

DROP POLICY IF EXISTS courier_own_zones_insert_own ON public.courier_own_zones;
CREATE POLICY courier_own_zones_insert_own
ON public.courier_own_zones
FOR INSERT TO authenticated
WITH CHECK ((select public.courier_can_edit_own_zones(courier_own_zones.courier_id)));

DROP POLICY IF EXISTS courier_own_zones_update_own ON public.courier_own_zones;
CREATE POLICY courier_own_zones_update_own
ON public.courier_own_zones
FOR UPDATE TO authenticated
USING ((select public.courier_can_edit_own_zones(courier_own_zones.courier_id)))
WITH CHECK ((select public.courier_can_edit_own_zones(courier_own_zones.courier_id)));

DROP POLICY IF EXISTS courier_own_zones_delete_own ON public.courier_own_zones;
CREATE POLICY courier_own_zones_delete_own
ON public.courier_own_zones
FOR DELETE TO authenticated
USING ((select public.courier_can_edit_own_zones(courier_own_zones.courier_id)));

REVOKE ALL ON public.courier_own_zones FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_own_zones TO authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_zone_id uuid REFERENCES public.courier_own_zones(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Las zonas de un negocio, en un solo lugar
-- ---------------------------------------------------------------------------

-- `zone_id` es el id de `delivery_zones` (`source = 'common'`) o de `courier_own_zones` (`source = 'courier'`): como
-- son uuid, el menú manda ese id y nunca hay choque. `price_fixed`: el precio no cambia si la plataforma reparte
-- "al primero que toma" (`fixed`) o el negocio apagó las ofertas con otro precio.
CREATE OR REPLACE FUNCTION public.delivery_zones_for_business(p_business_id uuid)
RETURNS TABLE (zone_id uuid, source text, zone_name text, price numeric, price_fixed boolean, zone_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH b AS (
    SELECT bz.id,
           bz.delivery_pricing AS pricing,
           (public.effective_delivery_mode(bz.id) = 'fixed' OR NOT bz.delivery_offers_enabled) AS is_fixed,
           public.effective_favorite_courier(bz.id) AS favorite
    FROM public.businesses bz
    WHERE bz.id = p_business_id
  )
  SELECT z.id, 'common'::text, z.name,
         coalesce(CASE WHEN b.pricing = 'business' THEN bp.price END, z.price),
         b.is_fixed, z.sort_order
  FROM b
  JOIN public.business_delivery_zones bd ON bd.business_id = b.id
  JOIN public.delivery_zones z ON z.id = bd.zone_id AND z.active
  LEFT JOIN public.business_zone_prices bp ON bp.business_id = b.id AND bp.zone_id = z.id
  WHERE b.pricing IN ('common', 'business')
    AND EXISTS (
      SELECT 1
      FROM public.courier_zone_coverage cc
      JOIN public.couriers c ON c.id = cc.courier_id AND c.active
      WHERE cc.zone_id = z.id
    )
  UNION ALL
  SELECT cz.id, 'courier'::text, cz.name, cz.price, b.is_fixed, cz.sort_order
  FROM b
  JOIN public.couriers c ON c.id = b.favorite AND c.active
  JOIN public.courier_own_zones cz ON cz.courier_id = c.id AND cz.active
  WHERE b.pricing = 'courier'
$$;

REVOKE ALL ON FUNCTION public.delivery_zones_for_business(uuid) FROM PUBLIC, anon, authenticated;

-- Misma `public_delivery_zones` de `20261022000000_busqueda_de_repartidor.sql`, con las zonas del tipo de precio y
-- `fijo` por zona. Es nula si el local no tiene ninguna zona disponible.
CREATE OR REPLACE FUNCTION public.public_delivery_zones(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_zones jsonb;
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

  SELECT jsonb_agg(
           jsonb_build_object('id', r.zone_id, 'nombre', r.zone_name, 'precio', r.price, 'fijo', r.price_fixed)
           ORDER BY r.zone_order, r.zone_name
         )
  INTO v_zones
  FROM public.delivery_zones_for_business(v_business_id) r;

  -- Sin ninguna zona disponible, el local no ofrece envío con repartidor.
  IF v_zones IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('zonas', v_zones);
END;
$$;

REVOKE ALL ON FUNCTION public.public_delivery_zones(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_delivery_zones(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos: la zona sale de la función única
-- ---------------------------------------------------------------------------

-- Misma `create_public_order` de `20261105000000_circuito_de_tiempos.sql`. Cambia una cosa: el barrio se valida
-- y se precia con `delivery_zones_for_business`, y con zona del repartidor se guarda `courier_zone_id`.
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
    IF p_delivery_zone IS NULL THEN
      RAISE EXCEPTION 'Elegí el barrio del envío' USING ERRCODE = 'P0016';
    END IF;

    SELECT r.zone_id, r.source, r.zone_name, r.price
    INTO v_zone_id, v_zone_source, v_zone_name, v_price
    FROM public.delivery_zones_for_business(v_business_id) r
    WHERE r.zone_id = p_delivery_zone;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
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
    UPDATE public.orders
    SET courier_id = NULL,
        delivery_zone_id = CASE WHEN v_zone_source = 'common' THEN v_zone_id END,
        courier_zone_id = CASE WHEN v_zone_source = 'courier' THEN v_zone_id END,
        delivery_zone_name = v_zone_name,
        delivery_fee_list = v_price,
        delivery_fee = v_price,
        customer_phone = v_phone,
        delivery_address = v_address,
        courier_status = 'waiting',
        offered_at = NULL
    WHERE code = v_result ->> 'code';

    v_result := v_result || jsonb_build_object('delivery_fee', v_price);
  ELSE
    UPDATE public.orders
    SET customer_phone = v_phone
    WHERE code = v_result ->> 'code';
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

-- Misma `create_manual_order` de `20261101000000_pedido_manual_en_el_circuito.sql`. Cambia el barrio (viene de
-- `delivery_zones_for_business`) y que el favorito elegido sea el dueño de la zona cuando es del repartidor.
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
  p_courier_mode text DEFAULT NULL
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
  v_delivery_options text[] := ARRAY['delivery', 'retiro']::text[];
  v_payment_options text[] := ARRAY['efectivo', 'transferencia', 'tarjeta']::text[];
  v_courier_delivery boolean;
  v_with_courier boolean;
  v_zone_id uuid;
  v_zone_source text;
  v_zone_name text;
  v_price numeric;
  v_favorite uuid;
  v_favorite_name text;
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
         coalesce(s.delivery_options, v_delivery_options),
         coalesce(s.payment_options, v_payment_options)
  INTO v_courier_delivery, v_delivery_options, v_payment_options
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
    IF p_delivery_zone IS NULL THEN
      RAISE EXCEPTION 'Elegí el barrio del envío' USING ERRCODE = 'P0016';
    END IF;

    SELECT r.zone_id, r.source, r.zone_name, r.price
    INTO v_zone_id, v_zone_source, v_zone_name, v_price
    FROM public.delivery_zones_for_business(p_business_id) r
    WHERE r.zone_id = p_delivery_zone;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
    END IF;

    IF char_length(v_address) NOT BETWEEN 5 AND 200 THEN
      RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
    END IF;

    IF v_mode IS NULL OR v_mode NOT IN ('favorite', 'offers', 'self') THEN
      RAISE EXCEPTION 'Elegí cómo se resuelve el envío' USING ERRCODE = '22023';
    END IF;

    IF v_mode = 'favorite' THEN
      v_favorite := public.effective_favorite_courier(p_business_id);

      -- Zona común: el favorito tiene que cubrirla. Zona del repartidor: el favorito tiene que ser su dueño.
      SELECT c.name INTO v_favorite_name
      FROM public.couriers c
      WHERE c.id = v_favorite
        AND c.active
        AND CASE
              WHEN v_zone_source = 'courier' THEN EXISTS (
                SELECT 1 FROM public.courier_own_zones cz WHERE cz.id = v_zone_id AND cz.courier_id = c.id
              )
              ELSE EXISTS (
                SELECT 1 FROM public.courier_zone_coverage cc WHERE cc.courier_id = c.id AND cc.zone_id = v_zone_id
              )
            END;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tu repartidor favorito no está disponible para ese barrio' USING ERRCODE = 'P0016';
      END IF;
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
    WHEN v_mode = 'self' THEN 'self'
    ELSE 'searching'
  END;

  INSERT INTO public.orders
    (business_id, order_number, status, total, notes, customer_name, delivery, payment, source,
     scheduled_for, payment_status, customer_phone, delivery_address,
     delivery_zone_id, courier_zone_id, delivery_zone_name, delivery_fee_list, delivery_fee,
     courier_id, courier_status, courier_responded_at, offered_at)
  VALUES
    (p_business_id, v_number::text, 'confirmed', v_total, v_notes, v_name, v_delivery, v_payment, 'manual',
     p_scheduled_for, 'not_required', NULLIF(v_phone, ''),
     CASE WHEN v_delivery = 'delivery' THEN NULLIF(v_address, '') END,
     CASE WHEN v_zone_source = 'common' THEN v_zone_id END,
     CASE WHEN v_zone_source = 'courier' THEN v_zone_id END,
     v_zone_name, v_price, v_price,
     CASE WHEN v_mode = 'favorite' AND v_with_courier THEN v_favorite END,
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
            'Envío asignado a ' || v_favorite_name || ', ' || v_time, 'delivery', clock_timestamp());
  ELSIF v_courier_status = 'self' THEN
    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind, created_at)
    VALUES (v_order_id, p_business_id, 'confirmed', v_uid, 'Lo lleva el local, ' || v_time, 'delivery',
            clock_timestamp());
  END IF;

  RETURN jsonb_build_object('id', v_order_id, 'code', v_code, 'number', v_number, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_order(
  uuid, text, text, text, text, jsonb, timestamptz, text, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_order(
  uuid, text, text, text, text, jsonb, timestamptz, text, uuid, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Quién ve, asigna y oferta un pedido con zona del repartidor
-- ---------------------------------------------------------------------------

-- Misma `courier_sees_order` de `20261119000000_vehiculos_del_negocio.sql`: la cobertura de la zona común se
-- cambia por "cubre la zona común, o es el dueño de la zona propia".
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
    JOIN public.couriers c ON c.id = p_courier_id AND c.active
    WHERE o.id = p_order_id
      AND o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND o.payment_status NOT IN ('awaiting', 'failed')
      AND (
        EXISTS (
          SELECT 1 FROM public.courier_zone_coverage cc
          WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
        )
        OR EXISTS (
          SELECT 1 FROM public.courier_own_zones cz
          WHERE cz.id = o.courier_zone_id AND cz.courier_id = p_courier_id
        )
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

-- Misma `courier_blocked_by_car` de `20261119000000_vehiculos_del_negocio.sql`, con la misma regla de zona.
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
    JOIN public.couriers c ON c.id = p_courier_id AND c.active
    WHERE o.id = p_order_id
      AND o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND NOT public.courier_vehicle_ok(o.business_id, c.moto, c.auto, o.needs_car)
      AND (
        EXISTS (
          SELECT 1 FROM public.courier_zone_coverage cc
          WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
        )
        OR EXISTS (
          SELECT 1 FROM public.courier_own_zones cz
          WHERE cz.id = o.courier_zone_id AND cz.courier_id = p_courier_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.courier_blocked_by_car(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Misma `business_assign_courier` de `20261119000000_vehiculos_del_negocio.sql`, con la misma regla de zona.
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

  SELECT o.id, o.business_id, o.status, o.courier_status, o.delivery_zone_id, o.courier_zone_id, o.needs_car
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
    AND (
      EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = c.id AND cc.zone_id = v_order.delivery_zone_id
      )
      OR EXISTS (
        SELECT 1 FROM public.courier_own_zones cz
        WHERE cz.courier_id = c.id AND cz.id = v_order.courier_zone_id
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El repartidor no está activo o no cubre la zona del pedido' USING ERRCODE = '22023';
  END IF;

  IF NOT public.courier_terms_accepted(p_courier_id) THEN
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

-- ---------------------------------------------------------------------------
-- Pulso del repartidor: el dueño de la zona propia también se entera
-- ---------------------------------------------------------------------------

-- Misma `order_pulse_audience` de `20261122000000_pulso_de_pedidos_del_repartidor.sql`, más el dueño de la zona.
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
    SELECT cz.courier_id
    FROM public.orders o
    JOIN public.courier_own_zones cz ON cz.id = o.courier_zone_id
    WHERE o.id = p_order_id AND public.courier_sees_order(o.id, cz.courier_id)
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
  IF NEW.delivery_zone_id IS NULL AND NEW.courier_zone_id IS NULL
     AND NEW.courier_id IS NULL AND OLD.courier_id IS NULL THEN
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
  IF NEW.delivery_zone_id IS NOT NULL OR NEW.courier_zone_id IS NOT NULL OR NEW.courier_id IS NOT NULL THEN
    PERFORM public.pulse_couriers(NEW.id, public.order_pulse_audience(NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_pulse_couriers_insert() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ofertas con otro precio
-- ---------------------------------------------------------------------------

-- Misma `courier_make_offer` de `20261115000000_terminos_de_repartidores.sql`. Si el negocio apagó las ofertas
-- con otro precio, solo se acepta el precio de lista (P0028).
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
  v_other_price boolean;
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

  SELECT o.delivery_fee_list, b.delivery_offers_enabled
  INTO v_list, v_other_price
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id;

  IF p_price IS DISTINCT FROM v_list THEN
    IF NOT v_other_price THEN
      RAISE EXCEPTION 'Este negocio solo acepta el precio de lista' USING ERRCODE = 'P0028';
    END IF;

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

-- ---------------------------------------------------------------------------
-- Lo que ve el panel
-- ---------------------------------------------------------------------------

-- Para Configuración → Envíos (el local) y el detalle del negocio (el superadmin): el tipo de precio, los permisos,
-- el favorito con sus zonas propias y, para `business`, cada zona tildada con su precio común y el del negocio.
CREATE OR REPLACE FUNCTION public.business_delivery_pricing(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_business record;
  v_favorite uuid;
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

  SELECT b.delivery_pricing, b.delivery_prices_editable, b.delivery_offers_enabled
  INTO v_business
  FROM public.businesses b
  WHERE b.id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El negocio no existe' USING ERRCODE = 'P0002';
  END IF;

  v_favorite := public.effective_favorite_courier(p_business_id);

  RETURN jsonb_build_object(
    'pricing', v_business.delivery_pricing,
    'editable', v_business.delivery_prices_editable,
    'offers_enabled', v_business.delivery_offers_enabled,
    'courier', (
      SELECT jsonb_build_object(
               'id', c.id, 'name', c.name, 'active', c.active,
               'zones', (SELECT count(*) FROM public.courier_own_zones cz WHERE cz.courier_id = c.id)
             )
      FROM public.couriers c
      WHERE c.id = v_favorite
    ),
    'courier_zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('id', cz.id, 'name', cz.name, 'price', cz.price, 'active', cz.active)
               ORDER BY cz.sort_order, cz.name
             )
      FROM public.courier_own_zones cz
      WHERE cz.courier_id = v_favorite
    ), '[]'::jsonb),
    'zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', z.id, 'name', z.name, 'common_price', z.price, 'business_price', bp.price
               )
               ORDER BY z.sort_order, z.name
             )
      FROM public.business_delivery_zones bd
      JOIN public.delivery_zones z ON z.id = bd.zone_id AND z.active
      LEFT JOIN public.business_zone_prices bp ON bp.business_id = bd.business_id AND bp.zone_id = z.id
      WHERE bd.business_id = p_business_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_pricing(uuid) TO authenticated;
