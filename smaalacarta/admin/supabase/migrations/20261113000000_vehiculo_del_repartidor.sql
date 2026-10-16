-- Vehículo del repartidor: moto o auto (ENVIO-174 a 178).
--
-- - `couriers.moto` / `couriers.auto`: lo que maneja cada repartidor (al menos uno). Los que ya existían quedan
--   con Moto. Solo el propio repartidor lo cambia, con `courier_save_vehicles()`; el superadmin lo ve.
-- - `platform_settings.vehicle_enabled`: el interruptor del superadmin. Arranca APAGADO. Todo el servidor lo lee
--   con `vehicle_enabled()`: apagado, `needs_car` se ignora y no se filtra a nadie. Los datos se conservan.
-- - `orders.needs_car`: el local pide auto al aceptar el pedido (o después, mientras no haya repartidor), con
--   `set_order_needs_car()`. Nadie lo cambia con un UPDATE directo.
-- - Con el interruptor prendido, un pedido que necesita auto solo lo ve (`courier_sees_order`), toma, oferta o
--   recibe por asignación a mano quien marcó Auto. Error `P0024`: "Este pedido necesita auto".
-- - El vehículo se muestra (no cambia el precio): `business_delivery_options`, `business_order_offers`,
--   `public_order_delivery` (repartidor asignado y cada oferta) y `courier_available_orders` (`necesita_auto`).
--
-- Las funciones de abajo repiten, sin otros cambios, las últimas versiones de las migraciones anteriores.

-- ---------------------------------------------------------------------------
-- Interruptor de la plataforma
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS vehicle_enabled boolean NOT NULL DEFAULT false;

-- Lo pueden preguntar las pantallas del local y del repartidor (con sesión). La tabla sigue siendo solo del
-- superadmin: ve y cambia el valor únicamente él.
CREATE OR REPLACE FUNCTION public.vehicle_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.vehicle_enabled FROM public.platform_settings s WHERE s.id), false)
$$;

REVOKE ALL ON FUNCTION public.vehicle_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vehicle_enabled() TO authenticated;

-- ---------------------------------------------------------------------------
-- Vehículo del repartidor
-- ---------------------------------------------------------------------------

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS moto boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;

ALTER TABLE public.couriers DROP CONSTRAINT IF EXISTS couriers_vehicle_check;
ALTER TABLE public.couriers ADD CONSTRAINT couriers_vehicle_check CHECK (moto OR auto);

