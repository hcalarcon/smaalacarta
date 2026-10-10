-- Envíos con Repartos al Toque, etapa 4: cobro en efectivo y rendiciones (ENVIO-38 a 43).
--
-- En un pedido con envío pagado en efectivo, el repartidor cobra el pedido y el envío: lo del
-- pedido (`orders.total`, sin el envío) lo rinde al local y el envío es suyo. La rendición se marca
-- pedido por pedido en dos pasos —el repartidor "Rendido", después el local "Recibido"— y las marcas
-- quedan fijas.
--
-- - Cuatro columnas nuevas en `orders`, que no se cambian por UPDATE directo (trigger): solo las
--   dos funciones de abajo.
-- - `courier_orders()` suma `rendicion` a cada pedido. Es la versión de
--   `20261018000000_envio_repartos_al_toque.sql` con ese bloque agregado.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_by uuid,
  ADD COLUMN IF NOT EXISTS settlement_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_received_by uuid;

-- Los miembros del negocio tienen UPDATE por RLS sobre `orders`: sin esto podrían marcar o
-- desmarcar rendiciones a mano. Las funciones SECURITY DEFINER corren como su dueño, así que el
-- trigger (que no es SECURITY DEFINER) ve `current_user` distinto de `authenticated` / `anon`.
CREATE OR REPLACE FUNCTION public.guard_order_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (
       new.settled_at IS DISTINCT FROM old.settled_at
       OR new.settled_by IS DISTINCT FROM old.settled_by
       OR new.settlement_received_at IS DISTINCT FROM old.settlement_received_at
       OR new.settlement_received_by IS DISTINCT FROM old.settlement_received_by
     )
  THEN
    RAISE EXCEPTION 'La rendición solo se marca desde el flujo de rendiciones'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_settlement ON public.orders;
CREATE TRIGGER orders_guard_settlement
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_settlement();

-- El repartidor marca que ya rindió lo del pedido al local (ENVIO-39).
CREATE OR REPLACE FUNCTION public.courier_mark_settled(p_order_id uuid)
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

  SELECT o.id, o.business_id, o.status, o.payment, o.total, o.settled_at
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.courier_id = v_courier
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment IS DISTINCT FROM 'efectivo' THEN
    RAISE EXCEPTION 'El pedido no se pagó en efectivo: no hay nada que rendir' USING ERRCODE = 'P0004';
  END IF;

  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'Solo se rinde un pedido ya entregado' USING ERRCODE = 'P0004';
  END IF;

  IF v_order.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'La rendición ya está marcada' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders
  SET settled_at = now(), settled_by = v_uid, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Rendido al local: $' || replace(to_char(v_order.total, 'FM999,999,990'), ',', '.'),
    'delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_mark_settled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_mark_settled(uuid) TO authenticated;

-- El local confirma que recibió lo que el repartidor marcó como rendido (ENVIO-39).
CREATE OR REPLACE FUNCTION public.business_confirm_settlement(p_order_id uuid)
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

  SELECT o.id, o.business_id, o.status, o.settled_at, o.settlement_received_at
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

  IF v_order.settled_at IS NULL THEN
    RAISE EXCEPTION 'El repartidor todavía no marcó la rendición' USING ERRCODE = 'P0004';
  END IF;

  IF v_order.settlement_received_at IS NOT NULL THEN
    RAISE EXCEPTION 'La rendición ya fue confirmada' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders
  SET settlement_received_at = now(), settlement_received_by = v_uid, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (p_order_id, v_order.business_id, v_order.status, v_uid, 'Rendición recibida', 'delivery');
END;
$$;

REVOKE ALL ON FUNCTION public.business_confirm_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_confirm_settlement(uuid) TO authenticated;

-- Los pedidos con envío del repartidor (ENVIO-15), ahora con la rendición (ENVIO-40).
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
