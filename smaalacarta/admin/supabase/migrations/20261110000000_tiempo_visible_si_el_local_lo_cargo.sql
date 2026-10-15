-- Misma `public_order_tracking` de `20261031000000_tiempo_de_preparacion.sql`, con `pedido.prep` siempre que el
-- local cargó una hora de listo: antes también exigía `show_prep_time`, que viene apagado, y el cliente no veía
-- nada aunque el local hubiera dicho cuánto tarda (SEGUIMIENTO-37). "Aceptar sin tiempo" sigue sin mostrar nada.

CREATE OR REPLACE FUNCTION public.public_order_tracking(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_prep jsonb;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  SELECT o.id, o.order_number, o.status, o.total, o.created_at, o.updated_at, o.scheduled_for,
         o.preorder, o.payment, o.payment_status, o.delivery,
         o.prep_ready_at, o.prep_reason, o.prep_updated_at,
         b.name AS business_name, b.whatsapp, b.slug,
         s.template, s.primary_color, s.secondary_color, s.header_image_url,
         s.header_image_x, s.header_image_y, s.show_prep_time
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.business_settings s ON s.business_id = b.id
  WHERE o.code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- El tiempo estimado (SEGUIMIENTO-37): si el local cargó una hora (con o sin el interruptor encendido), el pedido
  -- está en Confirmado o En
  -- preparación y no tiene ya su hora (programado o anticipado). La ventana de 10 minutos es
  -- PREP_WINDOW_MINUTES (admin/src/lib/orders/prep.ts y web/apps/tracker/lib/prep.js).
  IF v_order.status IN ('confirmed', 'preparing')
     AND v_order.scheduled_for IS NULL
     AND NOT v_order.preorder
     AND v_order.prep_ready_at IS NOT NULL THEN
    v_prep := jsonb_build_object(
      'desde', v_order.prep_ready_at,
      'hasta', v_order.prep_ready_at + interval '10 minutes',
      'actualizado', v_order.prep_updated_at,
      'motivo', v_order.prep_reason
    );
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'negocio', jsonb_build_object(
      'nombre', v_order.business_name,
      'telefono', v_order.whatsapp,
      'slug', v_order.slug,
      'plantilla', v_order.template,
      'colores', jsonb_build_object(
        'primary', v_order.primary_color,
        'secondary', v_order.secondary_color
      ),
      'imagen', v_order.header_image_url,
      'posicion', CASE
        WHEN v_order.header_image_x IS NOT NULL
        THEN jsonb_build_object('x', v_order.header_image_x, 'y', v_order.header_image_y)
      END
    ),
    'pedido', jsonb_build_object(
      'numero', v_order.order_number,
      'estado', v_order.status,
      'total', v_order.total,
      'creado', v_order.created_at,
      'actualizado', v_order.updated_at,
      'programado', v_order.scheduled_for,
      -- Solo los pedidos con Mercado Pago llevan estado de pago; nunca el id del pago (SEGUIMIENTO-21).
      'pago', CASE WHEN v_order.payment = 'mercadopago' THEN v_order.payment_status END,
      'anticipado', CASE WHEN v_order.preorder THEN true END,
      'entrega', v_order.delivery,
      'prep', v_prep
    ),
    'items', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'nombre', i.name,
                 'cantidad', i.quantity,
                 'precio', i.unit_price,
                 -- Foto de lo elegido (SEGUIMIENTO-22): grupo, nombre, cantidad y precio, sin ids.
                 'opciones', i.options,
                 -- Lo que el cliente pidió para este producto (SEGUIMIENTO-36).
                 'nota', i.note
               )
               ORDER BY i.sort_order, i.id
             )
      FROM public.order_items i
      WHERE i.order_id = v_order.id
    ), '[]'::jsonb),
    'eventos', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('estado', e.status, 'fecha', e.created_at, 'nota', e.note)
               ORDER BY e.created_at, e.id
             )
      FROM public.order_events e
      WHERE e.order_id = v_order.id AND e.kind = 'status'
    ), '[]'::jsonb)
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_tracking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_tracking(text) TO anon, authenticated;