-- Sin política de escritura para el repartidor: lo guarda por esta función, solo el suyo.
CREATE OR REPLACE FUNCTION public.courier_save_vehicles(p_moto boolean, p_auto boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'No sos repartidor' USING ERRCODE = '42501';
  END IF;

  IF NOT (coalesce(p_moto, false) OR coalesce(p_auto, false)) THEN
    RAISE EXCEPTION 'Elegí al menos un vehículo: moto o auto' USING ERRCODE = '22023';
  END IF;

  UPDATE public.couriers
  SET moto = coalesce(p_moto, false),
      auto = coalesce(p_auto, false)
  WHERE id = v_courier;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_save_vehicles(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_save_vehicles(boolean, boolean) TO authenticated;

-- Los vehículos de un repartidor para mostrar (["moto"], ["auto"] o los dos); nulo con el interruptor apagado.
CREATE OR REPLACE FUNCTION public.courier_vehicles(p_courier_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN public.vehicle_enabled() THEN
             to_jsonb(array_remove(ARRAY[CASE WHEN c.moto THEN 'moto' END, CASE WHEN c.auto THEN 'auto' END], NULL))
         END
  FROM public.couriers c
  WHERE c.id = p_courier_id
$$;

REVOKE ALL ON FUNCTION public.courier_vehicles(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- "Necesita auto" en el pedido
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS needs_car boolean NOT NULL DEFAULT false;

-- Nadie lo cambia con un UPDATE directo (ni el local ni el cliente ni el repartidor): va por la función.
CREATE OR REPLACE FUNCTION public.guard_order_needs_car()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Para pedir auto se usa el botón del pedido' USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_needs_car ON public.orders;
CREATE TRIGGER orders_guard_needs_car
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  WHEN (new.needs_car IS DISTINCT FROM old.needs_car)
  EXECUTE FUNCTION public.guard_order_needs_car();

-- Solo un miembro del negocio del pedido, y mientras el pedido busca repartidor (o espera a buscarlo) y no lo
-- tiene nadie.
CREATE OR REPLACE FUNCTION public.set_order_needs_car(p_order_id uuid, p_needs_car boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_order record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF p_needs_car IS NULL THEN
    RAISE EXCEPTION 'Falta indicar si necesita auto' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.status, o.courier_status, o.courier_id
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

  IF v_order.courier_status IS NULL
     OR v_order.courier_status NOT IN ('waiting', 'searching')
     OR v_order.courier_id IS NOT NULL
     OR v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Solo se puede pedir auto mientras el pedido busca repartidor' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders SET needs_car = p_needs_car, updated_at = now() WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_needs_car(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_needs_car(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Quién ve, toma, oferta y recibe un pedido que necesita auto
-- ---------------------------------------------------------------------------

-- courier_sees_order: igual que en 20261023000000, más "si el pedido necesita auto, que lo tenga" (ENVIO-177).
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
      AND EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.courier_order_declines d
        WHERE d.order_id = o.id AND d.courier_id = p_courier_id
      )
      AND (NOT o.needs_car OR c.auto OR NOT public.vehicle_enabled())
  );
$$;

REVOKE ALL ON FUNCTION public.courier_sees_order(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ¿Este pedido, que el repartidor vería por zona, se le esconde porque necesita auto y él no tiene? Sirve para
-- darle un error claro (P0024) en vez del genérico "ya lo tomó otro".
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
      AND o.needs_car
      AND NOT c.auto
      AND public.vehicle_enabled()
      AND EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.courier_blocked_by_car(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- courier_take_order: igual que en 20261104000000, más el error claro de "necesita auto".
CREATE OR REPLACE FUNCTION public.courier_take_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_mode text;
  v_name text;
  v_order record;
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF public.courier_blocked_by_car(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'Este pedido necesita auto' USING ERRCODE = 'P0024';
  END IF;

  SELECT o.delivery_mode INTO v_mode
  FROM public.orders o
  WHERE o.id = p_order_id AND public.courier_sees_order(o.id, v_courier);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ya lo tomó otro repartidor o ya no está disponible' USING ERRCODE = 'P0019';
  END IF;

  IF v_mode IS DISTINCT FROM 'fixed' THEN
    RAISE EXCEPTION 'Este pedido no se toma: acepta ofertas' USING ERRCODE = 'P0023';
  END IF;

  SELECT c.name INTO v_name FROM public.couriers c WHERE c.id = v_courier;

  UPDATE public.orders o
  SET courier_id = v_courier,
      courier_status = 'accepted',
      courier_note = NULL,
      courier_responded_at = now(),
      delivery_fee = o.delivery_fee_list,
      delivery_fee_reason = NULL,
      delivery_fee_changed_by = NULL,
      delivery_fee_changed_at = NULL,
      updated_at = now()
  WHERE o.id = p_order_id
    AND o.courier_status = 'searching'
    AND o.courier_id IS NULL
    AND o.delivery_mode = 'fixed'
    AND public.courier_sees_order(o.id, v_courier)
  RETURNING o.business_id, o.status INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ya lo tomó otro repartidor o ya no está disponible' USING ERRCODE = 'P0019';
  END IF;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Envío tomado por ' || v_name || ', ' || v_time,
    'delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_take_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_take_order(uuid) TO authenticated;

-- courier_make_offer: igual que en 20261104000000, más el error claro de "necesita auto".
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

-- business_assign_courier: igual que en 20261023000000, más "si el pedido necesita auto, el repartidor tiene que
-- tenerlo".
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

  SELECT o.id, o.business_id, o.status, o.courier_status, o.delivery_zone_id, o.needs_car
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
  JOIN public.courier_zone_coverage cc ON cc.courier_id = c.id
  WHERE c.id = p_courier_id AND c.active AND cc.zone_id = v_order.delivery_zone_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El repartidor no está activo o no cubre la zona del pedido' USING ERRCODE = '22023';
  END IF;

  IF v_order.needs_car
     AND public.vehicle_enabled()
     AND NOT EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = p_courier_id AND c.auto) THEN
    RAISE EXCEPTION 'Este pedido necesita auto' USING ERRCODE = 'P0024';
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
-- Dónde se ve
-- ---------------------------------------------------------------------------

-- courier_available_orders: igual que en 20261105000000, más `necesita_auto` (solo con el interruptor prendido).
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

-- business_order_offers: igual que en 20261028000000, más `vehiculo` en cada oferta.
CREATE OR REPLACE FUNCTION public.business_order_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  PERFORM public.settle_due_courier_offers();

  RETURN coalesce((
    SELECT jsonb_agg(
             jsonb_build_object(
               'order_id', o.id,
               'cierra_en', public.courier_offers_deadline(o.id),
               'ofertas', (
                 SELECT coalesce(jsonb_agg(
                          jsonb_build_object(
                            'id', f.id,
                            'courier_id', f.courier_id,
                            'repartidor', c.name,
                            'precio', f.price,
                            'motivo', f.reason,
                            'favorito', (f.courier_id IS NOT DISTINCT FROM public.effective_favorite_courier(o.business_id))
                          ) || CASE
                            WHEN public.courier_vehicles(f.courier_id) IS NULL THEN '{}'::jsonb
                            ELSE jsonb_build_object('vehiculo', public.courier_vehicles(f.courier_id))
                          END
                          ORDER BY (f.courier_id IS NOT DISTINCT FROM public.effective_favorite_courier(o.business_id)) DESC,
                                   f.price ASC, f.created_at ASC, f.id ASC
                        ), '[]'::jsonb)
                 FROM public.courier_offers f
                 JOIN public.couriers c ON c.id = f.courier_id
                 WHERE f.order_id = o.id AND f.closed_at IS NULL
               )
             )
           )
    FROM public.orders o
    WHERE o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND EXISTS (
        SELECT 1 FROM public.business_users bu
        WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
      )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.business_order_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_order_offers() TO authenticated;

-- business_delivery_options: igual que en 20261028000000, más `vehiculo` en cada repartidor.
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
               ) || CASE
                 WHEN public.courier_vehicles(c.id) IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('vehiculo', public.courier_vehicles(c.id))
               END
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
    'default_courier', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name)
      FROM public.couriers c
      WHERE c.id = public.default_courier_id() AND c.active
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_options() TO authenticated;

-- public_order_delivery: igual que en 20261109000000, más `vehiculo` del repartidor asignado y de cada oferta.
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
         o.business_id, o.status, o.delivery_mode, o.courier_eta_dropoff_at, o.courier_id
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
