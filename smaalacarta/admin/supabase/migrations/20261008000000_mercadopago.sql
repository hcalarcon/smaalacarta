-- Cobro con Mercado Pago, Checkout Pro (MP-1 a MP-7). Fase 1: solo lo usa el negocio de Herni y
-- las credenciales se cargan a mano en SQL; no hay pantalla para dueños.
--
-- - `payment_credentials`: token y secreto del webhook por negocio. RLS activo y SIN políticas: solo la
--   clave de servicio (`service_role`, que saltea el RLS) la lee. Nada de esto sale por `public_menu`.
-- - `orders.payment_status` (`not_required`, `awaiting`, `paid`, `failed`) y `orders.mp_payment_id`.
-- - `order_events.kind`: los eventos de pago ('payment') no son pasos de la línea de tiempo del pedido.
-- - `mercadopago` entra en `payment_options`; solo se ofrece (`public_menu`) y solo se acepta
--   (`create_public_order`) si el negocio tiene credenciales habilitadas.
-- - `set_order_status`: con el pago pendiente o fallido solo se puede cancelar.
-- - `public_order_tracking` entrega `pago` y `anticipado` y deja afuera los eventos de pago.
-- - `confirm_order_payment`: la única forma de marcar un pago; solo `service_role`.

CREATE TABLE IF NOT EXISTS public.payment_credentials (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  mp_access_token text NOT NULL,
  mp_webhook_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sin políticas: ni `anon` ni `authenticated` ven una fila. Además se les quita el permiso.
ALTER TABLE public.payment_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_credentials FROM PUBLIC, anon, authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS mp_payment_id text;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('not_required', 'awaiting', 'paid', 'failed'));

ALTER TABLE public.order_events
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'status';

ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS order_events_kind_check;
ALTER TABLE public.order_events
  ADD CONSTRAINT order_events_kind_check CHECK (kind IN ('status', 'payment'));

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_payment_options_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_payment_options_check
  CHECK (
    cardinality(payment_options) >= 1
    AND payment_options <@ ARRAY['efectivo', 'transferencia', 'tarjeta', 'mercadopago']::text[]
  );

-- `public_menu`: solo cambia `pagos` (misma firma que la de 20261007).
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

REVOKE ALL ON FUNCTION public.public_menu(text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_menu(text, boolean, boolean) TO anon, authenticated;

-- `create_public_order`: acepta `mercadopago` solo con credenciales y crea el pedido en `awaiting`.
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
  -- Mercado Pago exige credenciales habilitadas (MP-1, SEGUIMIENTO-20).
  IF v_payment = 'mercadopago' AND NOT EXISTS (
    SELECT 1 FROM public.payment_credentials pc
    WHERE pc.business_id = v_business_id AND pc.enabled
  ) THEN
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
     scheduled_for, preorder, payment_status)
  VALUES
    (v_business_id, v_number::text, 'pending', v_total, v_notes, v_name, v_delivery, v_payment, 'web',
     CASE WHEN p_preorder THEN v_preorder_opens_at ELSE p_scheduled_for END, p_preorder,
     CASE WHEN v_payment = 'mercadopago' THEN 'awaiting' ELSE 'not_required' END)
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

-- `set_order_status`: con el pago pendiente o fallido solo se puede cancelar.
CREATE OR REPLACE FUNCTION public.set_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_current text;
  v_business_id uuid;
  v_payment_status text;
  v_order text[] := ARRAY['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
BEGIN
  IF p_status IS NULL OR p_status NOT IN
     ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Estado desconocido' USING ERRCODE = '22023';
  END IF;

  SELECT o.status, o.business_id, o.payment_status
  INTO v_current, v_business_id, v_payment_status
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_current IN ('delivered', 'cancelled')
     OR NOT (
       p_status = 'cancelled'
       OR array_position(v_order, p_status) > array_position(v_order, v_current)
     ) THEN
    RAISE EXCEPTION 'No se puede pasar de % a %', v_current, p_status USING ERRCODE = 'P0004';
  END IF;

  -- Un pedido con Mercado Pago que todavía no está pagado solo se puede cancelar (ADMIN-PEDIDOS-18).
  IF v_payment_status IN ('awaiting', 'failed') AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'El pedido espera el pago: solo se puede cancelar' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders
  SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note)
  VALUES (p_order_id, v_business_id, p_status, (select auth.uid()), NULLIF(trim(p_note), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text, text) TO authenticated;

-- `public_order_tracking`: agrega `pago` y `anticipado`; los eventos de pago no se muestran.
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
         s.template, s.primary_color, s.secondary_color, s.header_image_url
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
      'imagen', v_order.header_image_url
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
               jsonb_build_object('nombre', i.name, 'cantidad', i.quantity, 'precio', i.unit_price)
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

-- `confirm_order_payment`: la llaman los endpoints de `admin/` con la clave de servicio después de
-- verificar el pago contra la API de Mercado Pago. Devuelve el estado de pago resultante o
-- 'mismatch' si el monto no coincide con el total del pedido (no confirma). Es idempotente y un
-- pedido pagado nunca vuelve a fallido.
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id uuid,
  p_payment_id text,
  p_status text,
  p_amount numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_status text;
  v_total numeric;
  v_payment text;
  v_payment_status text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'Estado de pago desconocido' USING ERRCODE = '22023';
  END IF;

  SELECT o.business_id, o.status, o.total, o.payment, o.payment_status
  INTO v_business_id, v_status, v_total, v_payment, v_payment_status
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment IS DISTINCT FROM 'mercadopago' THEN
    RAISE EXCEPTION 'El pedido no es con Mercado Pago' USING ERRCODE = '22023';
  END IF;

  -- Ya pagado: nada que hacer (repetir un aviso no duplica el evento ni lo baja a fallido).
  IF v_payment_status = 'paid' THEN
    RETURN 'paid';
  END IF;

  IF p_status = 'paid' THEN
    IF p_amount IS NULL OR p_amount <> v_total THEN
      RETURN 'mismatch';
    END IF;

    UPDATE public.orders
    SET payment_status = 'paid', mp_payment_id = p_payment_id, updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, business_id, status, note, kind)
    VALUES (p_order_id, v_business_id, v_status, 'Pago confirmado con Mercado Pago', 'payment');

    RETURN 'paid';
  END IF;

  IF v_payment_status = 'failed' THEN
    RETURN 'failed';
  END IF;

  UPDATE public.orders
  SET payment_status = 'failed', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, note, kind)
  VALUES (p_order_id, v_business_id, v_status, 'Pago rechazado en Mercado Pago', 'payment');

  RETURN 'failed';
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_order_payment(uuid, text, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text, text, numeric) TO service_role;
