-- Posición de la imagen de cabecera (ADMIN-CONFIG-25 a 27, PUBLICO-50, ESTATICO-10, SEGUIMIENTO-24):
-- el negocio acomoda qué parte de la imagen se ve en la cabecera. Son dos enteros de 0 a 100, el
-- punto de enfoque (50, 50 es el centro: lo de siempre). El menú los aplica como `background-position`.
-- RLS no cambia: son columnas de `business_settings`, que ya filtra por `business_id`.
--
-- - `save_business_settings`: gana `p_header_image_x` y `p_header_image_y`; el resto, igual que en
--   `20261006000000_pedidos_anticipados.sql`.
-- - `public_menu`: `config.header.posicion`; el resto, igual que en `20261010000000_opciones_en_menu_y_pedidos.sql`.
-- - `public_order_tracking`: `negocio.posicion`; el resto, igual que en la misma migración. El seguimiento
--   lee la cabecera de acá y no de `public_menu`.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS header_image_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS header_image_y integer NOT NULL DEFAULT 50;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_header_image_x_check CHECK (header_image_x BETWEEN 0 AND 100),
  ADD CONSTRAINT business_settings_header_image_y_check CHECK (header_image_y BETWEEN 0 AND 100);

-- `save_business_settings` gana dos parámetros: se reemplaza la versión anterior.
DROP FUNCTION IF EXISTS public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb
);

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
  p_header_image_y integer
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
     header_image_x, header_image_y)
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
     p_header_image_x, p_header_image_y)
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
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer
) TO authenticated;

