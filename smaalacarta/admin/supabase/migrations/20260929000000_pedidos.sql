-- Pedidos: ítems, línea de tiempo, numeración por negocio, creación desde el menú
-- público y seguimiento por código. (ADMIN-PEDIDOS-1 a 5 y SEGUIMIENTO-1 a 6.)

-- Destino de las claves foráneas compuestas (mismo criterio que products y promotions).
ALTER TABLE public.orders
  ADD CONSTRAINT orders_id_business_id_key UNIQUE (id, business_id);

-- Código de seguimiento: aleatorio e imposible de adivinar (20 caracteres hex, 80 bits,
-- de un UUID v4 generado por el servidor). Es lo único que da acceso a la página de
-- seguimiento de un pedido, así que no es secuencial ni deducible del número.
CREATE OR REPLACE FUNCTION public.new_tracking_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
$$;

GRANT EXECUTE ON FUNCTION public.new_tracking_code() TO authenticated;

-- Datos del pedido. `order_number` (ya existía) pasa a ser el número por negocio.
ALTER TABLE public.orders
  ADD COLUMN code text,
  ADD COLUMN customer_name text,
  ADD COLUMN delivery text,
  ADD COLUMN payment text,
  -- De dónde vino: el menú público o cargado a mano por el negocio.
  ADD COLUMN source text NOT NULL DEFAULT 'web';

UPDATE public.orders SET code = public.new_tracking_code() WHERE code IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN code SET DEFAULT public.new_tracking_code(),
  ADD CONSTRAINT orders_code_key UNIQUE (code),
  ADD CONSTRAINT orders_source_check CHECK (source IN ('web', 'manual')),
  ADD CONSTRAINT orders_customer_name_check
    CHECK (customer_name IS NULL OR char_length(customer_name) <= 80),
  ADD CONSTRAINT orders_delivery_check
    CHECK (delivery IS NULL OR char_length(delivery) <= 30),
  ADD CONSTRAINT orders_payment_check
    CHECK (payment IS NULL OR char_length(payment) <= 30),
  ADD CONSTRAINT orders_notes_check
    CHECK (notes IS NULL OR char_length(notes) <= 500);

-- NOT VALID: se exige en todo pedido nuevo o modificado, sin revisar los que ya
-- existían (la tabla no se usaba antes).
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'))
  NOT VALID;

-- Un número no se repite dentro de un negocio (ADMIN-PEDIDOS-4).
CREATE UNIQUE INDEX IF NOT EXISTS orders_business_number_key
  ON public.orders (business_id, order_number);

CREATE INDEX IF NOT EXISTS orders_business_created_idx
  ON public.orders (business_id, created_at DESC);

-- Contador de números por negocio. Sin políticas: solo lo usan las funciones de
-- abajo (SECURITY DEFINER); ni siquiera un miembro lo toca.
CREATE TABLE IF NOT EXISTS public.order_counters (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.order_counters ENABLE ROW LEVEL SECURITY;

-- Siguiente número del negocio. La fila del contador se bloquea al actualizarla:
-- dos pedidos a la vez se ponen en fila y nunca reciben el mismo número.
CREATE OR REPLACE FUNCTION public.next_order_number(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_number integer;
BEGIN
  INSERT INTO public.order_counters (business_id, last_number)
  VALUES (p_business_id, 1)
  ON CONFLICT (business_id)
  DO UPDATE SET last_number = public.order_counters.last_number + 1
  RETURNING last_number INTO v_number;

  RETURN v_number;
END;
$$;

-- Solo la usan las funciones que crean pedidos: nadie la llama desde la API.
REVOKE ALL ON FUNCTION public.next_order_number(uuid) FROM PUBLIC, anon, authenticated;

-- Ítems del pedido, con el nombre y el precio del momento (ADMIN-PEDIDOS-5). Si el
-- producto o la promoción se borran, el ítem queda: solo pierde el vínculo.
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  business_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  sort_order integer NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id, business_id)
    REFERENCES public.orders(id, business_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);

-- Línea de tiempo: un evento por cada estado por el que pasó el pedido.
CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  business_id uuid NOT NULL,
  status text NOT NULL
    CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Quién hizo el cambio; nulo si lo creó el cliente desde el menú.
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id, business_id)
    REFERENCES public.orders(id, business_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON public.order_events(order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Los miembros del negocio leen sus ítems y su línea de tiempo (ADMIN-PEDIDOS-2). Se
-- escriben solo desde las funciones de abajo; los eventos también los inserta
-- `set_order_status` con los permisos de quien la llama, de ahí el INSERT de miembros.
DROP POLICY IF EXISTS order_items_select ON public.order_items;
CREATE POLICY order_items_select
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = order_items.business_id
  )
);

