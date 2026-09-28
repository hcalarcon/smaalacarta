-- Enrutamiento según el plan (RUTAS-4, PDF-5, ESTATICO-5): un negocio con
-- `plan_completo` se sirve por subdominio (como hasta ahora); uno sin
-- `plan_completo` se sirve por el path del dominio raíz, vía un rewrite externo
-- desde `landing/` hacia este proyecto. `public_menu` y `public_business_pdf`
-- ahora reciben `p_via_path`: en `false` (subdominio, el valor de siempre) no
-- cambia nada; en `true` (path) exigen además el plan del servicio
-- (`plan_web`/`plan_pdf`) y que el negocio NO tenga `plan_completo` — si lo
-- tiene, ese negocio se sirve por subdominio, no por path.

DROP FUNCTION IF EXISTS public.public_menu(text);

CREATE OR REPLACE FUNCTION public.public_menu(p_slug text, p_via_path boolean DEFAULT false)
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
           'tipo', 'cliente',
           'telefono', b.whatsapp,
           'colores', jsonb_build_object(
             'primary', s.primary_color,
             'secondary', s.secondary_color
           ),
           'logo', s.logo_url,
           'header', CASE
             WHEN s.header_image_url IS NOT NULL
             THEN jsonb_build_object('imagen', s.header_image_url)
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
           END
         ))
  INTO v_business_id, v_config
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug
    AND s.published
    AND b.active
    AND (NOT p_via_path OR (b.plan_web AND NOT b.plan_completo));

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
             bool_and(p.active) AS all_active,
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
                 'precio', p.price,
                 'imagen', p.image_url,
                 'destacado', coalesce(p.featured, false)
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

REVOKE ALL ON FUNCTION public.public_menu(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_menu(text, boolean) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.public_business_pdf(text);

CREATE OR REPLACE FUNCTION public.public_business_pdf(p_slug text, p_via_path boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_pdf_url text;
BEGIN
  SELECT b.name, s.menu_pdf_url
  INTO v_name, v_pdf_url
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug
    AND b.active
    AND (NOT p_via_path OR (b.plan_pdf AND NOT b.plan_completo));

  IF v_pdf_url IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('nombre', v_name, 'pdf', v_pdf_url);
END;
$$;

REVOKE ALL ON FUNCTION public.public_business_pdf(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_business_pdf(text, boolean) TO anon, authenticated;
