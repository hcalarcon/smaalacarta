-- Promociones con cantidad por producto y con productos que tienen opciones (ADMIN-PROMOS-1 a 6, PUBLICO-3,
-- ADMIN-PEDIDOS-21). Tarea 55.
--
-- - `promotion_items.quantity` (1 a 20; las promos existentes quedan en 1).
-- - Se sacan los bloqueos de opciones obligatorias en promociones: el trigger `promotion_items_guard_required_group`
--   y su función, la rama de promoción de `guard_product_option_group`, `guard_option_group_required` (que impedía
--   volver obligatorio un grupo de un producto en promoción) y los dos helpers que ya nadie usa.
-- - `save_promotion` recibe `p_items jsonb` (`[{product_id, quantity}]`) en lugar de `p_product_ids uuid[]`: cambia la
--   firma, así que se borra la anterior y se vuelven a dar los permisos.
-- - `build_public_menu` (de `20261120000000_animaciones_y_fondo_del_menu.sql`): totales con precio × cantidad,
--   "Incluye: 3× ...", y la clave `componentes` con los grupos de opciones de cada producto.
-- - `resolve_order_lines` (de `20261102000000_promociones_imagen_y_vigencia.sql`): la línea `promo` acepta
--   `components` (una entrada por unidad), valida cada una con `resolve_order_options`, suma los extras al precio
--   y guarda el detalle en `order_items.options` como `[{producto, opciones}]`. `create_public_order` y
--   `create_manual_order` ya la llaman, así que el pedido manual queda con la misma validación sin duplicar nada.
--
-- No hay tablas nuevas: `promotion_items` conserva su RLS por `business_id`.

ALTER TABLE public.promotion_items
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

ALTER TABLE public.promotion_items DROP CONSTRAINT IF EXISTS promotion_items_quantity_check;
ALTER TABLE public.promotion_items
  ADD CONSTRAINT promotion_items_quantity_check CHECK (quantity BETWEEN 1 AND 20);

DROP TRIGGER IF EXISTS promotion_items_guard_required_group ON public.promotion_items;
DROP FUNCTION IF EXISTS public.guard_promotion_item_required_group();

DROP TRIGGER IF EXISTS option_groups_guard_required ON public.option_groups;
DROP FUNCTION IF EXISTS public.guard_option_group_required();

-- Misma función de `20261009000000_opciones_y_extras.sql`, sin la regla de las promociones.
CREATE OR REPLACE FUNCTION public.guard_product_option_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.product_option_groups WHERE product_id = new.product_id
  ) >= 6 THEN
    RAISE EXCEPTION 'Un producto puede tener hasta 6 grupos de opciones'
      USING ERRCODE = 'P0015';
  END IF;

  RETURN new;
END;
$$;

DROP FUNCTION IF EXISTS public.product_has_required_group(uuid);
DROP FUNCTION IF EXISTS public.product_in_promotion(uuid);

