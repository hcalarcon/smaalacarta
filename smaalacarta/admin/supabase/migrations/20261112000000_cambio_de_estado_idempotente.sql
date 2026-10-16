-- Cambio de estado idempotente (ADMIN-PEDIDOS-57).
--
-- Un doble click, dos pestañas o un reintento hacían avanzar el pedido dos pasos: cada llamada
-- calculaba el paso desde el estado del momento. Ahora el cambio puede llevar `p_from`, el estado que
-- la persona veía al tocar: si el pedido ya no está ahí, la función no hace nada y no da error. Sin
-- `p_from` (NULL) se comporta como antes.
--
-- Las funciones son las de `20261022000000_busqueda_de_repartidor.sql` (set_order_status) y
-- `20261018000000_envio_repartos_al_toque.sql` (courier_set_status), con un parámetro más. Cambia la
-- firma, así que se borran las anteriores.

DROP FUNCTION IF EXISTS public.set_order_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.courier_set_status(uuid, text);

CREATE OR REPLACE FUNCTION public.set_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_from text DEFAULT NULL
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

  -- Idempotente: el pedido ya no está en el estado que la persona veía (otro click, otra pestaña
  -- o Realtime se adelantaron). No se hace nada, sin evento y sin error.
  IF p_from IS NOT NULL AND v_current IS DISTINCT FROM p_from THEN
    RETURN;
  END IF;

  -- Con un repartidor asignado el camino lleva Entregado al repartidor y En camino. Sin él (sin
  -- envío con repartidor, o el local lo lleva él: `self`), el local lo entrega.
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

  -- Con el envío por resolver (esperando la confirmación o buscando repartidor) no se entrega:
  -- primero hay que asignarlo o llevarlo el local.
  IF p_status = 'delivered' AND v_courier_status IN ('waiting', 'searching') THEN
    RAISE EXCEPTION 'El envío todavía no tiene quién lo lleve: asignalo o llevalo vos' USING ERRCODE = 'P0004';
  END IF;

  -- Entregarlo al repartidor exige que alguno lo haya tomado.
  IF p_status = 'handed_to_courier' AND (v_courier_id IS NULL OR v_courier_status IS DISTINCT FROM 'accepted') THEN
    RAISE EXCEPTION 'El pedido todavía no tiene un repartidor que lo haya tomado' USING ERRCODE = 'P0004';
  END IF;

  -- Un pedido con Mercado Pago que todavía no está pagado solo se puede cancelar (ADMIN-PEDIDOS-18).
  IF v_payment_status IN ('awaiting', 'failed') AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'El pedido espera el pago: solo se puede cancelar' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders
  SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note)
  VALUES (p_order_id, v_business_id, p_status, (select auth.uid()), NULLIF(trim(p_note), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.courier_set_status(
  p_order_id uuid,
  p_status text,
  p_from text DEFAULT NULL
)
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

  -- Idempotente: si el pedido ya no está en el estado que el repartidor veía, no se hace nada.
  IF p_from IS NOT NULL AND v_order.status IS DISTINCT FROM p_from THEN
    RETURN;
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

REVOKE ALL ON FUNCTION public.courier_set_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_set_status(uuid, text, text) TO authenticated;
