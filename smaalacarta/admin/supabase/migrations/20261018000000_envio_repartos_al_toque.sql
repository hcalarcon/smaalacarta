-- Envío con Repartos al Toque, etapa 1: la base de datos (ENVIO-1 a 17).
--
-- - `couriers` y `courier_zones` son tablas GLOBALES, sin `business_id`: hay un solo
--   repartidor (Repartos al Toque) y, por ahora, solo locales del centro, así que no
--   hay precios distintos según el local. El filtro por negocio lo da
--   `businesses.courier_delivery` (lo habilita solo el superadmin) y `orders.courier_id`.
-- - `courier_users`: el usuario repartidor. Sin escritura desde la app; la carga Herni con
--   SQL (ver el final del archivo). La migración no lleva ese id.
-- - `orders` gana las columnas del envío; los estados `handed_to_courier` y `on_the_way`;
--   y los eventos `kind = 'delivery'` (la línea de tiempo pública solo muestra `status`).
-- - `set_order_status` conoce los dos caminos; un trigger repite la regla de `P0015` porque
--   los miembros pueden hacer UPDATE directo por RLS.
-- - `create_public_order` pasa a ser una envoltura de 11 parámetros sobre
--   `create_public_order_base` (la versión de 8 parámetros de antes, renombrada).
--
-- IMPORTANTE: una migración futura que cambie la creación del pedido redefine
-- `create_public_order_base`; NUNCA crea otra `create_public_order` de 8 parámetros: sería
-- una sobrecarga ambigua con la de 11 (los tres parámetros nuevos tienen DEFAULT).
--
-- Errores nuevos: `P0015` (el envío todavía no está aceptado), `P0016` (barrio o entrega
-- inválidos para el envío).

-- ---------------------------------------------------------------------------
-- Repartidores y barrios
-- ---------------------------------------------------------------------------

-- El envío con repartidor lo habilita el superadmin por negocio (ENVIO-2). Va primero porque
-- las políticas de abajo lo leen.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS courier_delivery boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- Solo dígitos, con código de país. Nulo hasta que se cargue.
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{8,15}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un solo repartidor activo a la vez (ENVIO-1).
CREATE UNIQUE INDEX IF NOT EXISTS couriers_one_active_idx
  ON public.couriers ((true))
  WHERE active;

CREATE TABLE IF NOT EXISTS public.courier_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (courier_id, name)
);

CREATE INDEX IF NOT EXISTS courier_zones_courier_idx
  ON public.courier_zones (courier_id, sort_order);

