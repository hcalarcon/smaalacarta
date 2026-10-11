-- Varios repartidores, etapa 2: el circuito nuevo, con búsqueda de repartidor (ENVIO-59 en adelante).
--
-- Reemplaza el "pedir el envío a un repartidor y esperar su OK" por una búsqueda abierta:
--
-- - El pedido con envío nace SIN repartidor (`courier_id` nulo, `courier_status = 'waiting'`).
-- - Cuando el local lo confirma (sale de `pending`), un trigger abre la búsqueda: `searching`,
--   `offered_at = now()` y, si el local tiene un favorito activo que cubre la zona,
--   `offer_favorite_id` / `offer_favorite_until`. La ventana del favorito no la cierra ningún
--   proceso: se calcula con la hora en `courier_sees_order()`.
-- - El primero que toca "Tomar" se lo queda (`courier_take_order`, un solo UPDATE condicional).
--   "Rechazar" y "Devolver" dejan una fila en `courier_order_declines`: ese pedido no vuelve a verse.
-- - Si nadie lo toma, el local lo asigna a mano (`business_assign_courier`) o lo lleva él
--   (`business_self_delivery` → `courier_status = 'self'`).
-- - Se terminó la regla "sin el OK del repartidor no se confirma": se retira P0015 de
--   `set_order_status` y del trigger. En su lugar, `handed_to_courier` solo con el envío
--   `accepted` y un repartidor asignado (P0004).
-- - `set_order_courier` (pedir / aceptar / rechazar a mano) y la TRANSICIÓN de la etapa 1
--   (`business_transition_courier`, `my_delivery_courier`) se borran: nada las usa.
--
-- `create_public_order` sigue siendo la envoltura de 11 parámetros sobre
-- `create_public_order_base` (ver la advertencia de `20261018000000_envio_repartos_al_toque.sql`):
-- acá se redefine la envoltura con la MISMA firma, no se crea otra sobrecarga.
--
-- Errores nuevos: `P0018` (el teléfono del cliente es obligatorio) y `P0019` (el pedido ya lo tomó
-- otro repartidor o ya no está disponible). `P0015` deja de existir en el circuito del envío.

