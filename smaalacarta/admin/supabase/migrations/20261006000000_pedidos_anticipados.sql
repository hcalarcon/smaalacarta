-- Pedidos anticipados (ADMIN-CONFIG-18 a 20, ADMIN-PEDIDOS-16, PUBLICO-31 a 34, SEGUIMIENTO-19):
-- un negocio que vende solo ciertos días puede recibir pedidos mientras está cerrado, para su
-- próxima apertura, hasta un corte fijo por día de venta (día de la semana y hora, hora de
-- Argentina). El pedido guarda su fecha en `orders.scheduled_for` y se marca con `orders.preorder`.
-- RLS no cambia: son columnas de tablas que ya filtran por `business_id`.

-- ¿Tiene `{"sabado": {"dia": "viernes", "hora": "20:00"}}` la forma de los cortes? Es la
-- restricción de `business_settings.preorder_cutoffs`; la misma forma valida el panel.
CREATE OR REPLACE FUNCTION public.is_valid_preorder_cutoffs(p_cutoffs jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_days constant text[] := ARRAY['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  v_entry record;
BEGIN
  IF jsonb_typeof(p_cutoffs) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;

  FOR v_entry IN SELECT e.key, e.value FROM jsonb_each(p_cutoffs) e LOOP
    IF NOT (v_entry.key = ANY (v_days))
       OR jsonb_typeof(v_entry.value) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_entry.value)) <> 2
       OR jsonb_typeof(v_entry.value -> 'dia') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_entry.value -> 'hora') IS DISTINCT FROM 'string'
       OR NOT ((v_entry.value ->> 'dia') = ANY (v_days))
       OR (v_entry.value ->> 'hora') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_preorder_cutoffs(jsonb) TO anon, authenticated;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS preorders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_cutoffs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_preorder_cutoffs_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_preorder_cutoffs_check
  CHECK (public.is_valid_preorder_cutoffs(preorder_cutoffs));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preorder boolean NOT NULL DEFAULT false;

-- La ventana de pedidos anticipados en `p_now`: la próxima apertura (la primera del día de venta
-- que sigue) y su corte, o ninguna fila si el negocio está abierto, no tiene horarios, ese día no
-- tiene corte o el corte ya pasó (un corte que cae justo en `p_now` ya pasó). El corte de un día
-- de venta es la última vez que cae su día y su hora antes de la primera apertura de ese día (a
-- menos de 7 días, o 7 justos si es el mismo día de la semana y la hora no es anterior a la apertura).
-- Mismo cálculo que `preorderWindow` de `web/apps/menu-app/lib/preorders.js`; un test compara los dos.
CREATE OR REPLACE FUNCTION public.preorder_window(
  p_schedule jsonb,
  p_cutoffs jsonb,
  p_now timestamptz
)
RETURNS TABLE (opens_at timestamptz, cutoff_at timestamptz)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_days constant text[] := ARRAY['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  v_now_local timestamp := p_now AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_offset integer;
  v_date date;
  v_dow integer;
  v_range text;
  v_start integer;
  v_end integer;
  v_first integer;
  v_has_future boolean;
  v_cutoff jsonb;
  v_cut_dow integer;
  v_cut_minutes integer;
  v_back integer;
  v_cut_date date;
  v_candidate timestamp;
  v_first_open timestamp;
  v_cutoff_local timestamp;
  v_cutoff_at timestamptz;
BEGIN
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) IS DISTINCT FROM 'object' OR p_schedule = '{}'::jsonb THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p_cutoffs) IS DISTINCT FROM 'object' OR public.is_open_now(p_schedule, p_now) THEN
    RETURN;
  END IF;

  FOR v_offset IN 0..7 LOOP
    v_date := v_now_local::date + v_offset;
    v_dow := extract(dow FROM v_date)::integer;
    v_first := NULL;
    v_has_future := false;

    IF jsonb_typeof(p_schedule -> v_days[v_dow + 1]) = 'array' THEN
      FOR v_range IN SELECT jsonb_array_elements_text(p_schedule -> v_days[v_dow + 1]) LOOP
        IF v_range !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
          CONTINUE;
        END IF;
        v_start := substr(v_range, 1, 2)::integer * 60 + substr(v_range, 4, 2)::integer;
        v_end := substr(v_range, 7, 2)::integer * 60 + substr(v_range, 10, 2)::integer;
        IF v_start = v_end THEN
          CONTINUE;
        END IF;

        v_first := least(coalesce(v_first, v_start), v_start);
        IF v_date + make_interval(mins => v_start) > v_now_local THEN
          v_has_future := true;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_has_future THEN
      CONTINUE;
    END IF;

    -- Ese es el día de la próxima apertura: su corte decide si se aceptan pedidos.
    v_cutoff := p_cutoffs -> v_days[v_dow + 1];
    IF jsonb_typeof(v_cutoff) IS DISTINCT FROM 'object'
       OR NOT ((v_cutoff ->> 'dia') = ANY (v_days))
       OR (v_cutoff ->> 'hora') IS NULL
       OR (v_cutoff ->> 'hora') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RETURN;
    END IF;

    v_cut_dow := array_position(v_days, v_cutoff ->> 'dia') - 1;
    v_cut_minutes := substr(v_cutoff ->> 'hora', 1, 2)::integer * 60 + substr(v_cutoff ->> 'hora', 4, 2)::integer;
    v_first_open := v_date + make_interval(mins => v_first);
    v_cutoff_local := NULL;

    FOR v_back IN 0..7 LOOP
      v_cut_date := v_date - v_back;
      IF extract(dow FROM v_cut_date)::integer <> v_cut_dow THEN
        CONTINUE;
      END IF;
      v_candidate := v_cut_date + make_interval(mins => v_cut_minutes);
      IF v_candidate < v_first_open THEN
        v_cutoff_local := v_candidate;
        EXIT;
      END IF;
    END LOOP;

    v_cutoff_at := v_cutoff_local AT TIME ZONE 'America/Argentina/Buenos_Aires';
    IF p_now >= v_cutoff_at THEN
      RETURN;
    END IF;

    opens_at := v_first_open AT TIME ZONE 'America/Argentina/Buenos_Aires';
    cutoff_at := v_cutoff_at;
    RETURN NEXT;
    RETURN;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preorder_window(jsonb, jsonb, timestamptz) TO anon, authenticated;