-- `public_menu`: la cabecera lleva `posicion` {x, y} (PUBLICO-50). Lo demás, igual que antes.
CREATE OR REPLACE FUNCTION public.public_menu(
  p_slug text,
  p_via_path boolean DEFAULT false,
  p_static boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_config jsonb;
  v_offers jsonb;
  v_categories jsonb;
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  SELECT b.id,
         jsonb_strip_nulls(jsonb_build_object(
           'nombre', b.name,
           'descripcion', s.tagline,
           'template', s.template,
           'tema', s.theme,
           'tipo', 'cliente',
           'telefono', b.whatsapp,
           'colores', jsonb_build_object(
             'primary', s.primary_color,
             'secondary', s.secondary_color
           ),
           'logo', s.logo_url,
           'header', CASE
             WHEN s.header_image_url IS NOT NULL
             THEN jsonb_build_object(
               'imagen', s.header_image_url,
               'posicion', jsonb_build_object('x', s.header_image_x, 'y', s.header_image_y)
             )
           END,
           'horarios', CASE WHEN s.schedule <> '{}'::jsonb THEN s.schedule END,
           'direccion', s.address,
           'redes', CASE
             WHEN s.instagram_url IS NOT NULL OR s.facebook_url IS NOT NULL
             THEN jsonb_build_object(
               'instagram', s.instagram_url,
               'facebook', s.facebook_url
             )
           END,
           'cierre', CASE
             WHEN s.temporarily_closed
                  AND (s.reopens_on IS NULL OR s.reopens_on > v_today)
             THEN jsonb_build_object(
               'mensaje', s.closed_message,
               'hasta', s.reopens_on
             )
           END,
           'entrega', to_jsonb(s.delivery_options),
           -- Mercado Pago solo se ofrece si el negocio tiene credenciales habilitadas (MP-1); de
           -- `payment_credentials` no sale nada más que este dato.
           'pagos', to_jsonb(CASE
             WHEN EXISTS (
               SELECT 1 FROM public.payment_credentials pc
               WHERE pc.business_id = b.id AND pc.enabled
             ) THEN s.payment_options
             ELSE array_remove(s.payment_options, 'mercadopago')
           END),
           'transferencia', CASE
             WHEN 'transferencia' = ANY (s.payment_options)
                  AND (s.transfer_alias IS NOT NULL OR s.transfer_cbu IS NOT NULL)
             THEN jsonb_build_object('alias', s.transfer_alias, 'cbu', s.transfer_cbu)
           END,
           'programados', s.allow_scheduled_orders,
           'anticipacionMin', s.scheduled_lead_minutes,
           'anticipados', CASE
             WHEN pw.opens_at IS NOT NULL
             THEN jsonb_build_object(
               'activo', true,
               'proximaApertura', to_char(pw.opens_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'corte', to_char(pw.cutoff_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             )
           END
         ))
  INTO v_business_id, v_config
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  LEFT JOIN LATERAL public.preorder_window(s.schedule, s.preorder_cutoffs, now()) pw
    ON s.preorders_enabled
       AND NOT (s.temporarily_closed AND (s.reopens_on IS NULL OR s.reopens_on > v_today))
  WHERE b.slug = p_slug
    AND s.published
    AND b.active
    AND (
      CASE
        -- Estático (`/menu.html`): exige plan_web; por path, sin plan_completo; por subdominio, con él.
        WHEN p_static THEN b.plan_web AND (CASE WHEN p_via_path THEN NOT b.plan_completo ELSE b.plan_completo END)
        -- Interactivo: solo por subdominio y con plan_completo.
        ELSE b.plan_completo AND NOT p_via_path
      END
    );

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(offer.item ORDER BY offer.created_at, offer.id)
  INTO v_offers
  FROM (
    SELECT pr.id,
           pr.created_at,
           jsonb_strip_nulls(jsonb_build_object(
             'id', pr.id,
             'esPromo', true,
             'nombre', pr.name,
             'descripcion', concat_ws(' · ', NULLIF(pr.description, ''), 'Incluye: ' || t.names),
             'precio', t.final_price,
             'precioAnterior', CASE WHEN t.total > t.final_price THEN t.total END,
             'promo', CASE
               WHEN pr.type = 'percent' THEN trim_scale(pr.discount_percent)::text || '% OFF'
               ELSE 'Combo'
             END
           )) AS item
    FROM public.promotions pr
    CROSS JOIN LATERAL (
      SELECT count(*) AS n,
             bool_and(p.active AND NOT p.sold_out) AS all_active,
             sum(p.price) AS total,
             string_agg(p.name, ', ' ORDER BY i.sort_order) AS names,
             CASE
               WHEN pr.type = 'combo' THEN pr.price
               ELSE round(sum(p.price) * (1 - pr.discount_percent / 100), 2)
             END AS final_price
      FROM public.promotion_items i
      JOIN public.products p
        ON p.id = i.product_id AND p.business_id = i.business_id
      WHERE i.promotion_id = pr.id
    ) t
    WHERE pr.business_id = v_business_id
      AND pr.active
      AND t.n > 0
      AND t.all_active
  ) offer;

  SELECT coalesce(jsonb_agg(cat.item ORDER BY cat.position), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'nombre', c.name,
             'descripcion', c.description,
             'nombre_en', NULLIF(trim(c.name_en), ''),
             'nombre_pt', NULLIF(trim(c.name_pt), ''),
             'descripcion_en', NULLIF(trim(c.description_en), ''),
             'descripcion_pt', NULLIF(trim(c.description_pt), ''),
             'items', prods.items
           )) AS item,
           row_number() OVER (ORDER BY c.sort_order NULLS LAST, c.created_at, c.id) AS position
    FROM public.categories c
    CROSS JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'id', p.id,
                 'nombre', p.name,
                 'descripcion', p.description,
                 'nombre_en', NULLIF(trim(p.name_en), ''),
                 'nombre_pt', NULLIF(trim(p.name_pt), ''),
                 'descripcion_en', NULLIF(trim(p.description_en), ''),
                 'descripcion_pt', NULLIF(trim(p.description_pt), ''),
                 'precio', p.price,
                 'imagen', p.image_url,
                 'destacado', coalesce(p.featured, false),
                 'agotado', p.sold_out,
                 -- Grupos de opciones y extras (PUBLICO-39): solo los activos asociados a este
                 -- producto, con sus opciones activas. Un grupo sin opciones activas no se entrega.
                 'opciones', (
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'id', g.id,
                              'nombre', g.name,
                              'min', g.min_select,
                              'max', g.max_select,
                              'repetir', g.allow_repeat,
                              'opciones', og.opts
                            )
                            ORDER BY pog.sort_order, g.id
                          )
                   FROM public.product_option_groups pog
                   JOIN public.option_groups g
                     ON g.id = pog.group_id AND g.business_id = pog.business_id AND g.active
                   CROSS JOIN LATERAL (
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'id', o.id,
                                'nombre', o.name,
                                'precio', o.price_delta,
                                'agotado', o.sold_out
                              )
                              ORDER BY o.sort_order, o.id
                            ) AS opts
                     FROM public.options o
                     WHERE o.group_id = g.id AND o.business_id = g.business_id AND o.active
                   ) og
                   WHERE pog.product_id = p.id
                     AND pog.business_id = p.business_id
                     AND og.opts IS NOT NULL
                 )
               ))
               ORDER BY p.sort_order NULLS LAST, p.created_at, p.id
             ) AS items
      FROM public.products p
      WHERE p.category_id = c.id
        AND p.business_id = c.business_id
        AND p.active
    ) prods
    WHERE c.business_id = v_business_id
      AND c.active
      AND prods.items IS NOT NULL
  ) cat;

  IF v_offers IS NOT NULL THEN
    v_categories := jsonb_build_array(
      jsonb_build_object('nombre', 'Ofertas', 'tipo', 'ofertas', 'items', v_offers)
    ) || v_categories;
  END IF;

  RETURN jsonb_build_object(
    'config', v_config,
    'menu', jsonb_build_object('categorias', v_categories)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_menu(text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_menu(text, boolean, boolean) TO anon, authenticated;

-- `public_order_tracking`: el negocio lleva `posicion` {x, y} de la cabecera (SEGUIMIENTO-24).
CREATE OR REPLACE FUNCTION public.public_order_tracking(p_code text)
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

  SELECT o.id, o.order_number, o.status, o.total, o.created_at, o.updated_at, o.scheduled_for,
         o.preorder, o.payment, o.payment_status,
         b.name AS business_name, b.whatsapp, b.slug,
         s.template, s.primary_color, s.secondary_color, s.header_image_url,
         s.header_image_x, s.header_image_y
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.business_settings s ON s.business_id = b.id
  WHERE o.code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
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
      'anticipado', CASE WHEN v_order.preorder THEN true END
    ),
    'items', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'nombre', i.name,
                 'cantidad', i.quantity,
                 'precio', i.unit_price,
                 -- Foto de lo elegido (SEGUIMIENTO-22): grupo, nombre, cantidad y precio, sin ids.
                 'opciones', i.options
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