-- ---------------------------------------------------------------------------
-- Columnas y estados
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_courier_status_check;
-- Se mantienen `requested` y `rejected` para los pedidos que ya existen.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_courier_status_check
  CHECK (courier_status IN ('waiting', 'searching', 'accepted', 'self', 'requested', 'rejected'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS offered_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_favorite_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_favorite_until timestamptz;

CREATE INDEX IF NOT EXISTS orders_searching_idx
  ON public.orders (offered_at)
  WHERE courier_status = 'searching';

-- Quién no tiene que volver a ver un pedido (rechazado) o quién lo devolvió. Sin escritura directa.
CREATE TABLE IF NOT EXISTS public.courier_order_declines (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('rejected', 'returned')),
  reason text CHECK (char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, courier_id)
);

CREATE INDEX IF NOT EXISTS courier_order_declines_courier_idx
  ON public.courier_order_declines (courier_id);

ALTER TABLE public.courier_order_declines ENABLE ROW LEVEL SECURITY;

-- Solo lectura: el repartidor ve las suyas y los miembros, las de pedidos de su negocio. No hay
-- políticas de escritura a propósito: las filas las crean las funciones de abajo.
DROP POLICY IF EXISTS courier_order_declines_select_own ON public.courier_order_declines;
CREATE POLICY courier_order_declines_select_own
ON public.courier_order_declines
FOR SELECT
TO authenticated
USING (courier_id = (select public.my_courier_id()));

DROP POLICY IF EXISTS courier_order_declines_select_member ON public.courier_order_declines;
CREATE POLICY courier_order_declines_select_member
ON public.courier_order_declines
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.business_users bu ON bu.business_id = o.business_id
    WHERE o.id = courier_order_declines.order_id
      AND bu.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- Guarda del envío y apertura de la búsqueda (triggers)
-- ---------------------------------------------------------------------------

-- Reemplaza la de `20261018000000`. Los miembros tienen UPDATE por RLS sobre `orders`: las columnas
-- del envío solo las mueven las funciones del circuito (SECURITY DEFINER: ahí `current_user` es el
-- dueño de la función, no `authenticated`). No es SECURITY DEFINER para poder distinguirlo.
CREATE OR REPLACE FUNCTION public.guard_order_courier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (
       new.courier_id IS DISTINCT FROM old.courier_id
       OR new.courier_status IS DISTINCT FROM old.courier_status
       OR new.courier_note IS DISTINCT FROM old.courier_note
       OR new.courier_responded_at IS DISTINCT FROM old.courier_responded_at
       OR new.offered_at IS DISTINCT FROM old.offered_at
       OR new.offer_favorite_id IS DISTINCT FROM old.offer_favorite_id
       OR new.offer_favorite_until IS DISTINCT FROM old.offer_favorite_until
     )
  THEN
    RAISE EXCEPTION 'El repartidor del envío solo se mueve desde el circuito de envíos'
      USING ERRCODE = '42501';
  END IF;

  -- Entregarlo al repartidor exige que alguno lo haya tomado (o que el local lo haya asignado).
  IF new.status = 'handed_to_courier'
     AND old.status IS DISTINCT FROM 'handed_to_courier'
     AND (new.courier_id IS NULL OR new.courier_status IS DISTINCT FROM 'accepted') THEN
    RAISE EXCEPTION 'El pedido todavía no tiene un repartidor que lo haya tomado' USING ERRCODE = 'P0004';
  END IF;

  RETURN new;
END;
$$;

-- Abre la búsqueda cuando el pedido con envío sale de Pendiente, y la cierra si se cancela.
-- Va aparte y es SECURITY DEFINER porque lee la cobertura de los repartidores, que el miembro que
-- confirma no ve por RLS. Se llama `orders_open_courier_search` para que dispare DESPUÉS de
-- `orders_guard_courier` (los triggers corren en orden alfabético): la guarda solo ve el cambio de
-- quien escribió, no el que hace este.
CREATE OR REPLACE FUNCTION public.open_courier_search()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_favorite uuid;
  v_minutes integer;
BEGIN
  -- Pedido con envío que todavía no abrió la búsqueda y sale de Pendiente.
  IF new.courier_id IS NULL
     AND old.courier_status IS NOT DISTINCT FROM 'waiting'
     AND new.courier_status IS NOT DISTINCT FROM 'waiting'
     AND old.status = 'pending'
     AND new.status NOT IN ('pending', 'cancelled') THEN
    new.courier_status := 'searching';
    new.offered_at := now();
    new.offer_favorite_id := NULL;
    new.offer_favorite_until := NULL;

    SELECT s.favorite_courier_id, s.favorite_minutes
    INTO v_favorite, v_minutes
    FROM public.business_settings s
    WHERE s.business_id = new.business_id;

    IF v_favorite IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.couriers c
      JOIN public.courier_zone_coverage cc ON cc.courier_id = c.id
      WHERE c.id = v_favorite AND c.active AND cc.zone_id = new.delivery_zone_id
    ) THEN
      new.offer_favorite_id := v_favorite;
      new.offer_favorite_until := now() + make_interval(mins => v_minutes);
    END IF;

    RETURN new;
  END IF;

  -- Cancelado mientras se buscaba: la búsqueda se cierra y el pedido queda como antes de abrirla.
  IF old.courier_status = 'searching' AND new.status = 'cancelled' AND old.status <> 'cancelled' THEN
    new.courier_status := 'waiting';
    new.offered_at := NULL;
    new.offer_favorite_id := NULL;
    new.offer_favorite_until := NULL;
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.open_courier_search() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_open_courier_search ON public.orders;
CREATE TRIGGER orders_open_courier_search
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.open_courier_search();

-- Los pedidos abiertos de la etapa 1 tenían un repartidor asignado de antemano y esperaban su OK.
-- Con el circuito nuevo ese OK ya no existe: se vuelven pedidos sin repartidor (los que ya pasaron
-- de Pendiente quedan buscando). Los `accepted` y los terminados no se tocan.
UPDATE public.orders
SET courier_id = NULL,
    courier_status = CASE WHEN status = 'pending' THEN 'waiting' ELSE 'searching' END,
    offered_at = CASE WHEN status = 'pending' THEN NULL ELSE now() END,
    courier_requested_at = NULL,
    courier_responded_at = NULL,
    courier_note = NULL
WHERE courier_id IS NOT NULL
  AND courier_status IN ('waiting', 'requested', 'rejected')
  AND status IN ('pending', 'confirmed', 'preparing', 'ready');

-- ---------------------------------------------------------------------------
-- set_order_status: sin P0015
-- ---------------------------------------------------------------------------