CREATE TABLE IF NOT EXISTS public.courier_users (
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS courier_users_courier_idx ON public.courier_users (courier_id);

-- El repartidor fijo y sus 39 barrios.
INSERT INTO public.couriers (id, name, active)
VALUES ('7a0c0e00-0000-4000-8000-000000000001', 'Repartos al Toque', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.courier_zones (courier_id, name, price, sort_order)
SELECT '7a0c0e00-0000-4000-8000-000000000001', z.name, z.price, z.sort_order
FROM (VALUES
  ('Centro (hasta Av. Koessler)', 4500, 1),
  ('Cantera', 5000, 2),
  ('Perito Moreno a partir de 2000', 5000, 3),
  ('Oasis', 5500, 4),
  ('Altos del Sol', 5500, 5),
  ('Hospital nuevo', 5500, 6),
  ('Barrio Las Moras', 6000, 7),
  ('Kumelcayen', 6500, 8),
  ('Arenal', 7000, 9),
  ('Chacra 4', 7500, 10),
  ('Gobernadores Neuquinos', 7500, 11),
  ('Villa Paur', 8000, 12),
  ('Alihuen Bajo', 8000, 13),
  ('Intercultural', 8500, 14),
  ('La Cascada', 10000, 15),
  ('Villa Vega San Martin', 10000, 16),
  ('Bickel', 10000, 17),
  ('Covisal/Los Radales', 11000, 18),
  ('Barrio San Fernando', 12000, 19),
  ('Alihuen Alto', 12000, 20),
  ('Callejon de Gin Gin', 13000, 21),
  ('Los Robles', 14000, 22),
  ('La Reserva Baja', 14000, 23),
  ('Altos del Chapelco', 15000, 24),
  ('Callejon de Torres', 15000, 25),
  ('La Reserva Alta', 15000, 26),
  ('Rincon Radales', 16000, 27),
  ('Faldeos del Chapelco', 17000, 28),
  ('Kaleuche', 17000, 29),
  ('Peñon de Lolog', 17000, 30),
  ('Pahiuen', 18000, 31),
  ('Vega Maipu', 18000, 32),
  ('Cordones de Chapelco', 21000, 33),
  ('Chacra 30', 23000, 34),
  ('Chacra 32', 24000, 35),
  ('Lolog', 25000, 36),
  ('El Desafio', 27000, 37),
  ('Chapelco Golf', 27000, 38),
  ('Las Marias del Valle / Aeropuerto', 28000, 39)
) AS z(name, price, sort_order)
ON CONFLICT (courier_id, name) DO NOTHING;

-- El repartidor del usuario de la sesión, o nulo. SECURITY DEFINER para poder usarla en
-- las políticas sin exponer `courier_users`.
CREATE OR REPLACE FUNCTION public.my_courier_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cu.courier_id
  FROM public.courier_users cu
  WHERE cu.user_id = (select auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_courier_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_courier_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS (solo `TO authenticated`, igual que las de superadmin)
-- ---------------------------------------------------------------------------

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_users ENABLE ROW LEVEL SECURITY;

-- ¿El usuario es miembro de algún negocio con el envío habilitado?
CREATE OR REPLACE FUNCTION public.is_member_of_courier_business()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_users bu
    JOIN public.businesses b ON b.id = bu.business_id
    WHERE bu.user_id = (select auth.uid())
      AND b.courier_delivery
  );
$$;

REVOKE ALL ON FUNCTION public.is_member_of_courier_business() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member_of_courier_business() TO authenticated;

-- couriers
DROP POLICY IF EXISTS couriers_all_super_admin ON public.couriers;
CREATE POLICY couriers_all_super_admin
ON public.couriers
FOR ALL
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS couriers_select_own ON public.couriers;
CREATE POLICY couriers_select_own
ON public.couriers
FOR SELECT
TO authenticated
USING (id = (select public.my_courier_id()));

DROP POLICY IF EXISTS couriers_select_member ON public.couriers;
CREATE POLICY couriers_select_member
ON public.couriers
FOR SELECT
TO authenticated
USING (active AND (select public.is_member_of_courier_business()));

-- courier_zones
DROP POLICY IF EXISTS courier_zones_all_super_admin ON public.courier_zones;
CREATE POLICY courier_zones_all_super_admin
ON public.courier_zones
FOR ALL
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS courier_zones_all_own ON public.courier_zones;
CREATE POLICY courier_zones_all_own
ON public.courier_zones
FOR ALL
TO authenticated
USING (courier_id = (select public.my_courier_id()))
WITH CHECK (courier_id = (select public.my_courier_id()));

DROP POLICY IF EXISTS courier_zones_select_member ON public.courier_zones;
CREATE POLICY courier_zones_select_member
ON public.courier_zones
FOR SELECT
TO authenticated
USING (
  active
  AND (select public.is_member_of_courier_business())
  AND EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = courier_zones.courier_id AND c.active
  )
);

-- courier_users: solo lectura (la propia fila, o todas para un superadmin). Sin políticas de
-- escritura a propósito: se carga con SQL.
DROP POLICY IF EXISTS courier_users_select_own ON public.courier_users;
CREATE POLICY courier_users_select_own
ON public.courier_users
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS courier_users_select_super_admin ON public.courier_users;
CREATE POLICY courier_users_select_super_admin
ON public.courier_users
FOR SELECT
TO authenticated
USING ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Negocios: el envío lo habilita solo el superadmin (ENVIO-2)
-- ---------------------------------------------------------------------------

-- Misma función que `20260930000500_planes_y_estado.sql`, con `courier_delivery` agregada.
CREATE OR REPLACE FUNCTION public.guard_business_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin()
     AND (
       new.plan_pdf IS DISTINCT FROM old.plan_pdf
       OR new.plan_web IS DISTINCT FROM old.plan_web
       OR new.plan_completo IS DISTINCT FROM old.plan_completo
       OR new.active IS DISTINCT FROM old.active
       OR new.courier_delivery IS DISTINCT FROM old.courier_delivery
     )
  THEN
    RAISE EXCEPTION 'Solo un superadmin puede cambiar el plan o el estado del negocio'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Pedidos: columnas del envío y estados nuevos
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES public.couriers(id),
  ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES public.courier_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_zone_name text,
  -- Precio de lista del barrio al momento del pedido y precio final (puede cambiar con motivo).
  ADD COLUMN IF NOT EXISTS delivery_fee_list numeric(10,2) CHECK (delivery_fee_list >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) CHECK (delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_reason text CHECK (char_length(delivery_fee_reason) <= 200),
  ADD COLUMN IF NOT EXISTS delivery_fee_changed_by uuid,
  ADD COLUMN IF NOT EXISTS delivery_fee_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_phone text CHECK (customer_phone ~ '^[0-9]{8,15}$'),
  ADD COLUMN IF NOT EXISTS delivery_address text CHECK (char_length(delivery_address) <= 200),
  ADD COLUMN IF NOT EXISTS courier_status text
    CHECK (courier_status IN ('waiting', 'requested', 'accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS courier_note text CHECK (char_length(courier_note) <= 120),
  ADD COLUMN IF NOT EXISTS courier_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS courier_responded_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_courier_created_idx
  ON public.orders (courier_id, created_at DESC)
  WHERE courier_id IS NOT NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'handed_to_courier', 'on_the_way',
                    'delivered', 'cancelled'))
  NOT VALID;

ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS order_events_status_check;
ALTER TABLE public.order_events
  ADD CONSTRAINT order_events_status_check
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'handed_to_courier', 'on_the_way',
                    'delivered', 'cancelled'));

ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS order_events_kind_check;
ALTER TABLE public.order_events
  ADD CONSTRAINT order_events_kind_check CHECK (kind IN ('status', 'payment', 'delivery'));

