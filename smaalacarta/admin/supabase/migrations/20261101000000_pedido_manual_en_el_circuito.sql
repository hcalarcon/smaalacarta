-- El pedido manual entra al circuito (ADMIN-PEDIDOS-39 a 48, ENVIO-137 a 145).
--
-- Hasta acá `create_manual_order` era de antes de los envíos: texto libre para la entrega y el pago, productos
-- tipeados sin opciones, pedido `pending` y fuera del circuito de ofertas. Ahora:
--
-- - Entrega fija: `retiro`, `delivery` (envío con repartidor) y `local` (consumo en el local, solo manual).
-- - Pago: lo que el negocio tiene habilitado (sin Mercado Pago) y `qr` ("QR / billetera virtual"), solo manual.
--   No genera ningún QR: solo registra cómo pagó.
-- - Ítems del menú (`id`, `kind`, `options`, `quantity`, `note`) con el precio que calcula la base, o ítems libres
--   (`name`, `unit_price`, `quantity`, `note`), marcados con `order_items.free`.
-- - Con envío con repartidor: barrio y dirección, y el modo: `favorite` (directo a su favorito, `accepted`),
--   `offers` (busca como cualquier pedido, `searching`) o `self` (lo lleva el local).
-- - Nace `confirmed`, con `source = 'manual'` y sus eventos `pending` y `confirmed`.
--
-- - `resolve_order_lines()` es el armado de líneas (validación, precio, opciones, stock, firma) que antes vivía
--   adentro de `create_public_order_base`: la usan los dos, sin copiar la lógica.
-- - Misma `create_public_order_base` de `20261029000000_notas_por_item.sql`, llamando a `resolve_order_lines()`.
-- - `create_manual_order` cambia de firma: se borra la anterior (7 parámetros) y se crea la de 11.
--
-- El RLS de `order_items` no cambia: es una columna nueva de una tabla que ya filtra por `business_id`.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS free boolean NOT NULL DEFAULT false;

-- Los ítems tipeados de los pedidos manuales que ya existían eran libres.
UPDATE public.order_items i
SET free = true
FROM public.orders o
WHERE o.id = i.order_id
  AND o.source = 'manual'
  AND i.product_id IS NULL
  AND i.promotion_id IS NULL;

-- ---------------------------------------------------------------------------
-- Armado de líneas, compartido por el menú y el pedido manual
-- ---------------------------------------------------------------------------