-- ---------------------------------------------------------------------------
-- save_promotion
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.save_promotion(uuid, uuid, text, text, text, numeric, numeric, boolean, uuid[], text, uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.save_promotion(
  p_id uuid,
  p_business_id uuid,
  p_name text,
  p_description text,
  p_type text,
  p_discount_percent numeric,
  p_price numeric,
  p_active boolean,
  p_items jsonb,
  p_image_url text DEFAULT NULL,
  p_image_product_id uuid DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL,
  p_stock integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_product_ids uuid[];
  v_el jsonb;
  v_image_url text := NULLIF(btrim(coalesce(p_image_url, '')), '');
  v_old_valid_until timestamptz;
BEGIN
  -- Productos de la promoción y cuántas unidades de cada uno: `[{product_id, quantity}]` (ADMIN-PROMOS-1).
  IF p_items IS NULL
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Una promoción necesita al menos un producto'
      USING ERRCODE = '22023';
  END IF;

  FOR v_el IN SELECT jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_el) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_el -> 'product_id') IS DISTINCT FROM 'string'
       OR (v_el ->> 'product_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_el -> 'quantity') IS DISTINCT FROM 'number'
       OR (v_el ->> 'quantity') !~ '^[0-9]+$'
       OR (v_el ->> 'quantity')::integer NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'La cantidad de cada producto tiene que ser de 1 a 20'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT array_agg((t.e ->> 'product_id')::uuid ORDER BY t.position)
  INTO v_product_ids
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, position);

  IF (SELECT count(DISTINCT x) FROM unnest(v_product_ids) AS x) <> array_length(v_product_ids, 1) THEN
    RAISE EXCEPTION 'Un producto está repetido en la promoción'
      USING ERRCODE = '22023';
  END IF;

  -- Imagen propia o la de un producto de la promo, no las dos (ADMIN-PROMO-2).
  IF v_image_url IS NOT NULL AND p_image_product_id IS NOT NULL THEN
    RAISE EXCEPTION 'Elegí una imagen propia o la de un producto, no las dos'
      USING ERRCODE = '22023';
  END IF;

  IF p_image_product_id IS NOT NULL AND NOT (p_image_product_id = ANY (v_product_ids)) THEN
    RAISE EXCEPTION 'La imagen tiene que ser de un producto de la promoción'
      USING ERRCODE = '22023';
  END IF;

  IF p_stock IS NOT NULL AND p_stock < 1 THEN
    RAISE EXCEPTION 'Las unidades disponibles tienen que ser 1 o más'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT pr.valid_until INTO v_old_valid_until
    FROM public.promotions pr
    WHERE pr.id = p_id AND pr.business_id = p_business_id;
  END IF;

  -- Una fecha de fin nueva tiene que ser futura; guardar otra cosa de una promo ya vencida no la toca.
  IF p_valid_until IS NOT NULL
     AND p_valid_until IS DISTINCT FROM v_old_valid_until
     AND p_valid_until <= now() THEN
    RAISE EXCEPTION 'La fecha de fin tiene que ser futura'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions
      (business_id, name, description, type, discount_percent, price, active,
       image_url, image_product_id, valid_until, stock, stock_set_at)
    VALUES
      (p_business_id, p_name, p_description, p_type, p_discount_percent, p_price, p_active,
       v_image_url, p_image_product_id, p_valid_until, p_stock,
       CASE WHEN p_stock IS NOT NULL THEN now() END)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions
    SET name = p_name,
        description = p_description,
        type = p_type,
        discount_percent = p_discount_percent,
        price = p_price,
        active = p_active,
        image_url = v_image_url,
        image_product_id = p_image_product_id,
        valid_until = p_valid_until,
        -- Cada cambio del valor reinicia el conteo (ADMIN-PROMO-9): se cuenta desde ahora.
        stock_set_at = CASE
          WHEN p_stock IS NULL THEN NULL
          WHEN stock IS DISTINCT FROM p_stock THEN now()
          ELSE stock_set_at
        END,
        stock = p_stock,
        updated_at = now()
    WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'La promoción no existe' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.promotion_items WHERE promotion_id = v_id;
  END IF;

  INSERT INTO public.promotion_items (promotion_id, product_id, business_id, sort_order, quantity)
  SELECT v_id, (t.e ->> 'product_id')::uuid, p_business_id, t.position - 1, (t.e ->> 'quantity')::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, position);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_promotion(
  uuid, uuid, text, text, text, numeric, numeric, boolean, jsonb, text, uuid, timestamptz, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_promotion(
  uuid, uuid, text, text, text, numeric, numeric, boolean, jsonb, text, uuid, timestamptz, integer
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Menú y pedido
-- ---------------------------------------------------------------------------

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
           'animacionMenu', s.menu_animation,
           'animacionCarga', s.loader_animation,
           'animacionCargaUrl', CASE WHEN s.loader_animation = 'custom' THEN s.loader_custom_url END,
           'fondo', s.background_image_url,
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
             'quedan', CASE WHEN rem.n IS NOT NULL AND rem.n <= 5 THEN rem.n END,
             -- Qué lleva y cuántas unidades de cada producto (ADMIN-PROMOS-1): el cliente elige las opciones
             -- de cada unidad. Los grupos van en el mismo formato que los de un producto suelto.
             'componentes', (
               SELECT jsonb_agg(
                        jsonb_build_object(
                          'id', cp.id,
                          'nombre', cp.name,
                          'cantidad', ci.quantity,
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
                            WHERE pog.product_id = cp.id
                              AND pog.business_id = cp.business_id
                              AND og.opts IS NOT NULL
                          )
                        )
                        ORDER BY ci.sort_order, cp.id
                      )
               FROM public.promotion_items ci
               JOIN public.products cp ON cp.id = ci.product_id AND cp.business_id = ci.business_id
               WHERE ci.promotion_id = pr.id
             )
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
             sum(p.price * i.quantity) AS total,
             -- "Incluye": sin cantidades si todas valen 1 (promos de siempre); con "3× ..." si alguna es mayor.
             CASE
               WHEN bool_or(i.quantity > 1)
               THEN string_agg(i.quantity::text || '× ' || p.name, ', ' ORDER BY i.sort_order, p.id)
               ELSE string_agg(p.name, ', ' ORDER BY i.sort_order, p.id)
             END AS names,
             CASE
               WHEN pr.type = 'combo' THEN pr.price
               ELSE round(sum(p.price * i.quantity) * (1 - pr.discount_percent / 100), 2)
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

CREATE OR REPLACE FUNCTION public.resolve_order_lines(
  p_business_id uuid,
  p_items jsonb,
  p_allow_notes boolean,
  p_allow_free boolean,
  p_max_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_kind text;
  v_id uuid;
  v_quantity integer;
  v_line_name text;
  v_line_price numeric;
  v_line_sold_out boolean;
  v_options jsonb;
  v_note text;
  v_signature text;
  v_resolved jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_total numeric := 0;
  v_position integer := 0;
  -- Unidades de cada promoción dentro de este mismo pedido (ADMIN-PROMO-8).
  v_promo_units jsonb := '{}'::jsonb;
  v_units integer;
  v_remaining integer;
  -- Componentes de una promoción (una entrada por unidad de cada producto).
  v_components jsonb;
  v_comp jsonb;
  v_pitem record;
  v_comp_count integer;
  v_comp_snapshot jsonb;
  v_comp_extra numeric;
  v_comp_res jsonb;
BEGIN
  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
    -- Ítem libre (solo el pedido manual): nombre y precio a mano, sin producto detrás.
    IF p_allow_free
       AND jsonb_typeof(v_item) = 'object'
       AND (v_item -> 'id') IS NULL
       AND (v_item -> 'name') IS NOT NULL THEN
      IF jsonb_typeof(v_item -> 'name') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_item -> 'unit_price') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
         OR (v_item ->> 'quantity') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
      END IF;

      v_line_name := btrim(v_item ->> 'name');
      v_line_price := (v_item ->> 'unit_price')::numeric;
      v_quantity := (v_item ->> 'quantity')::integer;

      IF char_length(v_line_name) NOT BETWEEN 1 AND 100
         OR v_line_price < 0 OR v_line_price > 9999999.99
         OR v_quantity NOT BETWEEN 1 AND p_max_quantity THEN
        RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
      END IF;

      -- La nota la escribe el propio local: no depende del interruptor del negocio.
      v_note := NULL;
      IF jsonb_typeof(v_item -> 'note') = 'string' THEN
        v_note := public.clean_item_note(v_item ->> 'note');
      END IF;

      v_position := v_position + 1;
      v_total := v_total + round(v_line_price, 2) * v_quantity;
      v_lines := v_lines || jsonb_build_object(
        'kind', 'free',
        'name', v_line_name,
        'price', round(v_line_price, 2),
        'quantity', v_quantity,
        'position', v_position,
        'note', v_note
      );

      CONTINUE;
    END IF;

    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item -> 'id') IS DISTINCT FROM 'string'
       OR (v_item ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
       OR (v_item ->> 'quantity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
    END IF;

    v_kind := v_item ->> 'kind';
    v_id := (v_item ->> 'id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    IF v_kind NOT IN ('product', 'promo') OR v_quantity NOT BETWEEN 1 AND p_max_quantity THEN
      RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
    END IF;

    -- Opciones elegidas (PUBLICO-40): una lista de `{id, quantity}` o nada. Su forma se valida
    -- en `resolve_order_options`; acá solo hace falta que sea una lista para firmar la línea.
    v_options := v_item -> 'options';
    IF v_options IS NULL OR jsonb_typeof(v_options) = 'null' THEN
      v_options := '[]'::jsonb;
    ELSIF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Las opciones de un producto no son válidas' USING ERRCODE = 'P0014';
    END IF;

    -- Componentes de una promoción (PUBLICO-3): `[{product_id, options}]`, una entrada por unidad de cada
    -- producto. Su contenido se valida más abajo; acá solo hace falta que sea una lista para firmar la línea.
    v_components := v_item -> 'components';
    IF v_components IS NULL OR jsonb_typeof(v_components) = 'null' THEN
      v_components := '[]'::jsonb;
    ELSIF jsonb_typeof(v_components) IS DISTINCT FROM 'array'
          OR jsonb_array_length(v_components) > 200
          OR (v_kind = 'product' AND jsonb_array_length(v_components) > 0) THEN
      RAISE EXCEPTION 'Las opciones de una promoción no son válidas' USING ERRCODE = 'P0014';
    END IF;

    -- Un mismo producto puede ir en dos líneas con distinta elección (PUBLICO-43): la línea se
    -- identifica por producto y opciones, sin importar el orden en que vinieron.
    v_signature := coalesce((
      SELECT string_agg(
               lower(coalesce(e ->> 'id', '')) || 'x' || coalesce(e ->> 'quantity', ''),
               ',' ORDER BY lower(coalesce(e ->> 'id', ''))
             )
      FROM jsonb_array_elements(v_options) AS e
    ), '');

    -- En una promoción la firma lleva lo elegido en cada unidad, sin importar el orden de las unidades.
    IF jsonb_array_length(v_components) > 0 THEN
      v_signature := v_signature || '#' || coalesce((
        SELECT string_agg(
                 lower(coalesce(c ->> 'product_id', '')) || '=' || coalesce((
                   SELECT string_agg(
                            lower(coalesce(e ->> 'id', '')) || 'x' || coalesce(e ->> 'quantity', ''),
                            ',' ORDER BY lower(coalesce(e ->> 'id', ''))
                          )
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(c -> 'options') = 'array' THEN c -> 'options' ELSE '[]'::jsonb END
                   ) AS e
                 ), ''),
                 ';' ORDER BY lower(coalesce(c ->> 'product_id', '')) || '=' || coalesce((c -> 'options')::text, '')
               )
        FROM jsonb_array_elements(v_components) AS c
      ), '');
    END IF;

    -- Nota del cliente para este producto (PUBLICO-62 a 64): texto libre, se limpia y se recorta a 140. Si el
    -- negocio desactivó las notas, se ignora sin error. Dos líneas con el mismo producto y distinta nota
    -- son líneas distintas, así que la nota entra en la firma.
    v_note := NULL;
    IF p_allow_notes AND jsonb_typeof(v_item -> 'note') = 'string' THEN
      v_note := public.clean_item_note(v_item ->> 'note');
    END IF;
    v_signature := v_signature || '|' || coalesce(v_note, '');

    IF v_kind || ':' || v_id::text || ':' || v_signature = ANY (v_seen) THEN
      RAISE EXCEPTION 'Un producto está repetido en el pedido' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || (v_kind || ':' || v_id::text || ':' || v_signature);

    -- Las opciones de una promoción o un combo van en cada componente, no en la línea.
    IF v_kind = 'promo' AND jsonb_array_length(v_options) > 0 THEN
      RAISE EXCEPTION 'Las opciones de una promoción van en cada producto' USING ERRCODE = 'P0014';
    END IF;

    v_line_name := NULL;
    v_line_price := NULL;
    v_line_sold_out := NULL;

    IF v_kind = 'product' THEN
      -- Mismo criterio que el menú público: producto activo en una categoría activa.
      SELECT p.name, p.price, p.sold_out
      INTO v_line_name, v_line_price, v_line_sold_out
      FROM public.products p
      JOIN public.categories c
        ON c.id = p.category_id AND c.business_id = p.business_id
      WHERE p.id = v_id
        AND p.business_id = p_business_id
        AND p.active
        AND c.active;
    ELSE
      -- Se bloquea la fila de la promoción hasta el final de la transacción: dos pedidos a la vez no
      -- venden más de lo que queda (ADMIN-PROMO-8). El restante se lee después del bloqueo.
      PERFORM 1
      FROM public.promotions lp
      WHERE lp.id = v_id AND lp.business_id = p_business_id
      FOR UPDATE;

      -- Promoción activa con todos sus productos activos; mismo precio que el menú
      -- público (descuento sobre la suma, o precio fijo del combo).
      SELECT pr.name,
             CASE
               WHEN pr.type = 'combo' THEN pr.price
               ELSE round(t.total * (1 - pr.discount_percent / 100), 2)
             END,
             t.any_sold_out
      INTO v_line_name, v_line_price, v_line_sold_out
      FROM public.promotions pr
      CROSS JOIN LATERAL (
        SELECT count(*) AS n,
               bool_and(p.active) AS all_active,
               bool_or(p.sold_out) AS any_sold_out,
               sum(p.price * i.quantity) AS total
        FROM public.promotion_items i
        JOIN public.products p
          ON p.id = i.product_id AND p.business_id = i.business_id
        WHERE i.promotion_id = pr.id
      ) t
      WHERE pr.id = v_id
        AND pr.business_id = p_business_id
        AND pr.active
        AND t.n > 0
        AND t.all_active
        -- Vencida: pasó su hora de fin (ADMIN-PROMO-6).
        AND (pr.valid_until IS NULL OR now() <= pr.valid_until);

      -- Agotada: lo que queda no alcanza para este pedido, contando las unidades de sus propias líneas
      -- (ADMIN-PROMO-7 y 8). Sin stock cargado, no hay tope.
      IF v_line_name IS NOT NULL THEN
        v_remaining := public.promotion_remaining(v_id);
        v_units := coalesce((v_promo_units ->> v_id::text)::integer, 0);

        IF v_remaining IS NOT NULL AND v_remaining < v_units + v_quantity THEN
          v_line_name := NULL;
        END IF;

        v_promo_units := v_promo_units || jsonb_build_object(v_id::text, v_units + v_quantity);
      END IF;
    END IF;

    IF v_line_name IS NULL OR v_line_price IS NULL THEN
      RAISE EXCEPTION 'Un producto ya no está disponible' USING ERRCODE = 'P0001';
    END IF;

    -- Sin stock: se ve en el menú pero no se puede pedir, solo o dentro de una promoción.
    IF v_line_sold_out THEN
      RAISE EXCEPTION 'Un producto está sin stock' USING ERRCODE = 'P0009';
    END IF;

    -- Opciones y extras (PUBLICO-40 a 42): se validan contra los grupos de ESTE producto y el
    -- precio de cada extra sale de la base, nunca del navegador.
    v_resolved := NULL;
    IF v_kind = 'product' THEN
      v_resolved := public.resolve_order_options(p_business_id, v_id, v_options);
      v_line_price := v_line_price + (v_resolved ->> 'extra')::numeric;
    ELSE
      -- Promoción (PUBLICO-3): la cantidad de componentes de cada producto tiene que ser la de la promo.
      -- Sin componentes, se toma una unidad vacía por cada una (vale si ningún producto exige elegir).
      IF jsonb_array_length(v_components) = 0 THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'options', '[]'::jsonb)), '[]'::jsonb)
        INTO v_components
        FROM public.promotion_items i
        CROSS JOIN LATERAL generate_series(1, i.quantity) AS g(n)
        WHERE i.promotion_id = v_id;
        v_comp_snapshot := NULL;
      ELSE
        v_comp_snapshot := '[]'::jsonb;
      END IF;

      FOR v_comp IN SELECT jsonb_array_elements(v_components) LOOP
        IF jsonb_typeof(v_comp) IS DISTINCT FROM 'object'
           OR jsonb_typeof(v_comp -> 'product_id') IS DISTINCT FROM 'string'
           OR (v_comp ->> 'product_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
          RAISE EXCEPTION 'Las opciones de una promoción no son válidas' USING ERRCODE = 'P0014';
        END IF;
      END LOOP;

      -- Ningún componente de un producto que la promoción no lleva, y ni uno más ni uno menos.
      IF jsonb_array_length(v_components) <> (
        SELECT coalesce(sum(i.quantity), 0) FROM public.promotion_items i WHERE i.promotion_id = v_id
      ) THEN
        RAISE EXCEPTION 'Faltan o sobran opciones en la promoción' USING ERRCODE = 'P0014';
      END IF;

      v_comp_extra := 0;
      FOR v_pitem IN
        SELECT i.product_id, i.quantity, p.name
        FROM public.promotion_items i
        JOIN public.products p ON p.id = i.product_id AND p.business_id = i.business_id
        WHERE i.promotion_id = v_id
        ORDER BY i.sort_order, i.product_id
      LOOP
        SELECT count(*) INTO v_comp_count
        FROM jsonb_array_elements(v_components) AS c
        WHERE lower(c ->> 'product_id') = v_pitem.product_id::text;

        IF v_comp_count <> v_pitem.quantity THEN
          RAISE EXCEPTION 'Faltan o sobran opciones en la promoción' USING ERRCODE = 'P0014';
        END IF;

        FOR v_comp IN
          SELECT c FROM jsonb_array_elements(v_components) AS c
          WHERE lower(c ->> 'product_id') = v_pitem.product_id::text
        LOOP
          v_comp_res := public.resolve_order_options(p_business_id, v_pitem.product_id, v_comp -> 'options');
          v_comp_extra := v_comp_extra + (v_comp_res ->> 'extra')::numeric;

          IF v_comp_snapshot IS NOT NULL THEN
            v_comp_snapshot := v_comp_snapshot || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
              'producto', v_pitem.name,
              'opciones', v_comp_res -> 'snapshot'
            )));
          END IF;
        END LOOP;
      END LOOP;

      v_line_price := v_line_price + v_comp_extra;
      v_resolved := jsonb_build_object('snapshot', v_comp_snapshot);
    END IF;

    v_position := v_position + 1;
    v_total := v_total + v_line_price * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'kind', v_kind,
      'id', v_id,
      'name', v_line_name,
      'price', v_line_price,
      'quantity', v_quantity,
      'position', v_position,
      'options', v_resolved -> 'snapshot',
      'note', v_note
    );
  END LOOP;

  RETURN jsonb_build_object('lines', v_lines, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_lines(uuid, jsonb, boolean, boolean, integer)
  FROM PUBLIC, anon, authenticated;