-- Un pedido con envío no sale de Pendiente (salvo para cancelarse) hasta que el envío está
-- aceptado (ENVIO-8). Va como trigger porque los miembros pueden hacer UPDATE directo por RLS.
-- El repartidor de un pedido tampoco se cambia una vez asignado.
CREATE OR REPLACE FUNCTION public.guard_order_courier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF old.courier_id IS NOT NULL AND new.courier_id IS DISTINCT FROM old.courier_id THEN
    RAISE EXCEPTION 'El repartidor del pedido no se puede cambiar' USING ERRCODE = '42501';
  END IF;

  IF new.courier_id IS NOT NULL
     AND old.status = 'pending'
     AND new.status NOT IN ('pending', 'cancelled')
     AND new.courier_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'El envío todavía no fue aceptado por el repartidor' USING ERRCODE = 'P0015';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_courier ON public.orders;
CREATE TRIGGER orders_guard_courier
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_courier();

-- `set_order_status`: igual a la de `20261008000000_mercadopago.sql` más los dos caminos de
-- estados (ENVIO-8 a 10). Sigue con los permisos de quien la llama.
CREATE OR REPLACE FUNCTION public.set_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_current text;
  v_business_id uuid;
  v_payment_status text;
  v_courier_id uuid;
  v_courier_status text;
  v_path text[];