-- `save_business_settings` gana dos parámetros: se reemplaza la versión anterior.
DROP FUNCTION IF EXISTS public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer
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
  p_preorder_cutoffs jsonb
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
     allow_scheduled_orders, scheduled_lead_minutes, preorders_enabled, preorder_cutoffs)
  VALUES
    (p_business_id, p_published, p_template, NULLIF(p_tagline, ''), p_primary_color,
     p_secondary_color, NULLIF(p_header_image_url, ''), p_schedule,
     NULLIF(p_address, ''), NULLIF(p_instagram_url, ''), NULLIF(p_facebook_url, ''),
     p_temporarily_closed, NULLIF(p_closed_message, ''), p_reopens_on,
     NULLIF(p_logo_url, ''), NULLIF(p_menu_pdf_url, ''), p_theme,
     p_delivery_options, p_payment_options,
     CASE WHEN 'transferencia' = ANY (p_payment_options) THEN NULLIF(p_transfer_alias, '') END,
     CASE WHEN 'transferencia' = ANY (p_payment_options) THEN NULLIF(p_transfer_cbu, '') END,
     p_allow_scheduled_orders, p_scheduled_lead_minutes, p_preorders_enabled, p_preorder_cutoffs)
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
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb
) TO authenticated;

-- El menú público entrega en `config` `anticipados` (PUBLICO-31), calculado en el servidor.
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
           END,
           'entrega', to_jsonb(s.delivery_options),
           'pagos', to_jsonb(s.payment_options),
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
    AND (CASE WHEN p_via_path THEN b.plan_web AND NOT b.plan_completo ELSE b.plan_completo END);

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
                 'agotado', p.sold_out
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

-- `create_public_order` gana `p_preorder` (P0013 pedido anticipado no disponible).
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, text, text, jsonb, timestamptz);

CREATE OR REPLACE FUNCTION public.create_public_order(
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

    IF v_kind || ':' || v_id::text = ANY (v_seen) THEN
      RAISE EXCEPTION 'Un producto está repetido en el pedido' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || (v_kind || ':' || v_id::text);

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

    v_position := v_position + 1;
    v_total := v_total + v_line_price * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'kind', v_kind,
      'id', v_id,
      'name', v_line_name,
      'price', v_line_price,
      'quantity', v_quantity,
      'position', v_position
    );
  END LOOP;

  v_number := public.next_order_number(v_business_id);

  INSERT INTO public.orders
    (business_id, order_number, status, total, notes, customer_name, delivery, payment, source,
     scheduled_for, preorder)
  VALUES
    (v_business_id, v_number::text, 'pending', v_total, v_notes, v_name, v_delivery, v_payment, 'web',
     CASE WHEN p_preorder THEN v_preorder_opens_at ELSE p_scheduled_for END, p_preorder)
  RETURNING id, code INTO v_order_id, v_code;

  INSERT INTO public.order_items
    (order_id, business_id, product_id, promotion_id, name, unit_price, quantity, sort_order)
  SELECT v_order_id,
         v_business_id,
         CASE WHEN l ->> 'kind' = 'product' THEN (l ->> 'id')::uuid END,
         CASE WHEN l ->> 'kind' = 'promo' THEN (l ->> 'id')::uuid END,
         l ->> 'name',
         (l ->> 'price')::numeric,
         (l ->> 'quantity')::integer,
         (l ->> 'position')::integer
  FROM jsonb_array_elements(v_lines) AS l;

  INSERT INTO public.order_events (order_id, business_id, status)
  VALUES (v_order_id, v_business_id, 'pending');

  RETURN jsonb_build_object('code', v_code, 'number', v_number, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order(text, text, text, text, text, jsonb, timestamptz, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, text, text, jsonb, timestamptz, boolean)
  TO anon, authenticated;