-- Valida los ítems y calcula las líneas con el precio de la base. Devuelve `{lines, total}`.
-- - `p_allow_notes`: si es falso, la nota se ignora sin error (el interruptor del negocio).
-- - `p_allow_free`: acepta ítems libres (`name` y `unit_price`, sin `id`): solo el pedido manual.
-- - `p_max_quantity`: tope de cantidad por línea (20 en el menú, 99 en el pedido manual).
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

    -- Un mismo producto puede ir en dos líneas con distinta elección (PUBLICO-43): la línea se
    -- identifica por producto y opciones, sin importar el orden en que vinieron.
    v_signature := coalesce((
      SELECT string_agg(
               lower(coalesce(e ->> 'id', '')) || 'x' || coalesce(e ->> 'quantity', ''),
               ',' ORDER BY lower(coalesce(e ->> 'id', ''))
             )
      FROM jsonb_array_elements(v_options) AS e
    ), '');

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
        AND p.business_id = p_business_id
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
        AND pr.business_id = p_business_id
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
      v_resolved := public.resolve_order_options(p_business_id, v_id, v_options);
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
      'options', v_resolved -> 'snapshot',
      'note', v_note
    );
  END LOOP;

  RETURN jsonb_build_object('lines', v_lines, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_lines(uuid, jsonb, boolean, boolean, integer)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- El menú usa el armado compartido
-- ---------------------------------------------------------------------------

-- Misma función de `20261029000000_notas_por_item.sql`: el recorrido de los ítems pasa a
-- `resolve_order_lines` y nada más cambia.
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
  v_allow_notes boolean;
  v_resolved jsonb;
  v_lines jsonb;
  v_total numeric;
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
         s.preorder_cutoffs,
         s.allow_item_notes
  INTO v_business_id, v_closed, v_schedule, v_delivery_options, v_payment_options,
       v_allow_scheduled, v_lead_minutes, v_preorders_enabled, v_cutoffs, v_allow_notes
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

  v_resolved := public.resolve_order_lines(v_business_id, p_items, v_allow_notes, false, 20);
  v_lines := v_resolved -> 'lines';
  v_total := (v_resolved ->> 'total')::numeric;

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
    (order_id, business_id, product_id, promotion_id, name, unit_price, quantity, sort_order, options, note)
  SELECT v_order_id,
         v_business_id,
         CASE WHEN l ->> 'kind' = 'product' THEN (l ->> 'id')::uuid END,
         CASE WHEN l ->> 'kind' = 'promo' THEN (l ->> 'id')::uuid END,
         l ->> 'name',
         (l ->> 'price')::numeric,
         (l ->> 'quantity')::integer,
         (l ->> 'position')::integer,
         -- NULL (no `null` de JSON) cuando el ítem no lleva opciones.
         CASE WHEN jsonb_typeof(l -> 'options') = 'array' THEN l -> 'options' END,
         l ->> 'note'
  FROM jsonb_array_elements(v_lines) AS l;

  INSERT INTO public.order_events (order_id, business_id, status)
  VALUES (v_order_id, v_business_id, 'pending');

  RETURN jsonb_build_object('code', v_code, 'number', v_number, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order_base(text, text, text, text, text, jsonb, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedido manual
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_manual_order(uuid, text, text, text, text, jsonb, timestamptz);

-- `p_courier_mode` (solo con envío con repartidor): `favorite`, `offers` o `self`. Con `favorite` el pedido va
-- directo al favorito efectivo del negocio (`effective_favorite_courier`), que tiene que estar activo y cubrir
-- el barrio. Un pedido manual no pasa por el cobro de Mercado Pago y no le avisa al local (`source = 'manual'`).
CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_business_id uuid,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_delivery_zone uuid DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_courier_mode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_delivery text := NULLIF(btrim(coalesce(p_delivery, '')), '');
  v_payment text := NULLIF(btrim(coalesce(p_payment, '')), '');
  v_notes text := NULLIF(btrim(coalesce(p_notes, '')), '');
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_address text := btrim(coalesce(p_delivery_address, ''));
  v_mode text := NULLIF(btrim(coalesce(p_courier_mode, '')), '');
  v_delivery_options text[] := ARRAY['delivery', 'retiro']::text[];
  v_payment_options text[] := ARRAY['efectivo', 'transferencia', 'tarjeta']::text[];
  v_courier_delivery boolean;
  v_with_courier boolean;
  v_zone_id uuid;
  v_zone_name text;
  v_price numeric;
  v_favorite uuid;
  v_favorite_name text;
  v_courier_status text;
  v_resolved jsonb;
  v_lines jsonb;
  v_total numeric;
  v_order_id uuid;
  v_code text;
  v_number integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = v_uid
      AND bu.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'No sos miembro de este negocio' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'El nombre es obligatorio (hasta 80 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_notes) > 500 THEN
    RAISE EXCEPTION 'Las notas admiten hasta 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Un pedido lleva de 1 a 40 productos' USING ERRCODE = '22023';
  END IF;

  SELECT b.courier_delivery,
         coalesce(s.delivery_options, v_delivery_options),
         coalesce(s.payment_options, v_payment_options)
  INTO v_courier_delivery, v_delivery_options, v_payment_options
  FROM public.businesses b
  LEFT JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.id = p_business_id;

  -- Entrega: lo que el negocio ofrece, más el consumo en el local (solo existe en el pedido manual).
  IF v_delivery IS NULL THEN
    RAISE EXCEPTION 'Elegí cómo se entrega el pedido' USING ERRCODE = '22023';
  END IF;
  IF v_delivery <> 'local' AND NOT (v_delivery = ANY (v_delivery_options)) THEN
    RAISE EXCEPTION 'El negocio no ofrece ese tipo de entrega' USING ERRCODE = 'P0007';
  END IF;

  -- Pago: lo que el negocio acepta, sin Mercado Pago en línea, más QR (solo en el pedido manual).
  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Elegí cómo paga el cliente' USING ERRCODE = '22023';
  END IF;
  IF v_payment <> 'qr'
     AND (v_payment = 'mercadopago' OR NOT (v_payment = ANY (v_payment_options))) THEN
    RAISE EXCEPTION 'El negocio no acepta ese medio de pago' USING ERRCODE = 'P0008';
  END IF;

  v_with_courier := v_courier_delivery AND v_delivery = 'delivery';

  IF p_delivery_zone IS NOT NULL AND NOT v_with_courier THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor para esa entrega' USING ERRCODE = 'P0016';
  END IF;

  -- Teléfono: obligatorio con envío (de 8 a 15 dígitos, como en el menú); en retiro y consumo en el
  -- local es opcional, pero si se carga tiene que ser válido.
  IF v_delivery = 'delivery' AND char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = 'P0018';
  END IF;
  IF v_phone <> '' AND char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = 'P0018';
  END IF;

  IF v_delivery = 'delivery' AND char_length(v_address) > 200 THEN
    RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
  END IF;

  IF v_with_courier THEN
    IF p_delivery_zone IS NULL THEN
      RAISE EXCEPTION 'Elegí el barrio del envío' USING ERRCODE = 'P0016';
    END IF;

    SELECT z.id, z.name, z.price
    INTO v_zone_id, v_zone_name, v_price
    FROM public.delivery_zones z
    WHERE z.id = p_delivery_zone
      AND z.active
      AND EXISTS (
        SELECT 1 FROM public.business_delivery_zones bz
        WHERE bz.business_id = p_business_id AND bz.zone_id = z.id
      )
      AND EXISTS (
        SELECT 1
        FROM public.courier_zone_coverage cc
        JOIN public.couriers c ON c.id = cc.courier_id AND c.active
        WHERE cc.zone_id = z.id
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
    END IF;

    IF char_length(v_address) NOT BETWEEN 5 AND 200 THEN
      RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
    END IF;

    IF v_mode IS NULL OR v_mode NOT IN ('favorite', 'offers', 'self') THEN
      RAISE EXCEPTION 'Elegí cómo se resuelve el envío' USING ERRCODE = '22023';
    END IF;

    IF v_mode = 'favorite' THEN
      v_favorite := public.effective_favorite_courier(p_business_id);

      SELECT c.name INTO v_favorite_name
      FROM public.couriers c
      JOIN public.courier_zone_coverage cc ON cc.courier_id = c.id
      WHERE c.id = v_favorite AND c.active AND cc.zone_id = v_zone_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tu repartidor favorito no está disponible para ese barrio' USING ERRCODE = 'P0016';
      END IF;
    END IF;
  END IF;

  -- Los ítems del menú con el precio de la base, o libres. La nota la escribe el propio local, así
  -- que no depende del interruptor de notas del negocio.
  v_resolved := public.resolve_order_lines(p_business_id, p_items, true, true, 99);
  v_lines := v_resolved -> 'lines';
  v_total := (v_resolved ->> 'total')::numeric;

  v_number := public.next_order_number(p_business_id);

  v_courier_status := CASE
    WHEN NOT v_with_courier THEN NULL
    WHEN v_mode = 'favorite' THEN 'accepted'
    WHEN v_mode = 'self' THEN 'self'
    ELSE 'searching'
  END;

  INSERT INTO public.orders
    (business_id, order_number, status, total, notes, customer_name, delivery, payment, source,
     scheduled_for, payment_status, customer_phone, delivery_address,
     delivery_zone_id, delivery_zone_name, delivery_fee_list, delivery_fee,
     courier_id, courier_status, courier_responded_at, offered_at)
  VALUES
    (p_business_id, v_number::text, 'confirmed', v_total, v_notes, v_name, v_delivery, v_payment, 'manual',
     p_scheduled_for, 'not_required', NULLIF(v_phone, ''),
     CASE WHEN v_delivery = 'delivery' THEN NULLIF(v_address, '') END,
     v_zone_id, v_zone_name, v_price, v_price,
     CASE WHEN v_mode = 'favorite' AND v_with_courier THEN v_favorite END,
     v_courier_status,
     CASE WHEN v_courier_status IN ('accepted', 'self') THEN now() END,
     CASE WHEN v_courier_status = 'searching' THEN now() END)
  RETURNING id, code INTO v_order_id, v_code;

  INSERT INTO public.order_items
    (order_id, business_id, product_id, promotion_id, name, unit_price, quantity, sort_order, options, note, free)
  SELECT v_order_id,
         p_business_id,
         CASE WHEN l ->> 'kind' = 'product' THEN (l ->> 'id')::uuid END,
         CASE WHEN l ->> 'kind' = 'promo' THEN (l ->> 'id')::uuid END,
         l ->> 'name',
         (l ->> 'price')::numeric,
         (l ->> 'quantity')::integer,
         (l ->> 'position')::integer,
         CASE WHEN jsonb_typeof(l -> 'options') = 'array' THEN l -> 'options' END,
         l ->> 'note',
         l ->> 'kind' = 'free'
  FROM jsonb_array_elements(v_lines) AS l;

  -- La línea de tiempo de un pedido del menú recién confirmado: entró y el local lo aceptó.
  -- `clock_timestamp()` y no `now()`: dentro de una transacción `now()` es el mismo para todos y el
  -- orden de la línea de tiempo (`created_at, id`) quedaría librado al azar del id.
  INSERT INTO public.order_events (order_id, business_id, status, changed_by, created_at)
  VALUES (v_order_id, p_business_id, 'pending', v_uid, clock_timestamp());
  INSERT INTO public.order_events (order_id, business_id, status, changed_by, created_at)
  VALUES (v_order_id, p_business_id, 'confirmed', v_uid, clock_timestamp());

  IF v_courier_status = 'accepted' THEN
    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind, created_at)
    VALUES (v_order_id, p_business_id, 'confirmed', v_uid,
            'Envío asignado a ' || v_favorite_name || ', ' || v_time, 'delivery', clock_timestamp());
  ELSIF v_courier_status = 'self' THEN
    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind, created_at)
    VALUES (v_order_id, p_business_id, 'confirmed', v_uid, 'Lo lleva el local, ' || v_time, 'delivery',
            clock_timestamp());
  END IF;

  RETURN jsonb_build_object('id', v_order_id, 'code', v_code, 'number', v_number, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_order(
  uuid, text, text, text, text, jsonb, timestamptz, text, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_order(
  uuid, text, text, text, text, jsonb, timestamptz, text, uuid, text, text
) TO authenticated;