-- Misma función de `20261018000000_envio_repartos_al_toque.sql`, sin la regla de P0015 y con la
-- de `handed_to_courier`. Sigue con los permisos de quien la llama. La búsqueda la abre el trigger
-- `orders_open_courier_search` al guardar el estado nuevo.
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
  v_courier_id uuid;
  v_courier_status text;
  v_path text[];
BEGIN
  IF p_status IS NULL OR p_status NOT IN
     ('pending', 'confirmed', 'preparing', 'ready', 'handed_to_courier', 'on_the_way',
      'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Estado desconocido' USING ERRCODE = '22023';
  END IF;

  SELECT o.status, o.business_id, o.payment_status, o.courier_id, o.courier_status
  INTO v_current, v_business_id, v_payment_status, v_courier_id, v_courier_status
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  -- Con un repartidor asignado el camino lleva Entregado al repartidor y En camino. Sin él (sin
  -- envío con repartidor, o el local lo lleva él: `self`), el local lo entrega.
  v_path := CASE
    WHEN v_courier_id IS NULL
      THEN ARRAY['pending', 'confirmed', 'preparing', 'ready', 'delivered']
    ELSE ARRAY['pending', 'confirmed', 'preparing', 'ready', 'handed_to_courier', 'on_the_way',
               'delivered']
  END;

  -- coalesce: un estado que no está en el camino de este pedido no es un paso válido.
  IF v_current IN ('delivered', 'cancelled')
     OR NOT (
       p_status = 'cancelled'
       OR coalesce(array_position(v_path, p_status), 0)
          > coalesce(array_position(v_path, v_current), 0)
     ) THEN
    RAISE EXCEPTION 'No se puede pasar de % a %', v_current, p_status USING ERRCODE = 'P0004';
  END IF;

  -- Con envío, llevarlo en camino y entregarlo es del repartidor (`courier_set_status`).
  IF v_courier_id IS NOT NULL AND p_status IN ('on_the_way', 'delivered') THEN
    RAISE EXCEPTION 'El repartidor es quien lo pasa a %', p_status USING ERRCODE = 'P0004';
  END IF;

  -- Con el envío por resolver (esperando la confirmación o buscando repartidor) no se entrega:
  -- primero hay que asignarlo o llevarlo el local.
  IF p_status = 'delivered' AND v_courier_status IN ('waiting', 'searching') THEN
    RAISE EXCEPTION 'El envío todavía no tiene quién lo lleve: asignalo o llevalo vos' USING ERRCODE = 'P0004';
  END IF;

  -- Entregarlo al repartidor exige que alguno lo haya tomado.
  IF p_status = 'handed_to_courier' AND (v_courier_id IS NULL OR v_courier_status IS DISTINCT FROM 'accepted') THEN
    RAISE EXCEPTION 'El pedido todavía no tiene un repartidor que lo haya tomado' USING ERRCODE = 'P0004';
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

-- ---------------------------------------------------------------------------
-- create_public_order: sin repartidor al nacer, y con teléfono siempre
-- ---------------------------------------------------------------------------

-- Misma envoltura de 11 parámetros de `20261021000000_varios_repartidores_zonas.sql`. Cambia:
-- el pedido con envío ya no lleva repartidor (la búsqueda lo asigna) y el teléfono del cliente es
-- obligatorio en TODOS los pedidos, con o sin envío (P0018).
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_slug text,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_preorder boolean DEFAULT false,
  p_delivery_zone uuid DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery text := NULLIF(btrim(coalesce(p_delivery, '')), '');
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_address text := btrim(coalesce(p_delivery_address, ''));
  v_business_found boolean;
  v_business_id uuid;
  v_courier_delivery boolean;
  v_with_courier boolean;
  v_zone_id uuid;
  v_zone_name text;
  v_price numeric;
  v_result jsonb;
BEGIN
  SELECT b.id, b.courier_delivery INTO v_business_id, v_courier_delivery
  FROM public.businesses b
  WHERE b.slug = p_slug;
  v_business_found := FOUND;

  -- Si el negocio no existe, lo dice la función base (P0002).
  v_with_courier := v_business_found AND v_courier_delivery AND v_delivery = 'delivery';

  IF v_business_found AND p_delivery_zone IS NOT NULL AND NOT v_with_courier THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor para esa entrega' USING ERRCODE = 'P0016';
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
        WHERE bz.business_id = v_business_id AND bz.zone_id = z.id
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
  END IF;

  IF v_business_found AND char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = 'P0018';
  END IF;

  IF v_with_courier AND char_length(v_address) NOT BETWEEN 5 AND 200 THEN
    RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
  END IF;

  v_result := public.create_public_order_base(
    p_slug, p_customer_name, p_delivery, p_payment, p_notes, p_items, p_scheduled_for, p_preorder
  );

  IF v_with_courier THEN
    UPDATE public.orders
    SET courier_id = NULL,
        delivery_zone_id = v_zone_id,
        delivery_zone_name = v_zone_name,
        delivery_fee_list = v_price,
        delivery_fee = v_price,
        customer_phone = v_phone,
        delivery_address = v_address,
        courier_status = 'waiting'
    WHERE code = v_result ->> 'code';

    v_result := v_result || jsonb_build_object('delivery_fee', v_price);
  ELSE
    UPDATE public.orders
    SET customer_phone = v_phone
    WHERE code = v_result ->> 'code';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Qué ve cada repartidor y qué hace con un pedido
-- ---------------------------------------------------------------------------

-- ¿Este repartidor ve este pedido entre los disponibles? Es la única definición de la regla: la
-- usan la lista, Tomar y Rechazar. El pedido tiene que estar buscando, activo, de una zona que el
-- repartidor cubre, sin que él lo haya rechazado o devuelto, y fuera de la ventana del favorito o
-- siendo él el favorito. La ventana se calcula con la hora: no hace falta ningún proceso que la cierre.
CREATE OR REPLACE FUNCTION public.courier_sees_order(p_order_id uuid, p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.couriers c ON c.id = p_courier_id AND c.active
    WHERE o.id = p_order_id
      AND o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.courier_order_declines d
        WHERE d.order_id = o.id AND d.courier_id = p_courier_id
      )
      AND (
        o.offer_favorite_until IS NULL
        OR now() >= o.offer_favorite_until
        OR o.offer_favorite_id = p_courier_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.courier_sees_order(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Los pedidos que el repartidor puede tomar ahora. Antes de tomarlo no ve nada del cliente
-- (ni nombre, ni teléfono, ni dirección, ni notas ni productos): solo lo que necesita para decidir.
CREATE OR REPLACE FUNCTION public.courier_available_orders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.id,
               'numero', o.order_number,
               'estado', o.status,
               'creado', o.created_at,
               'ofrecido_el', o.offered_at,
               'programado', o.scheduled_for,
               'anticipado', o.preorder,
               'negocio', jsonb_build_object('nombre', b.name, 'direccion', s.address),
               'total', o.total,
               'pago', o.payment,
               'pago_estado', o.payment_status,
               'envio', jsonb_build_object(
                 'zona', o.delivery_zone_name,
                 'precio_lista', o.delivery_fee_list,
                 'precio', o.delivery_fee
               )
             )
             ORDER BY o.offered_at, o.id
           )
    FROM public.orders o
    JOIN public.businesses b ON b.id = o.business_id
    LEFT JOIN public.business_settings s ON s.business_id = b.id
    WHERE o.courier_status = 'searching'
      AND public.courier_sees_order(o.id, v_courier)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_available_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_available_orders() TO authenticated;

-- Tomar el pedido: el primero que llega se lo queda. Un solo UPDATE condicional, así dos
-- repartidores a la vez no pueden tomarlo los dos. El precio final puede cambiar, con motivo.
CREATE OR REPLACE FUNCTION public.courier_take_order(
  p_order_id uuid,
  p_price numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_name text;
  v_fee numeric;
  v_changed boolean := false;
  v_order record;
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  SELECT o.delivery_fee INTO v_fee
  FROM public.orders o
  WHERE o.id = p_order_id AND public.courier_sees_order(o.id, v_courier);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ya lo tomó otro repartidor o ya no está disponible' USING ERRCODE = 'P0019';
  END IF;

  IF char_length(coalesce(v_note, '')) > 120 THEN
    RAISE EXCEPTION 'La nota admite hasta 120 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_price IS NOT NULL AND p_price IS DISTINCT FROM v_fee THEN
    IF p_price < 0 OR p_price >= 100000000 THEN
      RAISE EXCEPTION 'El precio del envío no es válido' USING ERRCODE = '22023';
    END IF;
    IF v_reason IS NULL OR char_length(v_reason) > 200 THEN
      RAISE EXCEPTION 'Cambiar el precio del envío exige un motivo (hasta 200 caracteres)'
        USING ERRCODE = '22023';
    END IF;
    v_changed := true;
  END IF;

  SELECT c.name INTO v_name FROM public.couriers c WHERE c.id = v_courier;

  UPDATE public.orders o
  SET courier_id = v_courier,
      courier_status = 'accepted',
      courier_note = v_note,
      courier_responded_at = now(),
      offer_favorite_id = NULL,
      offer_favorite_until = NULL,
      delivery_fee = CASE WHEN v_changed THEN p_price ELSE o.delivery_fee END,
      delivery_fee_reason = CASE WHEN v_changed THEN v_reason ELSE o.delivery_fee_reason END,
      delivery_fee_changed_by = CASE WHEN v_changed THEN v_uid ELSE o.delivery_fee_changed_by END,
      delivery_fee_changed_at = CASE WHEN v_changed THEN now() ELSE o.delivery_fee_changed_at END,
      updated_at = now()
  WHERE o.id = p_order_id
    AND o.courier_status = 'searching'
    AND o.courier_id IS NULL
    AND public.courier_sees_order(o.id, v_courier)
  RETURNING o.business_id, o.status INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ya lo tomó otro repartidor o ya no está disponible' USING ERRCODE = 'P0019';
  END IF;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Envío tomado por ' || v_name || coalesce(': ' || v_note, '') || ', ' || v_time,
    'delivery'
  );

  IF v_changed THEN
    INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
    VALUES (
      p_order_id, v_order.business_id, v_order.status, v_uid,
      'Precio del envío: $' || replace(to_char(v_fee, 'FM999,999,990'), ',', '.')
        || ' → $' || replace(to_char(p_price, 'FM999,999,990'), ',', '.')
        || ' (' || v_reason || ')',
      'delivery'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_take_order(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_take_order(uuid, numeric, text, text) TO authenticated;

-- Rechazar: ese pedido deja de verse para este repartidor.
CREATE OR REPLACE FUNCTION public.courier_decline_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF NOT public.courier_sees_order(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'Ya lo tomó otro repartidor o ya no está disponible' USING ERRCODE = 'P0019';
  END IF;

  INSERT INTO public.courier_order_declines (order_id, courier_id, kind)
  VALUES (p_order_id, v_courier, 'rejected')
  ON CONFLICT (order_id, courier_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_decline_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_decline_order(uuid) TO authenticated;

-- Devolver un pedido tomado, antes de que el local se lo entregue. Vuelve a todos los repartidores
-- (sin ventana del favorito), menos a quien lo devolvió, y con el precio de lista.
CREATE OR REPLACE FUNCTION public.courier_return_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
  v_name text;
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.business_id, o.status, o.courier_status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.courier_id = v_courier
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.courier_status IS DISTINCT FROM 'accepted'
     OR v_order.status NOT IN ('pending', 'confirmed', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'El pedido ya no se puede devolver' USING ERRCODE = 'P0004';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'Devolver el pedido exige un motivo (hasta 200 caracteres)' USING ERRCODE = '22023';
  END IF;

  SELECT c.name INTO v_name FROM public.couriers c WHERE c.id = v_courier;

  UPDATE public.orders
  SET courier_id = NULL,
      courier_status = 'searching',
      courier_note = NULL,
      courier_responded_at = NULL,
      offered_at = now(),
      offer_favorite_id = NULL,
      offer_favorite_until = NULL,
      delivery_fee = delivery_fee_list,
      delivery_fee_reason = NULL,
      delivery_fee_changed_by = NULL,
      delivery_fee_changed_at = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.courier_order_declines (order_id, courier_id, kind, reason)
  VALUES (p_order_id, v_courier, 'returned', v_reason)
  ON CONFLICT (order_id, courier_id)
  DO UPDATE SET kind = 'returned', reason = excluded.reason, created_at = now();

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Envío devuelto por ' || v_name || ': ' || v_reason || ', ' || v_time,
    'delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_return_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_return_order(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Del lado del local
-- ---------------------------------------------------------------------------

-- Asignar a mano a un repartidor con quien el local habló por WhatsApp. Tiene que estar activo y
-- cubrir la zona del pedido. Quien llama es miembro del negocio del pedido.
CREATE OR REPLACE FUNCTION public.business_assign_courier(
  p_order_id uuid,
  p_courier_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.business_id, o.status, o.courier_status, o.delivery_zone_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
    )
  FOR UPDATE;

  -- Quien no es del negocio no se entera de que el pedido existe.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.courier_status IS DISTINCT FROM 'searching' OR v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'El pedido no está buscando repartidor' USING ERRCODE = 'P0004';
  END IF;

  IF char_length(coalesce(v_note, '')) > 120 THEN
    RAISE EXCEPTION 'La nota admite hasta 120 caracteres' USING ERRCODE = '22023';
  END IF;

  SELECT c.name INTO v_name
  FROM public.couriers c
  JOIN public.courier_zone_coverage cc ON cc.courier_id = c.id
  WHERE c.id = p_courier_id AND c.active AND cc.zone_id = v_order.delivery_zone_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El repartidor no está activo o no cubre la zona del pedido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET courier_id = p_courier_id,
      courier_status = 'accepted',
      courier_note = v_note,
      courier_responded_at = now(),
      offer_favorite_id = NULL,
      offer_favorite_until = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Envío asignado a ' || v_name || coalesce(': ' || v_note, '') || ', ' || v_time,
    'delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_assign_courier(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_assign_courier(uuid, uuid, text) TO authenticated;

-- "Lo llevo yo": el local resuelve el envío él mismo. El pedido sigue el camino sin repartidor.
CREATE OR REPLACE FUNCTION public.business_self_delivery(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.business_id, o.status, o.courier_status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.courier_status IS DISTINCT FROM 'searching' OR v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'El pedido no está buscando repartidor' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.orders
  SET courier_status = 'self',
      courier_responded_at = now(),
      offer_favorite_id = NULL,
      offer_favorite_until = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (p_order_id, v_order.business_id, v_order.status, v_uid, 'Lo lleva el local, ' || v_time, 'delivery');
END;
$$;

REVOKE ALL ON FUNCTION public.business_self_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_self_delivery(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ve el cliente, sin sesión
-- ---------------------------------------------------------------------------

-- Misma `public_delivery_zones` de `20261021000000_varios_repartidores_zonas.sql`, sin `repartidor`
-- ni `whatsapp`: al pedir todavía no hay repartidor conocido. Es nula si el local no tiene ninguna zona
-- cubierta por un repartidor activo.
CREATE OR REPLACE FUNCTION public.public_delivery_zones(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_zones jsonb;
BEGIN
  SELECT b.id
  INTO v_business_id
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug
    AND s.published
    AND b.active
    AND b.plan_completo
    AND b.courier_delivery;

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object('id', z.id, 'nombre', z.name, 'precio', z.price)
           ORDER BY z.sort_order, z.name
         )
  INTO v_zones
  FROM public.delivery_zones z
  JOIN public.business_delivery_zones bz ON bz.zone_id = z.id AND bz.business_id = v_business_id
  WHERE z.active
    AND EXISTS (
      SELECT 1
      FROM public.courier_zone_coverage cc
      JOIN public.couriers c ON c.id = cc.courier_id AND c.active
      WHERE cc.zone_id = z.id
    );

  -- Sin ninguna zona que algún repartidor activo cubra, el local no ofrece envío con repartidor.
  IF v_zones IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('zonas', v_zones);
END;
$$;

REVOKE ALL ON FUNCTION public.public_delivery_zones(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_delivery_zones(text) TO anon, authenticated;

-- Misma `public_order_delivery` de `20261020000000_telefono_repartidor_publico.sql`. Ahora el
-- pedido puede no tener repartidor todavía (LEFT JOIN): `waiting`, `searching` y `self` no llevan
-- nombre; `accepted` trae el nombre y el WhatsApp. Nunca el teléfono ni la dirección del cliente.
CREATE OR REPLACE FUNCTION public.public_order_delivery(p_code text)
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

  SELECT c.name AS courier_name, c.whatsapp AS courier_whatsapp, o.delivery_zone_name,
         o.delivery_fee_list, o.delivery_fee, o.delivery_fee_reason, o.courier_status, o.courier_note
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code
    AND o.courier_status IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_order.courier_name,
    'whatsapp', v_order.courier_whatsapp,
    'zona', v_order.delivery_zone_name,
    'precio_lista', v_order.delivery_fee_list,
    'precio', v_order.delivery_fee,
    'motivo_cambio', v_order.delivery_fee_reason,
    'estado', v_order.courier_status,
    'nota', v_order.courier_note
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fuera lo que ya nadie usa
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.set_order_courier(uuid, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.my_delivery_courier();
DROP FUNCTION IF EXISTS public.business_transition_courier(uuid);