DROP POLICY IF EXISTS order_events_select ON public.order_events;
CREATE POLICY order_events_select
ON public.order_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = order_events.business_id
  )
);

DROP POLICY IF EXISTS order_events_insert ON public.order_events;
CREATE POLICY order_events_insert
ON public.order_events
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = order_events.business_id
  )
);

-- Crea un pedido desde el menú público, sin sesión (SEGUIMIENTO-1 a 5). El navegador
-- solo dice qué y cuántos: los precios, el total y los nombres salen de la base
-- (SEGUIMIENTO-2), y solo se acepta lo que el menú público muestra (SEGUIMIENTO-3).
-- Es una sola transacción: si algo falla no queda nada.
--
-- p_items: [{"id": uuid, "kind": "product" | "promo", "quantity": 1..20}, …]
-- Devuelve {code, number, total}.
--
-- Errores: 22023 datos inválidos · P0002 negocio inexistente o sin publicar ·
-- P0005 cerrado temporalmente · P0003 demasiados pedidos · P0001 ítem no disponible.
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_slug text,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb
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
  v_item jsonb;
  v_kind text;
  v_id uuid;
  v_quantity integer;
  v_line_name text;
  v_line_price numeric;
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
         s.temporarily_closed AND (s.reopens_on IS NULL OR s.reopens_on > v_today)
  INTO v_business_id, v_closed
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug AND s.published;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no existe o no está publicado' USING ERRCODE = 'P0002';
  END IF;

  IF v_closed THEN
    RAISE EXCEPTION 'El negocio está cerrado temporalmente' USING ERRCODE = 'P0005';
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

    IF v_kind = 'product' THEN
      -- Mismo criterio que el menú público: producto activo en una categoría activa.
      SELECT p.name, p.price
      INTO v_line_name, v_line_price
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
             END
      INTO v_line_name, v_line_price
      FROM public.promotions pr
      CROSS JOIN LATERAL (
        SELECT count(*) AS n,
               bool_and(p.active) AS all_active,
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
    (business_id, order_number, status, total, notes, customer_name, delivery, payment, source)
  VALUES
    (v_business_id, v_number::text, 'pending', v_total, v_notes, v_name, v_delivery, v_payment, 'web')
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

REVOKE ALL ON FUNCTION public.create_public_order(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, text, text, jsonb)
  TO anon, authenticated;

-- El seguimiento de un pedido por su código, sin sesión (SEGUIMIENTO-5). Devuelve
-- solo lo que el cliente necesita ver: el negocio, el número, el estado, el detalle
-- y la línea de tiempo. Sin el nombre del cliente, las notas ni ningún dato interno.
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

  SELECT o.id, o.order_number, o.status, o.total, o.created_at, o.updated_at,
         b.name AS business_name, b.whatsapp, b.slug
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'negocio', jsonb_build_object(
      'nombre', v_order.business_name,
      'telefono', v_order.whatsapp,
      'slug', v_order.slug
    ),
    'pedido', jsonb_build_object(
      'numero', v_order.order_number,
      'estado', v_order.status,
      'total', v_order.total,
      'creado', v_order.created_at,
      'actualizado', v_order.updated_at
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
               jsonb_build_object('estado', e.status, 'fecha', e.created_at)
               ORDER BY e.created_at, e.id
             )
      FROM public.order_events e
      WHERE e.order_id = v_order.id
    ), '[]'::jsonb)
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_tracking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_tracking(text) TO anon, authenticated;

