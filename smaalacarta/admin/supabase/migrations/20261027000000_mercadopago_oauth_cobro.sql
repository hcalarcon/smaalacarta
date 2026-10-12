-- Cobrar con la conexión OAuth de Mercado Pago (PR 2 de 3; MP-18 a MP-26).
--
-- 1. `payment_connections.refreshing_until`: arriendo corto de la renovación del token. Mercado Pago rota
--    el `refresh_token` en cada renovación, así que dos renovaciones a la vez gastarían el mismo dos veces.
--    Quien toma el arriendo renueva; el resto espera o usa el token vigente. Sin políticas ni permisos nuevos:
--    la tabla sigue siendo solo de la clave de servicio.
-- 2. `business_has_mp(business_id)`: el negocio tiene con qué cobrar (credenciales manuales habilitadas o
--    conexión OAuth en `connected`). Interna: ni anon ni authenticated la ejecutan.
-- 3. `build_public_menu` (cuerpo de `20261017000000_vista_previa_menu.sql`, la última que lo redefine) y
--    `create_public_order_base` (cuerpo de `20261010000000_opciones_en_menu_y_pedidos.sql`, que
--    `20261018000000_envio_repartos_al_toque.sql` renombró desde `create_public_order`): en cada una cambia
--    SOLO la condición que miraba `payment_credentials`, que ahora llama a `business_has_mp`.
--
-- Parada de emergencia de un negocio: `UPDATE payment_connections SET status = 'needs_reconnect'`; oculta la
-- opción y deja de cobrar (ver docs/MERCADOPAGO.md).

ALTER TABLE public.payment_connections
  ADD COLUMN refreshing_until timestamptz;

CREATE OR REPLACE FUNCTION public.business_has_mp(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.payment_credentials pc
           WHERE pc.business_id = p_business_id AND pc.enabled
         )
      OR EXISTS (
           SELECT 1 FROM public.payment_connections c
           WHERE c.business_id = p_business_id AND c.status = 'connected'
         );
$$;

