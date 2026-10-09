-- Vista previa del menú real (ADMIN-CONFIG-43).
--
-- 1. `public_menu` se parte en dos: `build_public_menu(p_business_id)` arma el menú de un negocio
--    (config y categorías) y `public_menu(slug, …)` queda con lo suyo: decidir si ese negocio se
--    muestra (published, active y plan) y llamar a la anterior. Contrato y filtros no cambian.
--    El cuerpo de `build_public_menu` es el de `public_menu` de
--    `20261012000000_imagenes_predeterminadas.sql`, la última migración que lo redefine; solo cambia
--    cómo se elige el negocio (por id, sin filtros). No recibe `p_via_path`: en ese cuerpo solo servía
--    para el filtro de plan, que se queda en `public_menu`.
-- 2. `menu_preview(p_business_id)` devuelve el mismo formato a un miembro del negocio (o a un
--    superadmin) aunque no esté publicado ni tenga el plan del servicio: es lo que el panel le manda
--    a la vista previa.

CREATE OR REPLACE FUNCTION public.build_public_menu(p_business_id uuid)
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
  v_show_default boolean;
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
         )),
         s.show_default_images
  INTO v_business_id, v_config, v_show_default
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  LEFT JOIN LATERAL public.preorder_window(s.schedule, s.preorder_cutoffs, now()) pw
    ON s.preorders_enabled
       AND NOT (s.temporarily_closed AND (s.reopens_on IS NULL OR s.reopens_on > v_today))
  WHERE b.id = p_business_id;

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
                 -- La imagen propia siempre gana; sin ella, la ilustración sugerida (una sola vez por producto).
                 'imagen', coalesce(NULLIF(btrim(p.image_url), ''), di.image_url),
                 'imagenIlustrativa', CASE
                   WHEN NULLIF(btrim(p.image_url), '') IS NULL AND di.image_url IS NOT NULL THEN true
                 END,
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
      LEFT JOIN LATERAL (
        SELECT d.image_url
        FROM public.suggest_default_image(p.name, c.name) d
        WHERE v_show_default AND NULLIF(btrim(p.image_url), '') IS NULL
      ) di ON true
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

-- Interna: sin filtros de publicación ni de plan, así que no se llama desde la app.
REVOKE ALL ON FUNCTION public.build_public_menu(uuid) FROM PUBLIC, anon, authenticated;

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
BEGIN
  SELECT b.id
  INTO v_business_id
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
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

  RETURN public.build_public_menu(v_business_id);
END;
$$;

REVOKE ALL ON FUNCTION public.public_menu(text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_menu(text, boolean, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.menu_preview(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_menu jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (
       public.is_super_admin()
       OR EXISTS (
         SELECT 1 FROM public.business_users bu
         WHERE bu.business_id = p_business_id AND bu.user_id = auth.uid()
       )
     )
  THEN
    RAISE EXCEPTION 'Solo un miembro del negocio' USING ERRCODE = '42501';
  END IF;

  v_menu := public.build_public_menu(p_business_id);

  IF v_menu IS NULL THEN
    RAISE EXCEPTION 'El negocio no tiene configuración' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_menu;
END;
$$;

REVOKE ALL ON FUNCTION public.menu_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.menu_preview(uuid) TO authenticated;
