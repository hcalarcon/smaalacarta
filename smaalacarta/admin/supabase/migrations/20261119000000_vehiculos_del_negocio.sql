-- Vehículos con los que trabaja cada negocio (ENVIO-203 a 207).
--
-- - `business_settings.vehicle_moto` / `vehicle_auto`: con qué vehículos trabaja el negocio. Los que ya existían
--   quedan con los dos (así nada cambia hasta que lo toquen). Al menos uno.
-- - `courier_vehicle_ok()`: la regla en un solo lugar. Con el interruptor "Vehículo del repartidor" apagado no
--   filtra a nadie; prendido, el repartidor necesita al menos uno de los vehículos del negocio y, si el pedido
--   necesita auto, tener auto.
-- - `courier_sees_order` (ver, tomar, ofertar) y `courier_blocked_by_car` (error P0024) la usan; también
--   `business_assign_courier`. El conteo de disponibles (`zone_available_couriers`) la respeta cuando conoce el
--   negocio.
-- - `save_business_vehicles()`: lo guarda el negocio; cierra las ofertas abiertas de repartidores que ya no sirven.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS vehicle_moto boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vehicle_auto boolean NOT NULL DEFAULT true;

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_vehicle_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_vehicle_check CHECK (vehicle_moto OR vehicle_auto);

-- ¿Este repartidor (con estos vehículos) puede ver, tomar y recibir un pedido de este negocio?
CREATE OR REPLACE FUNCTION public.courier_vehicle_ok(
  p_business_id uuid,
  p_moto boolean,
  p_auto boolean,
  p_needs_car boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN NOT public.vehicle_enabled() THEN true
           ELSE coalesce(
                  (SELECT (p_moto AND s.vehicle_moto) OR (p_auto AND s.vehicle_auto)
                   FROM public.business_settings s WHERE s.business_id = p_business_id),
                  true
                )
                AND (NOT coalesce(p_needs_car, false) OR p_auto)
         END
$$;

REVOKE ALL ON FUNCTION public.courier_vehicle_ok(uuid, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- courier_sees_order: igual que en 20261115000000, con la regla del vehículo en `courier_vehicle_ok`.
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
      AND public.courier_vehicle_ok(o.business_id, c.moto, c.auto, o.needs_car)
      AND public.courier_terms_accepted(p_courier_id)
  );
$$;

REVOKE ALL ON FUNCTION public.courier_sees_order(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- courier_blocked_by_car: igual que en 20261113000000, pero también cuando el negocio no trabaja con el vehículo
-- del repartidor. Da el error claro P0024 en tomar y ofertar.
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
      AND EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.courier_blocked_by_car(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- business_assign_courier: igual que en 20261116000000, con la regla del vehículo en `courier_vehicle_ok`.
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
-- Conteo de disponibles
-- ---------------------------------------------------------------------------

-- Cuántos repartidores disponibles cubren la zona; con el negocio, solo los que sirven a sus vehículos.
DROP FUNCTION IF EXISTS public.zone_available_couriers(uuid);

CREATE OR REPLACE FUNCTION public.zone_available_couriers(p_zone_id uuid, p_business_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.courier_zone_coverage cc
  JOIN public.couriers c ON c.id = cc.courier_id
  WHERE cc.zone_id = p_zone_id
    AND public.courier_available_now(cc.courier_id)
    AND (p_business_id IS NULL OR public.courier_vehicle_ok(p_business_id, c.moto, c.auto, false))
$$;

REVOKE ALL ON FUNCTION public.zone_available_couriers(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Menú: igual que en 20261117000000, con el negocio opcional.
DROP FUNCTION IF EXISTS public.public_zone_has_couriers(uuid);

CREATE OR REPLACE FUNCTION public.public_zone_has_couriers(p_zone_id uuid, p_business_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN NOT public.courier_availability_enabled() THEN true
           WHEN NOT EXISTS (SELECT 1 FROM public.delivery_zones z WHERE z.id = p_zone_id AND z.active) THEN true
           ELSE public.zone_available_couriers(p_zone_id, p_business_id) > 0
         END
$$;

REVOKE ALL ON FUNCTION public.public_zone_has_couriers(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_zone_has_couriers(uuid, uuid) TO anon, authenticated;

-- Seguimiento: igual que en 20261117000000, con el negocio del pedido.
CREATE OR REPLACE FUNCTION public.public_order_has_couriers(p_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_zone uuid;
  v_business uuid;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  IF NOT public.courier_availability_enabled() THEN
    RETURN NULL;
  END IF;

  SELECT o.delivery_zone_id, o.business_id INTO v_zone, v_business
  FROM public.orders o
  WHERE o.code = p_code
    AND o.courier_status IN ('waiting', 'searching')
    AND o.courier_id IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
    AND o.delivery_zone_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN public.zone_available_couriers(v_zone, v_business) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_has_couriers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_has_couriers(text) TO anon, authenticated;

-- Panel del local: igual que en 20261118000000, con los vehículos del negocio.
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

  IF NOT public.courier_availability_enabled() THEN
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
          WHERE c.id = cc.courier_id AND public.courier_vehicle_ok(p_business_id, c.moto, c.auto, false)
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
-- Guardar los vehículos del negocio
-- ---------------------------------------------------------------------------

-- El negocio sale de la sesión (`my_courier_business_id()`), nunca de un parámetro. Es SECURITY DEFINER porque cierra
-- ofertas de repartidores, que el local no puede tocar directo.
CREATE OR REPLACE FUNCTION public.save_business_vehicles(p_moto boolean, p_auto boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
BEGIN
  IF v_business IS NULL THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor' USING ERRCODE = '42501';
  END IF;

  IF NOT (coalesce(p_moto, false) OR coalesce(p_auto, false)) THEN
    RAISE EXCEPTION 'Elegí al menos un vehículo: moto o auto' USING ERRCODE = '22023';
  END IF;

  UPDATE public.business_settings
  SET vehicle_moto = coalesce(p_moto, false),
      vehicle_auto = coalesce(p_auto, false)
  WHERE business_id = v_business;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El negocio todavía no tiene configuración' USING ERRCODE = 'P0002';
  END IF;

  -- Las ofertas abiertas de quienes ya no sirven a este negocio dejan de estar en carrera.
  IF public.vehicle_enabled() THEN
    UPDATE public.courier_offers f
    SET closed_at = now()
    FROM public.orders o, public.couriers c
    WHERE f.closed_at IS NULL
      AND o.id = f.order_id
      AND o.business_id = v_business
      AND o.courier_status = 'searching'
      AND c.id = f.courier_id
      AND NOT public.courier_vehicle_ok(v_business, c.moto, c.auto, o.needs_car);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_vehicles(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_vehicles(boolean, boolean) TO authenticated;
