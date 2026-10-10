-- Envíos con Repartos al Toque: su WhatsApp es público (ENVIO-44).
--
-- El cliente tiene que ver que el envío lo hace Repartos al Toque y tener su teléfono, que es el
-- de su servicio. Las dos funciones públicas lo devuelven; si no hay WhatsApp cargado, la clave no
-- va. Nunca van el teléfono ni la dirección del cliente.

-- Las mismas de `20261018000000_envio_repartos_al_toque.sql`, con `whatsapp` agregado.
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
  v_courier_whatsapp text;
BEGIN
  SELECT c.id, c.name, c.whatsapp
  INTO v_courier_id, v_courier_name, v_courier_whatsapp
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
    'zonas', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('id', z.id, 'nombre', z.name, 'precio', z.price)
               ORDER BY z.sort_order, z.name
             )
      FROM public.courier_zones z
      WHERE z.courier_id = v_courier_id AND z.active
    ), '[]'::jsonb)
  )
  -- Sin WhatsApp cargado, la clave no va (solo se limpia este nivel, no `zonas`).
  || jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_courier_name,
    'whatsapp', v_courier_whatsapp
  ));
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

  SELECT c.name AS courier_name, c.whatsapp AS courier_whatsapp, o.delivery_zone_name,
         o.delivery_fee_list, o.delivery_fee, o.delivery_fee_reason, o.courier_status, o.courier_note
  INTO v_order
  FROM public.orders o
  JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Nunca el teléfono ni la dirección del cliente.
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_order.courier_name,
    'whatsapp', v_order.courier_whatsapp,
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