BEGIN
  IF p_status IS NULL OR p_status NOT IN
     ('pending', 'confirmed', 'preparing', 'ready', 'handed_to_courier', 'on_the_way',
      'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Estado desconocido' USING ERRCODE = '22023';
  END IF;

  SELECT o.status, o.business_id, o.payment_status, o.courier_id, o.courier_status
  INTO v_current, v_business_id, v_payment_status, v_courier_id, v_courier_status
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  v_path := CASE
    WHEN v_courier_id IS NULL
      THEN ARRAY['pending', 'confirmed', 'preparing', 'ready', 'delivered']
    ELSE ARRAY['pending', 'confirmed', 'preparing', 'ready', 'handed_to_courier', 'on_the_way',
               'delivered']
  END;

  -- coalesce: un estado que no está en el camino de este pedido no es un paso válido.
  IF v_current IN ('delivered', 'cancelled')
     OR NOT (
       p_status = 'cancelled'
       OR coalesce(array_position(v_path, p_status), 0)
          > coalesce(array_position(v_path, v_current), 0)
     ) THEN
    RAISE EXCEPTION 'No se puede pasar de % a %', v_current, p_status USING ERRCODE = 'P0004';
  END IF;

  -- Con envío, llevarlo en camino y entregarlo es del repartidor (`courier_set_status`).
  IF v_courier_id IS NOT NULL AND p_status IN ('on_the_way', 'delivered') THEN
    RAISE EXCEPTION 'El repartidor es quien lo pasa a %', p_status USING ERRCODE = 'P0004';
  END IF;

  -- Un pedido con Mercado Pago que todavía no está pagado solo se puede cancelar (ADMIN-PEDIDOS-18).
  IF v_payment_status IN ('awaiting', 'failed') AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'El pedido espera el pago: solo se puede cancelar' USING ERRCODE = 'P0004';
  END IF;

  IF v_courier_id IS NOT NULL
     AND v_current = 'pending'
     AND p_status <> 'cancelled'
     AND v_courier_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'El envío todavía no fue aceptado por el repartidor' USING ERRCODE = 'P0015';
  END IF;

  UPDATE public.orders
  SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note)
  VALUES (p_order_id, v_business_id, p_status, (select auth.uid()), NULLIF(trim(p_note), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_public_order: envoltura sobre la versión anterior (ENVIO-5 a 7)
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.create_public_order(text, text, text, text, text, jsonb, timestamptz, boolean)
  RENAME TO create_public_order_base;

REVOKE ALL ON FUNCTION public.create_public_order_base(text, text, text, text, text, jsonb, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;

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
  v_courier_delivery boolean;
  v_with_courier boolean;
  v_zone_id uuid;
  v_zone_name text;
  v_courier_id uuid;
  v_price numeric;
  v_result jsonb;
BEGIN
  SELECT b.courier_delivery INTO v_courier_delivery
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

    SELECT z.id, z.name, z.price, z.courier_id
    INTO v_zone_id, v_zone_name, v_price, v_courier_id
    FROM public.courier_zones z
    JOIN public.couriers c ON c.id = z.courier_id
    WHERE z.id = p_delivery_zone AND z.active AND c.active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
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

-- ---------------------------------------------------------------------------
-- Registrar la respuesta del repartidor y el precio del envío (ENVIO-11 a 13)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_order_courier(
  p_order_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_fee numeric DEFAULT NULL,
  p_fee_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_order record;
  v_is_member boolean;
  v_is_courier boolean;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_reason text := NULLIF(btrim(coalesce(p_fee_reason, '')), '');
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_text text;
  v_fee_changed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('request', 'accept', 'reject') THEN
    RAISE EXCEPTION 'Acción desconocida' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.business_id, o.status, o.courier_id, o.courier_status, o.delivery_fee
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  -- coalesce: un usuario sin repartidor da nulo, y un nulo no puede dejar pasar a nadie.
  v_is_courier := coalesce(v_order.courier_id = public.my_courier_id(), false);
  v_is_member := EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.user_id = v_uid AND bu.business_id = v_order.business_id
  );

  -- Quien no es parte del pedido no se entera de que existe.
  IF NOT (v_is_courier OR v_is_member) THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.courier_id IS NULL THEN
    RAISE EXCEPTION 'El pedido no tiene envío con repartidor' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'El pedido ya terminó' USING ERRCODE = 'P0004';
  END IF;

  IF p_action = 'request' AND NOT v_is_member THEN
    RAISE EXCEPTION 'Solo el negocio consulta al repartidor' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'request' AND v_order.courier_status = 'accepted' THEN
    RAISE EXCEPTION 'El envío ya fue aceptado' USING ERRCODE = 'P0004';
  END IF;

  IF char_length(coalesce(v_note, '')) > 120 THEN
    RAISE EXCEPTION 'La nota admite hasta 120 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_fee IS NOT NULL AND p_fee IS DISTINCT FROM v_order.delivery_fee THEN
    IF p_fee < 0 OR p_fee >= 100000000 THEN
      RAISE EXCEPTION 'El precio del envío no es válido' USING ERRCODE = '22023';
    END IF;
    IF v_reason IS NULL OR char_length(v_reason) > 200 THEN
      RAISE EXCEPTION 'Cambiar el precio del envío exige un motivo (hasta 200 caracteres)'
        USING ERRCODE = '22023';
    END IF;
    v_fee_changed := true;
  END IF;

  IF p_action = 'request' THEN
    UPDATE public.orders
    SET courier_status = 'requested', courier_requested_at = now(), updated_at = now()
    WHERE id = p_order_id;

    v_text := 'Envío consultado al repartidor, ' || v_time;
  ELSE
    UPDATE public.orders
    SET courier_status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'rejected' END,
        courier_note = v_note,
        courier_responded_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    v_text := CASE WHEN p_action = 'accept' THEN 'Envío aceptado' ELSE 'Envío rechazado' END
              || coalesce(': ' || v_note, '') || ', ' || v_time;
  END IF;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (p_order_id, v_order.business_id, v_order.status, v_uid, v_text, 'delivery');

  IF v_fee_changed THEN
    UPDATE public.orders
    SET delivery_fee = p_fee,
        delivery_fee_reason = v_reason,
        delivery_fee_changed_by = v_uid,
        delivery_fee_changed_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
    VALUES (
      p_order_id, v_order.business_id, v_order.status, v_uid,
      'Precio del envío: $' || replace(to_char(v_order.delivery_fee, 'FM999,999,990'), ',', '.')
        || ' → $' || replace(to_char(p_fee, 'FM999,999,990'), ',', '.')
        || ' (' || v_reason || ')',
      'delivery'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_courier(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_courier(uuid, text, text, numeric, text) TO authenticated;

-- El repartidor lleva el pedido: entregado al repartidor → en camino → entregado (ENVIO-14).
CREATE OR REPLACE FUNCTION public.courier_set_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_order record;
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('on_the_way', 'delivered') THEN
    RAISE EXCEPTION 'Estado desconocido' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.business_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.courier_id = v_courier
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (v_order.status = 'handed_to_courier' AND p_status = 'on_the_way')
    OR (v_order.status = 'on_the_way' AND p_status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'No se puede pasar de % a %', v_order.status, p_status USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders
  SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, kind)
  VALUES (p_order_id, v_order.business_id, p_status, v_uid, 'status');
END;
$$;

REVOKE ALL ON FUNCTION public.courier_set_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_set_status(uuid, text) TO authenticated;

-- Los pedidos con envío del repartidor, los más nuevos primero (ENVIO-15). Entran los de los
-- últimos días (`p_since`) y todo lo que sigue abierto, aunque sea más viejo (programados y
-- anticipados se hacen con días de anticipación).
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
                            'opciones', i.options
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
                 'motivo_cambio', o.delivery_fee_reason,
                 'cambiado_el', o.delivery_fee_changed_at,
                 'estado', o.courier_status,
                 'nota', o.courier_note,
                 'consultado_el', o.courier_requested_at,
                 'respondido_el', o.courier_responded_at
               )
             )
             ORDER BY o.created_at DESC, o.id
           )
    FROM public.orders o
    JOIN public.businesses b ON b.id = o.business_id
    LEFT JOIN public.business_settings s ON s.business_id = b.id
    WHERE o.courier_id = v_courier
      AND (o.created_at >= p_since OR o.status NOT IN ('delivered', 'cancelled'))
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_orders(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_orders(timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ve el cliente, sin sesión (ENVIO-16 y 17)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.public_delivery_zones(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier_id uuid;
  v_courier_name text;
BEGIN
  SELECT c.id, c.name
  INTO v_courier_id, v_courier_name
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  JOIN public.couriers c ON c.active
  WHERE b.slug = p_slug
    AND s.published
    AND b.active
    AND b.plan_completo
    AND b.courier_delivery;

  IF v_courier_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'repartidor', v_courier_name,
    'zonas', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('id', z.id, 'nombre', z.name, 'precio', z.price)
               ORDER BY z.sort_order, z.name
             )
      FROM public.courier_zones z
      WHERE z.courier_id = v_courier_id AND z.active
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_delivery_zones(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_delivery_zones(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_order_delivery(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  SELECT c.name AS courier_name, o.delivery_zone_name, o.delivery_fee_list, o.delivery_fee,
         o.delivery_fee_reason, o.courier_status, o.courier_note
  INTO v_order
  FROM public.orders o
  JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Nunca el teléfono ni la dirección.
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_order.courier_name,
    'zona', v_order.delivery_zone_name,
    'precio_lista', v_order.delivery_fee_list,
    'precio', v_order.delivery_fee,
    'motivo_cambio', v_order.delivery_fee_reason,
    'estado', v_order.courier_status,
    'nota', v_order.courier_note
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- A mano, después de `db:push` (no va en la migración: la carga Herni en su Supabase):
--
--   insert into public.courier_users (courier_id, user_id)
--   values ('7a0c0e00-0000-4000-8000-000000000001', '<id del usuario repartidor>');
--   update public.couriers set whatsapp = '549XXXXXXXXXX'
--   where id = '7a0c0e00-0000-4000-8000-000000000001';
-- ---------------------------------------------------------------------------