-- Cambia el estado de un pedido (ADMIN-PEDIDOS-1): hacia un estado posterior, o a
-- cancelado; Entregado y Cancelado no cambian. Corre con los permisos de quien la
-- llama (SECURITY INVOKER): el RLS decide qué pedidos ve y puede tocar (ADMIN-PEDIDOS-2).
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_current text;
  v_business_id uuid;
  v_order text[] := ARRAY['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
BEGIN
  IF p_status IS NULL OR p_status NOT IN
     ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Estado desconocido' USING ERRCODE = '22023';
  END IF;

  SELECT o.status, o.business_id
  INTO v_current, v_business_id
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

  UPDATE public.orders
  SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by)
  VALUES (p_order_id, v_business_id, p_status, (select auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;

-- Carga un pedido a mano, con ítems escritos por el negocio (ADMIN-PEDIDOS-3).
-- SECURITY DEFINER para usar el contador de numeración, que nadie toca directo; por
-- eso comprueba la pertenencia al negocio adentro.
--
-- p_items: [{"name": text, "unit_price": número, "quantity": 1..99}, …]
-- Devuelve {id, code, number}.
CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_business_id uuid,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_delivery text := NULLIF(btrim(coalesce(p_delivery, '')), '');
  v_payment text := NULLIF(btrim(coalesce(p_payment, '')), '');
  v_notes text := NULLIF(btrim(coalesce(p_notes, '')), '');
  v_item jsonb;
  v_line_name text;
  v_price numeric;
  v_quantity integer;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_position integer := 0;
  v_order_id uuid;
  v_code text;
  v_number integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'No sos miembro de este negocio' USING ERRCODE = '42501';
  END IF;

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

  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item -> 'name') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item -> 'unit_price') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
       OR (v_item ->> 'quantity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
    END IF;

    v_line_name := btrim(v_item ->> 'name');
    v_price := (v_item ->> 'unit_price')::numeric;
    v_quantity := (v_item ->> 'quantity')::integer;

    IF char_length(v_line_name) NOT BETWEEN 1 AND 100
       OR v_price < 0 OR v_price > 9999999.99
       OR v_quantity NOT BETWEEN 1 AND 99 THEN
      RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
    END IF;

    v_position := v_position + 1;
    v_total := v_total + round(v_price, 2) * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'name', v_line_name,
      'price', round(v_price, 2),
      'quantity', v_quantity,
      'position', v_position
    );
  END LOOP;

  v_number := public.next_order_number(p_business_id);

  INSERT INTO public.orders
    (business_id, order_number, status, total, notes, customer_name, delivery, payment, source)
  VALUES
    (p_business_id, v_number::text, 'pending', v_total, v_notes, v_name, v_delivery, v_payment, 'manual')
  RETURNING id, code INTO v_order_id, v_code;

  INSERT INTO public.order_items
    (order_id, business_id, name, unit_price, quantity, sort_order)
  SELECT v_order_id,
         p_business_id,
         l ->> 'name',
         (l ->> 'price')::numeric,
         (l ->> 'quantity')::integer,
         (l ->> 'position')::integer
  FROM jsonb_array_elements(v_lines) AS l;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by)
  VALUES (v_order_id, p_business_id, 'pending', (select auth.uid()));

  RETURN jsonb_build_object('id', v_order_id, 'code', v_code, 'number', v_number);
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_order(uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_order(uuid, text, text, text, text, jsonb)
  TO authenticated;

-- El menú público ahora manda el `id` de cada producto y promoción, para que el
-- cliente pueda pedirlos (los precios, en cambio, siguen saliendo de la base). Es la
-- misma función de la migración anterior con `id` (y `esPromo` en las ofertas).
CREATE OR REPLACE FUNCTION public.public_menu(p_slug text)
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
  WHERE b.slug = p_slug AND s.published;

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

REVOKE ALL ON FUNCTION public.public_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_menu(text) TO anon, authenticated;
