-- Opciones y extras de producto, parte A: base de datos y panel (ADMIN-OPCIONES-1 a 11).
-- El menú público y los pedidos (`public_menu`, `create_public_order`) no se tocan acá.
--
-- Un grupo de opciones ("Extras", "Sabores", "Toppings") se define una vez por
-- negocio y se asocia a varios productos:
--   option_groups          el grupo y su regla (mínimo, máximo, si se puede repetir).
--   options                las opciones de un grupo, con su precio extra.
--   product_option_groups  qué grupos tiene cada producto, y en qué orden.
--
-- Rangos de error nuevos: P0014 (un producto con grupo obligatorio no puede estar
-- en una promoción) y P0015 (límites de opciones por grupo y de grupos por producto).

-- Destino de las claves compuestas: lo asociado tiene que ser del mismo negocio.
CREATE TABLE IF NOT EXISTS public.option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- 0 = opcional; 1 o más = obligatorio, y es cuántas opciones hay que elegir como mínimo.
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  -- Permite elegir la misma opción más de una vez ("3 bochas de frutilla").
  allow_repeat boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, business_id),
  CONSTRAINT option_groups_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT option_groups_min_check CHECK (min_select >= 0),
  CONSTRAINT option_groups_max_check CHECK (max_select >= 1 AND max_select >= min_select)
);

CREATE INDEX IF NOT EXISTS option_groups_business_id_idx ON public.option_groups(business_id);

CREATE TABLE IF NOT EXISTS public.options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL,
  -- Lo que suma al precio del producto: 0 o más, nunca negativo.
  price_delta numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sold_out boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT options_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT options_price_delta_check CHECK (price_delta >= 0),
  -- Al borrar el grupo desaparecen sus opciones; nunca al revés.
  FOREIGN KEY (group_id, business_id)
    REFERENCES public.option_groups(id, business_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS options_business_id_idx ON public.options(business_id);
CREATE INDEX IF NOT EXISTS options_group_id_idx ON public.options(group_id);

CREATE TABLE IF NOT EXISTS public.product_option_groups (
  product_id uuid NOT NULL,
  group_id uuid NOT NULL,
  business_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id),
  -- Al borrar el producto o el grupo desaparece la asociación; nunca al revés.
  FOREIGN KEY (product_id, business_id)
    REFERENCES public.products(id, business_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, business_id)
    REFERENCES public.option_groups(id, business_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS product_option_groups_business_id_idx
  ON public.product_option_groups(business_id);
CREATE INDEX IF NOT EXISTS product_option_groups_group_id_idx
  ON public.product_option_groups(group_id);

-- RLS: solo los miembros del negocio, en las tres tablas (mismo criterio que
-- `categories` y `products`). La fila se nombra por su tabla: un `business_id`
-- suelto dentro de la subconsulta se resolvería contra `bu`.
ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  member text;
BEGIN
  FOREACH t IN ARRAY ARRAY['option_groups', 'options', 'product_option_groups'] LOOP
    member := format(
      'EXISTS (SELECT 1 FROM public.business_users bu
               WHERE bu.user_id = (select auth.uid()) AND bu.business_id = %I.business_id)',
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (%s)', t || '_select', t, member);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)', t || '_insert', t, member);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
      t || '_update', t, member, member
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (%s)', t || '_delete', t, member);
  END LOOP;
END;
$$;

-- Negocio suspendido: no crea ni edita (ADMIN-OPCIONES-11). Mismo trigger que
-- las demás tablas (`20260930000900_bloqueo_por_suspension.sql`).
DROP TRIGGER IF EXISTS option_groups_guard_active ON public.option_groups;
CREATE TRIGGER option_groups_guard_active
  BEFORE INSERT OR UPDATE ON public.option_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

DROP TRIGGER IF EXISTS options_guard_active ON public.options;
CREATE TRIGGER options_guard_active
  BEFORE INSERT OR UPDATE ON public.options
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

DROP TRIGGER IF EXISTS product_option_groups_guard_active ON public.product_option_groups;
CREATE TRIGGER product_option_groups_guard_active
  BEFORE INSERT OR UPDATE ON public.product_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

-- Un producto con algún grupo obligatorio (`min_select >= 1`) no puede estar en
-- promociones ni combos en esta versión (ADMIN-OPCIONES-10): el precio de la
-- promoción no sabe qué extras se eligieron. Corren con los permisos de quien
-- llama, como el resto: el RLS ya limita lo que ve a su negocio.
CREATE OR REPLACE FUNCTION public.product_has_required_group(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.product_option_groups pog
    JOIN public.option_groups g
      ON g.id = pog.group_id AND g.business_id = pog.business_id
    WHERE pog.product_id = p_product_id AND g.min_select >= 1
  );
$$;

CREATE OR REPLACE FUNCTION public.product_in_promotion(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.promotion_items WHERE product_id = p_product_id
  );
$$;

-- Al agregar un producto a una promoción (también con un INSERT directo, sin
-- pasar por `save_promotion`).
CREATE OR REPLACE FUNCTION public.guard_promotion_item_required_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_name text;
BEGIN
  IF public.product_has_required_group(new.product_id) THEN
    SELECT name INTO v_name FROM public.products WHERE id = new.product_id;

    RAISE EXCEPTION
      'El producto "%" tiene opciones obligatorias y no puede estar en una promoción', v_name
      USING ERRCODE = 'P0014';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS promotion_items_guard_required_group ON public.promotion_items;
CREATE TRIGGER promotion_items_guard_required_group
  BEFORE INSERT ON public.promotion_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_promotion_item_required_group();

-- Al asociar un grupo a un producto: máximo 6 grupos, y un grupo obligatorio no
-- entra a un producto que está en una promoción.
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

  IF public.product_in_promotion(new.product_id) AND EXISTS (
    SELECT 1 FROM public.option_groups g
    WHERE g.id = new.group_id AND g.business_id = new.business_id AND g.min_select >= 1
  ) THEN
    RAISE EXCEPTION
      'Un producto que está en una promoción no puede tener un grupo de opciones obligatorio'
      USING ERRCODE = 'P0014';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS product_option_groups_guard ON public.product_option_groups;
CREATE TRIGGER product_option_groups_guard
  BEFORE INSERT ON public.product_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_option_group();

-- Al volver obligatorio un grupo que ya tiene productos: ninguno puede estar en una promoción.
CREATE OR REPLACE FUNCTION public.guard_option_group_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF new.min_select >= 1 AND old.min_select < 1 AND EXISTS (
    SELECT 1
    FROM public.product_option_groups pog
    JOIN public.promotion_items pi ON pi.product_id = pog.product_id
    WHERE pog.group_id = new.id
  ) THEN
    RAISE EXCEPTION
      'El grupo está en productos que forman parte de una promoción: no puede ser obligatorio'
      USING ERRCODE = 'P0014';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS option_groups_guard_required ON public.option_groups;
CREATE TRIGGER option_groups_guard_required
  BEFORE UPDATE OF min_select ON public.option_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_option_group_required();

-- Máximo 30 opciones por grupo (ADMIN-OPCIONES-4).
CREATE OR REPLACE FUNCTION public.guard_option_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.options WHERE group_id = new.group_id
  ) >= 30 THEN
    RAISE EXCEPTION 'Un grupo puede tener hasta 30 opciones' USING ERRCODE = 'P0015';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS options_guard_limit ON public.options;
