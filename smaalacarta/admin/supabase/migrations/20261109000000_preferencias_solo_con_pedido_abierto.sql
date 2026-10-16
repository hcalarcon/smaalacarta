-- Misma `public_order_delivery` de `20261108000000_preferencias_del_repartidor.sql`, con `preferencias` solo
-- mientras el pedido no está entregado ni cancelado (SEGUIMIENTO-48).
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
               'favorito', x.favorite
             )
             ORDER BY x.favorite DESC, x.price ASC, x.created_at ASC, x.id ASC
           ), '[]'::jsonb)
    INTO v_offers
    FROM (
      SELECT f.id, c.name, f.price, f.reason, f.created_at,
             (f.courier_id IS NOT DISTINCT FROM public.effective_favorite_courier(v_order.business_id)) AS favorite
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
