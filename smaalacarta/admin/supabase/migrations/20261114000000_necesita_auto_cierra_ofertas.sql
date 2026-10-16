-- "Necesita auto" cierra las ofertas abiertas de quienes no tienen auto (ENVIO-177).
--
-- Si el local pide auto cuando ya hay ofertas, las de repartidores sin auto no pueden seguir en carrera: ni la
-- elección automática ni el cliente las podrían elegir. Igual que `set_order_needs_car` de
-- `20261113000000_vehiculo_del_repartidor.sql`, más ese cierre (solo con el interruptor del vehículo prendido).

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

  IF p_needs_car AND public.vehicle_enabled() THEN
    UPDATE public.courier_offers f
    SET closed_at = now()
    FROM public.couriers c
    WHERE f.order_id = p_order_id
      AND f.closed_at IS NULL
      AND c.id = f.courier_id
      AND NOT c.auto;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_needs_car(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_needs_car(uuid, boolean) TO authenticated;
