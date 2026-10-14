-- Optimiza el menú público tras 20261102000000_promociones_imagen_y_vigencia.sql.
--
-- El 500 (57014) de ozburguer del 13/10 se debió a que la 20261102 no estaba aplicada en producción; esta migración
-- no lo arregla, es endurecimiento: `build_public_menu` llamaba a `promotion_remaining()` (invoker, recorre
-- `order_items` y `orders` por promoción, sin índice por `promotion_id`) y a `suggest_default_image()` por cada par
-- promoción–producto.
--
-- Arreglo, sin tocar la migración anterior:
-- - Índice parcial `order_items (business_id, promotion_id)`.
-- - Lo vendido se calcula UNA vez por consulta, agrupado, solo de las promociones con stock y de este negocio,
--   dentro de la función del menú (que ya es de su dueño): no depende de permisos de quien llama.
-- - La imagen de cada producto de una promoción se resuelve una sola vez (`pimg`), no por cada promoción.
-- Misma `build_public_menu` de `20261102000000_promociones_imagen_y_vigencia.sql`, mismo resultado.

CREATE INDEX IF NOT EXISTS order_items_business_promotion_idx
  ON public.order_items (business_id, promotion_id)
  WHERE promotion_id IS NOT NULL;

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
           -- Mercado Pago solo se ofrece si el negocio tiene con qué cobrar: credenciales manuales
           -- habilitadas o una conexión OAuth conectada (MP-1, MP-23). De ahí no sale nada más que este dato.
           'pagos', to_jsonb(CASE
             WHEN public.business_has_mp(b.id) THEN s.payment_options
             ELSE array_remove(s.payment_options, 'mercadopago')
           END),
           'transferencia', CASE
             WHEN 'transferencia' = ANY (s.payment_options)
                  AND (s.transfer_alias IS NOT NULL OR s.transfer_cbu IS NOT NULL)
             THEN jsonb_build_object('alias', s.transfer_alias, 'cbu', s.transfer_cbu)
           END,
           'programados', s.allow_scheduled_orders,
           -- El menú ofrece el campo de nota por producto solo si el negocio lo permite (PUBLICO-64).
           'notasPorItem', s.allow_item_notes,
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
    WITH sold AS MATERIALIZED (
      SELECT i.promotion_id, sum(i.quantity)::integer AS units
      FROM public.promotions p2
      JOIN public.order_items i ON i.promotion_id = p2.id AND i.business_id = p2.business_id
      JOIN public.orders o ON o.id = i.order_id AND o.business_id = i.business_id
      WHERE p2.business_id = v_business_id
        AND p2.stock IS NOT NULL
        AND o.status <> 'cancelled'
        AND (p2.stock_set_at IS NULL OR o.created_at >= p2.stock_set_at)
      GROUP BY i.promotion_id
    ),
    pimg AS MATERIALIZED (
      SELECT pp.id AS product_id,
             coalesce(NULLIF(btrim(pp.image_url), ''), di.image_url) AS url,
             NULLIF(btrim(pp.image_url), '') IS NULL AS illustrative
      FROM public.products pp
      JOIN public.categories pc ON pc.id = pp.category_id AND pc.business_id = pp.business_id
      LEFT JOIN LATERAL (
        SELECT d.image_url
        FROM public.suggest_default_image(pp.name, pc.name) d
        WHERE v_show_default AND NULLIF(btrim(pp.image_url), '') IS NULL
      ) di ON true
      WHERE pp.business_id = v_business_id
        AND pp.id IN (
          SELECT pi.product_id FROM public.promotion_items pi
          JOIN public.promotions p3 ON p3.id = pi.promotion_id
          WHERE p3.business_id = v_business_id AND p3.active
        )
        AND coalesce(NULLIF(btrim(pp.image_url), ''), di.image_url) IS NOT NULL
    )
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
             END,
             -- Imagen de la promoción (ADMIN-PROMO-1 a 3): la propia, la del producto elegido o la del
             -- primer producto que tenga una. Es ilustrativa solo si no es una foto del negocio.
             'imagen', CASE
               WHEN NULLIF(btrim(pr.image_url), '') IS NOT NULL THEN btrim(pr.image_url)
               WHEN chosen.url IS NOT NULL THEN chosen.url
               ELSE firstp.url
             END,
             'imagenIlustrativa', CASE
               WHEN NULLIF(btrim(pr.image_url), '') IS NULL
                    AND (CASE WHEN chosen.url IS NOT NULL THEN chosen.illustrative ELSE firstp.illustrative END)
               THEN true
             END,
             -- Vigencia (ADMIN-PROMO-6 y 7): hasta cuándo vale y, cuando quedan pocas, cuántas.
             'validaHasta', CASE
               WHEN pr.valid_until IS NOT NULL
               THEN to_char(pr.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             END,
             'quedan', CASE WHEN rem.n IS NOT NULL AND rem.n <= 5 THEN rem.n END
           )) AS item
    FROM public.promotions pr
    LEFT JOIN sold ON sold.promotion_id = pr.id
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN pr.stock IS NULL THEN NULL
               ELSE greatest(0, pr.stock - coalesce(sold.units, 0))
             END::integer AS n
    ) rem
    LEFT JOIN pimg chosen ON chosen.product_id = pr.image_product_id
      AND EXISTS (
        SELECT 1 FROM public.promotion_items pi
        WHERE pi.promotion_id = pr.id AND pi.product_id = chosen.product_id
      )
    LEFT JOIN LATERAL (
      SELECT pm.url, pm.illustrative
      FROM public.promotion_items pi
      JOIN pimg pm ON pm.product_id = pi.product_id
      WHERE pi.promotion_id = pr.id
      ORDER BY pm.illustrative, pi.sort_order, pi.product_id
      LIMIT 1
    ) firstp ON true
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
      -- Una promoción vencida o agotada no se ofrece (ADMIN-PROMO-6 y 7).
      AND (pr.valid_until IS NULL OR now() <= pr.valid_until)
      AND (rem.n IS NULL OR rem.n > 0)
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

REVOKE ALL ON FUNCTION public.build_public_menu(uuid) FROM PUBLIC, anon, authenticated;
