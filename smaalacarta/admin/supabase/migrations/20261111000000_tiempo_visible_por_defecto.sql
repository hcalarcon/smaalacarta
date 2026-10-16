-- El tiempo estimado se muestra por defecto (SEGUIMIENTO-37 y 50):
-- - `business_settings.show_prep_time` pasa a `true` por defecto y los negocios existentes quedan en `true`.
-- - Misma `save_business_settings` de `20261031000000_tiempo_de_preparacion.sql`, con el interruptor en `true`
--   cuando la primera fila se crea sin él.
-- - Misma `public_order_tracking` de `20261110000000_tiempo_visible_si_el_local_lo_cargo.sql`, que vuelve a respetar
--   el interruptor: si el local lo apaga, el cliente no ve la hora aunque la haya cargado.

ALTER TABLE public.business_settings ALTER COLUMN show_prep_time SET DEFAULT true;

UPDATE public.business_settings SET show_prep_time = true WHERE show_prep_time IS DISTINCT FROM true;

CREATE OR REPLACE FUNCTION public.save_business_settings(
  p_business_id uuid,
  p_published boolean,
  p_template text,
  p_tagline text,
  p_primary_color text,
  p_secondary_color text,
  p_header_image_url text,
  p_schedule jsonb,
  p_whatsapp text,
  p_address text,
  p_instagram_url text,
  p_facebook_url text,
  p_temporarily_closed boolean,
  p_closed_message text,
  p_reopens_on date,
  p_logo_url text,
  p_menu_pdf_url text,
  p_theme text,
  p_delivery_options text[],
  p_payment_options text[],
  p_transfer_alias text,
  p_transfer_cbu text,
  p_allow_scheduled_orders boolean,
  p_scheduled_lead_minutes integer,
  p_preorders_enabled boolean,
  p_preorder_cutoffs jsonb,
  p_header_image_x integer,
  p_header_image_y integer,
  p_show_default_images boolean DEFAULT true,
  p_allow_item_notes boolean DEFAULT true,
  p_show_prep_time boolean DEFAULT NULL,
  p_default_prep_minutes integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_settings
    (business_id, published, template, tagline, primary_color, secondary_color,
     header_image_url, schedule, address, instagram_url, facebook_url,
     temporarily_closed, closed_message, reopens_on, logo_url, menu_pdf_url, theme,
     delivery_options, payment_options, transfer_alias, transfer_cbu,
     allow_scheduled_orders, scheduled_lead_minutes, preorders_enabled, preorder_cutoffs,
     header_image_x, header_image_y, show_default_images, allow_item_notes,
     show_prep_time, default_prep_minutes)
  VALUES
    (p_business_id, p_published, p_template, NULLIF(p_tagline, ''), p_primary_color,
     p_secondary_color, NULLIF(p_header_image_url, ''), p_schedule,
     NULLIF(p_address, ''), NULLIF(p_instagram_url, ''), NULLIF(p_facebook_url, ''),
     p_temporarily_closed, NULLIF(p_closed_message, ''), p_reopens_on,
     NULLIF(p_logo_url, ''), NULLIF(p_menu_pdf_url, ''), p_theme,
     p_delivery_options, p_payment_options,
     CASE WHEN 'transferencia' = ANY (p_payment_options) THEN NULLIF(p_transfer_alias, '') END,
     CASE WHEN 'transferencia' = ANY (p_payment_options) THEN NULLIF(p_transfer_cbu, '') END,
     p_allow_scheduled_orders, p_scheduled_lead_minutes, p_preorders_enabled, p_preorder_cutoffs,
     p_header_image_x, p_header_image_y, p_show_default_images, p_allow_item_notes,
     coalesce(p_show_prep_time, true), coalesce(p_default_prep_minutes, 20))
  ON CONFLICT (business_id) DO UPDATE
  SET published = EXCLUDED.published,
      template = EXCLUDED.template,
      tagline = EXCLUDED.tagline,
      primary_color = EXCLUDED.primary_color,
      secondary_color = EXCLUDED.secondary_color,
      header_image_url = EXCLUDED.header_image_url,
      schedule = EXCLUDED.schedule,
      address = EXCLUDED.address,
      instagram_url = EXCLUDED.instagram_url,
      facebook_url = EXCLUDED.facebook_url,
      temporarily_closed = EXCLUDED.temporarily_closed,
      closed_message = EXCLUDED.closed_message,
      reopens_on = EXCLUDED.reopens_on,
      logo_url = EXCLUDED.logo_url,
      menu_pdf_url = EXCLUDED.menu_pdf_url,
      theme = EXCLUDED.theme,
      delivery_options = EXCLUDED.delivery_options,
      payment_options = EXCLUDED.payment_options,
      transfer_alias = EXCLUDED.transfer_alias,
      transfer_cbu = EXCLUDED.transfer_cbu,
      allow_scheduled_orders = EXCLUDED.allow_scheduled_orders,
      scheduled_lead_minutes = EXCLUDED.scheduled_lead_minutes,
      preorders_enabled = EXCLUDED.preorders_enabled,
      preorder_cutoffs = EXCLUDED.preorder_cutoffs,
      header_image_x = EXCLUDED.header_image_x,
      header_image_y = EXCLUDED.header_image_y,
      show_default_images = EXCLUDED.show_default_images,
      allow_item_notes = EXCLUDED.allow_item_notes,
      -- Una llamada que no manda los dos parámetros nuevos no pisa lo que el negocio ya guardó.
      show_prep_time = coalesce(p_show_prep_time, public.business_settings.show_prep_time),
      default_prep_minutes = coalesce(p_default_prep_minutes, public.business_settings.default_prep_minutes),
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer, boolean, boolean, boolean, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer, boolean, boolean, boolean, integer
) TO authenticated;

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

  -- El tiempo estimado (SEGUIMIENTO-37): si el negocio lo muestra (`show_prep_time`, encendido por defecto), el pedido
  -- está en Confirmado o En
  -- preparación y no tiene ya su hora (programado o anticipado). La ventana de 10 minutos es
  -- PREP_WINDOW_MINUTES (admin/src/lib/orders/prep.ts y web/apps/tracker/lib/prep.js).
  IF coalesce(v_order.show_prep_time, true)
     AND v_order.status IN ('confirmed', 'preparing')
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