CREATE TRIGGER options_guard_limit
  BEFORE INSERT ON public.options
  FOR EACH ROW EXECUTE FUNCTION public.guard_option_limit();

-- Guarda un grupo con sus opciones en un solo paso (ADMIN-OPCIONES-3): o se guarda
-- todo o nada. `p_id` nulo crea; con valor, edita: las opciones con `id` (de ese
-- grupo) se actualizan, las que ya no vienen se borran y las nuevas se crean, todas
-- en el orden recibido. `p_options` es un arreglo JSON de
-- `{ id?, name, price_delta, active, sold_out }`. Corre con los permisos de quien la
-- llama (SECURITY INVOKER): el RLS de cada tabla decide qué puede tocar.
CREATE OR REPLACE FUNCTION public.save_option_group(
  p_id uuid,
  p_business_id uuid,
  p_name text,
  p_min_select integer,
  p_max_select integer,
  p_allow_repeat boolean,
  p_active boolean,
  p_options jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_count integer;
  v_keep uuid[];
  v_opt jsonb;
  v_pos bigint;
BEGIN
  v_count := CASE WHEN jsonb_typeof(p_options) = 'array' THEN jsonb_array_length(p_options) ELSE 0 END;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Un grupo necesita al menos una opción' USING ERRCODE = '22023';
  END IF;

  IF v_count > 30 THEN
    RAISE EXCEPTION 'Un grupo puede tener hasta 30 opciones' USING ERRCODE = 'P0015';
  END IF;

  -- Sin repetir no se puede elegir más opciones de las que hay: un mínimo mayor
  -- no se cumpliría nunca y el cliente quedaría sin poder pedir el producto.
  IF NOT p_allow_repeat AND p_min_select > v_count THEN
    RAISE EXCEPTION 'El mínimo no puede ser mayor que la cantidad de opciones'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.option_groups
      (business_id, name, min_select, max_select, allow_repeat, active)
    VALUES
      (p_business_id, p_name, p_min_select, p_max_select, p_allow_repeat, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.option_groups
    SET name = p_name,
        min_select = p_min_select,
        max_select = p_max_select,
        allow_repeat = p_allow_repeat,
        active = p_active,
        updated_at = now()
    WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'El grupo no existe' USING ERRCODE = 'P0002';
    END IF;

    v_keep := ARRAY(
      SELECT nullif(e->>'id', '')::uuid
      FROM jsonb_array_elements(p_options) AS e
      WHERE nullif(e->>'id', '') IS NOT NULL
    );

    DELETE FROM public.options WHERE group_id = v_id AND NOT (id = ANY (v_keep));
  END IF;

  FOR v_opt, v_pos IN
    SELECT e.value, e.ordinality - 1
    FROM jsonb_array_elements(p_options) WITH ORDINALITY AS e
  LOOP
    UPDATE public.options
    SET name = coalesce(v_opt->>'name', ''),
        price_delta = coalesce((v_opt->>'price_delta')::numeric, 0),
        active = coalesce((v_opt->>'active')::boolean, true),
        sold_out = coalesce((v_opt->>'sold_out')::boolean, false),
        sort_order = v_pos,
        updated_at = now()
    WHERE id = nullif(v_opt->>'id', '')::uuid
      AND group_id = v_id
      AND business_id = p_business_id;

    -- Sin `id`, o con el de una opción que no es de este grupo: opción nueva.
    IF NOT FOUND THEN
      INSERT INTO public.options
        (group_id, business_id, name, price_delta, active, sold_out, sort_order)
      VALUES (
        v_id,
        p_business_id,
        coalesce(v_opt->>'name', ''),
        coalesce((v_opt->>'price_delta')::numeric, 0),
        coalesce((v_opt->>'active')::boolean, true),
        coalesce((v_opt->>'sold_out')::boolean, false),
        v_pos
      );
    END IF;
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_option_group(uuid, uuid, text, integer, integer, boolean, boolean, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_option_group(uuid, uuid, text, integer, integer, boolean, boolean, jsonb)
  TO authenticated;

-- Deja en un producto exactamente estos grupos, en este orden (ADMIN-OPCIONES-6).
-- Atómica: si algo falla (más de 6, un grupo obligatorio en un producto con
-- promoción, un grupo ajeno), queda lo que había.
CREATE OR REPLACE FUNCTION public.set_product_option_groups(
  p_business_id uuid,
  p_product_id uuid,
  p_group_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'El producto no existe' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.product_option_groups
  WHERE product_id = p_product_id AND business_id = p_business_id;

  INSERT INTO public.product_option_groups (product_id, group_id, business_id, sort_order)
  SELECT p_product_id, t.group_id, p_business_id, t.position - 1
  FROM unnest(coalesce(p_group_ids, '{}')) WITH ORDINALITY AS t(group_id, position);
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_option_groups(uuid, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_option_groups(uuid, uuid, uuid[])
  TO authenticated;

-- `save_promotion`, igual que en `20260926000000_orden_y_promociones.sql` salvo por
-- una comprobación nueva: un producto con grupo obligatorio no entra a una
-- promoción (ADMIN-OPCIONES-10), con un mensaje que dice cuáles son.
CREATE OR REPLACE FUNCTION public.save_promotion(
  p_id uuid,
  p_business_id uuid,
  p_name text,
  p_description text,
  p_type text,
  p_discount_percent numeric,
  p_price numeric,
  p_active boolean,
  p_product_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_blocked text;
BEGIN
  IF coalesce(array_length(p_product_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Una promoción necesita al menos un producto'
      USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(p.name, ', ' ORDER BY p.name)
  INTO v_blocked
  FROM public.products p
  WHERE p.business_id = p_business_id
    AND p.id = ANY (p_product_ids)
    AND public.product_has_required_group(p.id);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'Estos productos tienen opciones obligatorias y no pueden estar en una promoción: %', v_blocked
      USING ERRCODE = 'P0014';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions
      (business_id, name, description, type, discount_percent, price, active)
    VALUES
      (p_business_id, p_name, p_description, p_type, p_discount_percent, p_price, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions
    SET name = p_name,
        description = p_description,
        type = p_type,
        discount_percent = p_discount_percent,
        price = p_price,
        active = p_active,
        updated_at = now()
    WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'La promoción no existe' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.promotion_items WHERE promotion_id = v_id;
  END IF;

  INSERT INTO public.promotion_items (promotion_id, product_id, business_id, sort_order)
  SELECT v_id, t.product_id, p_business_id, t.position - 1
  FROM unnest(p_product_ids) WITH ORDINALITY AS t(product_id, position);

  RETURN v_id;
END;
$$;