-- Interna: solo la llaman otras funciones SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.business_has_mp(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- build_public_menu: el menú ofrece Mercado Pago con credenciales manuales o con conexión
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

-- ---------------------------------------------------------------------------
-- create_public_order_base: el pedido con Mercado Pago exige con qué cobrar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_public_order_base(
  p_slug text,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_preorder boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_delivery text := NULLIF(btrim(coalesce(p_delivery, '')), '');
  v_payment text := NULLIF(btrim(coalesce(p_payment, '')), '');
  v_notes text := NULLIF(btrim(coalesce(p_notes, '')), '');
  v_business_id uuid;
  v_closed boolean;
  v_schedule jsonb;
  v_delivery_options text[];
  v_payment_options text[];
  v_allow_scheduled boolean;
  v_lead_minutes integer;
  v_preorders_enabled boolean;
  v_cutoffs jsonb;
  v_preorder_opens_at timestamptz;
  v_item jsonb;
  v_kind text;
  v_id uuid;
  v_quantity integer;
  v_line_name text;
  v_line_price numeric;
  v_line_sold_out boolean;
  v_options jsonb;
  v_signature text;
  v_resolved jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_total numeric := 0;
  v_position integer := 0;
  v_order_id uuid;
  v_code text;
  v_number integer;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'El nombre es obligatorio (hasta 80 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(v_delivery, '')) > 30 OR char_length(coalesce(v_payment, '')) > 30 THEN
    RAISE EXCEPTION 'La entrega y el pago admiten hasta 30 caracteres' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(v_notes, '')) > 500 THEN
    RAISE EXCEPTION 'Las notas admiten hasta 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Un pedido lleva de 1 a 40 productos' USING ERRCODE = '22023';
  END IF;

  SELECT b.id,
         s.temporarily_closed AND (s.reopens_on IS NULL OR s.reopens_on > v_today),
         s.schedule,
         s.delivery_options,
         s.payment_options,
         s.allow_scheduled_orders,
         s.scheduled_lead_minutes,
         s.preorders_enabled,
         s.preorder_cutoffs
  INTO v_business_id, v_closed, v_schedule, v_delivery_options, v_payment_options,
       v_allow_scheduled, v_lead_minutes, v_preorders_enabled, v_cutoffs
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug AND s.published AND b.active AND b.plan_completo;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no existe o no está publicado' USING ERRCODE = 'P0002';
  END IF;

  IF v_closed THEN
    RAISE EXCEPTION 'El negocio está cerrado temporalmente' USING ERRCODE = 'P0005';
  END IF;

  IF p_preorder THEN
    -- Pedido anticipado (ADMIN-CONFIG-18): el negocio está cerrado por horario, los acepta y el
    -- corte de su próxima apertura todavía no pasó. No lleva hora propia: es para esa apertura.
    IF p_scheduled_for IS NOT NULL THEN
      RAISE EXCEPTION 'Un pedido anticipado no lleva hora' USING ERRCODE = '22023';
    END IF;

    SELECT w.opens_at INTO v_preorder_opens_at FROM public.preorder_window(v_schedule, v_cutoffs, now()) w;

    IF NOT v_preorders_enabled OR v_preorder_opens_at IS NULL THEN
      RAISE EXCEPTION 'No se toman pedidos anticipados en este momento' USING ERRCODE = 'P0013';
    END IF;
  ELSIF NOT public.is_open_now(v_schedule, now()) THEN
    RAISE EXCEPTION 'El negocio está fuera de su horario de atención' USING ERRCODE = 'P0006';
  END IF;

  -- Solo lo que el negocio ofrece (ADMIN-CONFIG-11). Sin valor se acepta, como siempre.
  IF v_delivery IS NOT NULL AND NOT (v_delivery = ANY (v_delivery_options)) THEN
    RAISE EXCEPTION 'El negocio no ofrece ese tipo de entrega' USING ERRCODE = 'P0007';
  END IF;
  IF v_payment IS NOT NULL AND NOT (v_payment = ANY (v_payment_options)) THEN
    RAISE EXCEPTION 'El negocio no acepta ese medio de pago' USING ERRCODE = 'P0008';
  END IF;
  -- Mercado Pago exige con qué cobrar: credenciales habilitadas o conexión OAuth conectada
  -- (MP-1, MP-23, SEGUIMIENTO-20).
  IF v_payment = 'mercadopago' AND NOT public.business_has_mp(v_business_id) THEN
    RAISE EXCEPTION 'El negocio no acepta ese medio de pago' USING ERRCODE = 'P0008';
  END IF;

  -- Pedido programado (ADMIN-CONFIG-16): el negocio lo acepta, es para hoy (hora de Argentina),
  -- con la anticipación mínima y dentro de un rango abierto (mismo cálculo que `is_open_now`).
  -- Sin horarios cargados vale cualquier hora de hoy que todavía no pasó.
  IF p_scheduled_for IS NOT NULL THEN
    IF NOT v_allow_scheduled THEN
      RAISE EXCEPTION 'El negocio no acepta pedidos programados' USING ERRCODE = 'P0011';
    END IF;

    IF NOT public.is_schedulable_at(v_schedule, v_lead_minutes, p_scheduled_for, now()) THEN
      RAISE EXCEPTION 'La hora elegida no es válida para este negocio' USING ERRCODE = 'P0012';
    END IF;
  END IF;

  -- Freno a una avalancha de pedidos falsos: 20 por minuto desde el menú.
  IF (
    SELECT count(*)
    FROM public.orders o
    WHERE o.business_id = v_business_id
      AND o.source = 'web'
      AND o.created_at > now() - interval '1 minute'
  ) >= 20 THEN
    RAISE EXCEPTION 'Recibimos demasiados pedidos seguidos: probá en un minuto' USING ERRCODE = 'P0003';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
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

    IF v_kind NOT IN ('product', 'promo') OR v_quantity NOT BETWEEN 1 AND 20 THEN
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

    -- Un mismo producto puede ir en dos líneas con distinta elección (PUBLICO-43): la línea se
    -- identifica por producto y opciones, sin importar el orden en que vinieron.
    v_signature := coalesce((
      SELECT string_agg(
               lower(coalesce(e ->> 'id', '')) || 'x' || coalesce(e ->> 'quantity', ''),
               ',' ORDER BY lower(coalesce(e ->> 'id', ''))
             )
      FROM jsonb_array_elements(v_options) AS e
    ), '');

    IF v_kind || ':' || v_id::text || ':' || v_signature = ANY (v_seen) THEN
      RAISE EXCEPTION 'Un producto está repetido en el pedido' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || (v_kind || ':' || v_id::text || ':' || v_signature);

    -- Una promoción o un combo no lleva opciones.
    IF v_kind = 'promo' AND jsonb_array_length(v_options) > 0 THEN
      RAISE EXCEPTION 'Una promoción no lleva opciones' USING ERRCODE = 'P0014';
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
        AND p.business_id = v_business_id
        AND p.active
        AND c.active;
    ELSE
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
               sum(p.price) AS total
        FROM public.promotion_items i
        JOIN public.products p
          ON p.id = i.product_id AND p.business_id = i.business_id
        WHERE i.promotion_id = pr.id
      ) t
      WHERE pr.id = v_id
        AND pr.business_id = v_business_id
        AND pr.active
        AND t.n > 0
        AND t.all_active;
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
      v_resolved := public.resolve_order_options(v_business_id, v_id, v_options);
      v_line_price := v_line_price + (v_resolved ->> 'extra')::numeric;
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
      'options', v_resolved -> 'snapshot'
    );
  END LOOP;

  v_number := public.next_order_number(v_business_id);

  INSERT INTO public.orders
    (business_id, order_number, status, total, notes, customer_name, delivery, payment, source,
     scheduled_for, preorder, payment_status)
  VALUES
    (v_business_id, v_number::text, 'pending', v_total, v_notes, v_name, v_delivery, v_payment, 'web',
     CASE WHEN p_preorder THEN v_preorder_opens_at ELSE p_scheduled_for END, p_preorder,
     CASE WHEN v_payment = 'mercadopago' THEN 'awaiting' ELSE 'not_required' END)
  RETURNING id, code INTO v_order_id, v_code;

  INSERT INTO public.order_items
    (order_id, business_id, product_id, promotion_id, name, unit_price, quantity, sort_order, options)
  SELECT v_order_id,
         v_business_id,
         CASE WHEN l ->> 'kind' = 'product' THEN (l ->> 'id')::uuid END,
         CASE WHEN l ->> 'kind' = 'promo' THEN (l ->> 'id')::uuid END,
         l ->> 'name',
         (l ->> 'price')::numeric,
         (l ->> 'quantity')::integer,
         (l ->> 'position')::integer,
         -- NULL (no `null` de JSON) cuando el ítem no lleva opciones.
         CASE WHEN jsonb_typeof(l -> 'options') = 'array' THEN l -> 'options' END
  FROM jsonb_array_elements(v_lines) AS l;

  INSERT INTO public.order_events (order_id, business_id, status)
  VALUES (v_order_id, v_business_id, 'pending');

  RETURN jsonb_build_object('code', v_code, 'number', v_number, 'total', v_total);
END;
$$;

-- Interna, como la dejó 20261018000000: solo la llama la envoltura `create_public_order`.
REVOKE ALL ON FUNCTION public.create_public_order_base(text, text, text, text, text, jsonb, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;
