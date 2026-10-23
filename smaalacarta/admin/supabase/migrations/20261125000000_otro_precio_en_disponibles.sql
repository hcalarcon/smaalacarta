-- El repartidor sabe si puede ofertar otro precio (ENVIO-226).
--
-- Misma `courier_available_orders` de `20261115000000_terminos_de_repartidores.sql`, con `envio.otro_precio`: si el
-- negocio apagó las ofertas con otro precio (`businesses.delivery_offers_enabled`), el panel no muestra "Otro precio"
-- ni "Cambiar" y el repartidor solo oferta el de lista. La base igual lo exige en `courier_make_offer` (P0028).
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
                 'precio_lista', o.delivery_fee_list,
                 'otro_precio', b.delivery_offers_enabled
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
