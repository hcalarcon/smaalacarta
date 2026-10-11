-- Varios repartidores, etapa 2b: el cliente elige el repartidor entre ofertas (ENVIO-95 en adelante).
--
-- Cambia el circuito de la etapa 2 (`20261022000000_busqueda_de_repartidor.sql`, que no se edita):
--
-- - El pedido con envío nace BUSCANDO (`courier_status = 'searching'`, `offered_at = now()`), sin
--   esperar a que el local lo confirme. Se va el trigger que abría la búsqueda.
-- - El repartidor ya no "toma": OFERTA (`courier_make_offer`), con el precio de lista o con otro y,
--   si cambia el precio, un motivo. `courier_take_order` deja de existir.
-- - El cliente elige entre las ofertas desde su seguimiento (`public_choose_courier`, por el código
--   del pedido, que es secreto). Si no elige, a los 5 minutos de la primera oferta se elige sola la
--   más barata (`settle_courier_offers`).
-- - Se termina la ventana exclusiva del favorito: `favorite_courier_id` queda solo para ordenar la
--   oferta del favorito primero ("Recomendado por el local") y para desempatar. Se borran
--   `offer_favorite_id`, `offer_favorite_until` y `business_settings.favorite_minutes`.
--
-- Por qué las ofertas se filtran por pedido Y por repartidor: `courier_offers` es la única tabla donde
-- un repartidor deja un precio que otros repartidores no pueden ver. Cada fila es de un par
-- (pedido, repartidor); un repartidor solo ve las suyas (política por `my_courier_id()`) y el local, las
-- de pedidos de su negocio. Quien ofrece nunca ve nombres ni precios de los demás: la lista de
-- disponibles trae solo cuántas ofertas hay. El cliente no lee la tabla: ve las ofertas abiertas de
-- SU pedido por `public_order_delivery(código)`.
--
-- Una oferta cerrada (`closed_at`) no se borra: cuando el cliente elige, el local asigna a mano o lo
-- lleva él, o el pedido se cancela, las ofertas abiertas se cierran para que el repartidor vea
-- "El cliente eligió otro repartidor" / "Cancelado por el local". Si el elegido devuelve el pedido,
-- las ofertas de los demás se reabren.
--
-- La elección automática se resuelve de forma PEREZOSA, sin pg_cron: `settle_courier_offers(pedido)` es
-- idempotente y la corren, antes de leer, `public_order_delivery` (seguimiento del cliente),
-- `courier_available_orders` / `settle_due_courier_offers` (panel del repartidor) y
-- `business_order_offers` (panel del local). Mientras nadie mira el pedido no pasa nada, y nadie
-- puede ver un estado vencido sin que se resuelva primero.
--
-- Errores nuevos: `P0020` (el pedido ya no recibe ofertas), `P0021` (falta el motivo del precio) y
-- `P0022` (la oferta cambió mientras el cliente la miraba). `P0019` ya no se usa.

-- ---------------------------------------------------------------------------
-- Constantes con nombre (un solo lugar)
-- ---------------------------------------------------------------------------

-- Cuánto espera el pedido, desde la primera oferta, antes de que se elija sola la más barata.
CREATE OR REPLACE FUNCTION public.courier_offers_window()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT interval '5 minutes' $$;

-- Cuánto tiempo ve el repartidor el aviso de una oferta que se cerró ("El cliente eligió otro…").
CREATE OR REPLACE FUNCTION public.courier_offers_notice_window()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT interval '5 minutes' $$;

REVOKE ALL ON FUNCTION public.courier_offers_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.courier_offers_notice_window() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- La tabla de ofertas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.courier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  -- Obligatorio si el precio no es el de lista (lo valida `courier_make_offer`, porque el precio de
  -- lista es del pedido); si está, de 3 a 140 caracteres.
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 140),
  -- Cuándo se cerró (el cliente eligió, el local resolvió o se canceló); nulo = abierta.
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, courier_id)
);

CREATE INDEX IF NOT EXISTS courier_offers_courier_idx ON public.courier_offers (courier_id);

ALTER TABLE public.courier_offers ENABLE ROW LEVEL SECURITY;

-- Solo lectura: las filas las crean y mueven las funciones de abajo (no hay políticas de escritura).
DROP POLICY IF EXISTS courier_offers_select_own ON public.courier_offers;
CREATE POLICY courier_offers_select_own
ON public.courier_offers
FOR SELECT
TO authenticated
USING (courier_id = (select public.my_courier_id()));

DROP POLICY IF EXISTS courier_offers_select_member ON public.courier_offers;
CREATE POLICY courier_offers_select_member
ON public.courier_offers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.business_users bu ON bu.business_id = o.business_id
    WHERE o.id = courier_offers.order_id
      AND bu.user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS courier_offers_select_super_admin ON public.courier_offers;
CREATE POLICY courier_offers_select_super_admin
ON public.courier_offers
FOR SELECT
TO authenticated
USING ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- El pedido nace buscando
-- ---------------------------------------------------------------------------

-- Fuera el trigger que abría la búsqueda al confirmar (y la función).
DROP TRIGGER IF EXISTS orders_open_courier_search ON public.orders;
DROP FUNCTION IF EXISTS public.open_courier_search();

-- Los pedidos con envío abiertos que esperaban la confirmación pasan a buscar ya.
UPDATE public.orders
SET courier_status = 'searching',
    offered_at = coalesce(offered_at, now())
WHERE courier_status = 'waiting'
  AND courier_id IS NULL
  AND delivery_zone_id IS NOT NULL
  AND status NOT IN ('delivered', 'cancelled');

-- Misma guarda de la etapa 2, sin las columnas de la ventana del favorito.
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

-- Misma envoltura de 11 parámetros de `20261022000000_busqueda_de_repartidor.sql`. Cambia una cosa: el
-- pedido con envío nace `searching` y con `offered_at = now()`, así los repartidores lo ven y ofertan
-- desde que se crea.
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
        courier_status = 'searching',
        offered_at = now()
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
-- Qué ve cada repartidor
-- ---------------------------------------------------------------------------

-- ¿Este repartidor puede ofertar por este pedido? Única definición de la regla: la usan la lista, ofertar,
-- retirar y rechazar. Buscando, activo, de una zona que cubre, sin que él lo haya rechazado o devuelto.
-- Un pedido de Mercado Pago que todavía no se pagó no se ofrece: puede no llegar a existir.
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
      AND o.payment_status NOT IN ('awaiting', 'failed')
      AND EXISTS (
        SELECT 1 FROM public.courier_zone_coverage cc
        WHERE cc.courier_id = p_courier_id AND cc.zone_id = o.delivery_zone_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.courier_order_declines d
        WHERE d.order_id = o.id AND d.courier_id = p_courier_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.courier_sees_order(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Cuándo se elige sola la oferta de un pedido: 5 minutos desde la primera oferta abierta, o desde que
-- se reabrió la búsqueda (una devolución), lo que sea más tarde. Nulo si no hay ofertas abiertas.
CREATE OR REPLACE FUNCTION public.courier_offers_deadline(p_order_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT greatest(o.offered_at, min(f.created_at)) + public.courier_offers_window()
  FROM public.orders o
  JOIN public.courier_offers f ON f.order_id = o.id AND f.closed_at IS NULL
  WHERE o.id = p_order_id
    AND o.courier_status = 'searching'
    AND o.courier_id IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
  GROUP BY o.offered_at;
$$;

REVOKE ALL ON FUNCTION public.courier_offers_deadline(uuid) FROM PUBLIC, anon, authenticated;

-- Aplica una elección: la oferta pasa a ser el repartidor del pedido (con su precio y motivo) y las
-- ofertas abiertas se cierran. Un solo UPDATE condicional: si dos eligen a la vez, gana uno y al otro
-- no le toca ninguna fila. Devuelve si se aplicó.
CREATE OR REPLACE FUNCTION public.apply_courier_choice(p_order_id uuid, p_offer_id uuid, p_automatic boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
  v_name text;
BEGIN
  UPDATE public.orders o
  SET courier_id = f.courier_id,
      courier_status = 'accepted',
      courier_note = NULL,
      courier_responded_at = now(),
      delivery_fee = f.price,
      delivery_fee_reason = CASE WHEN f.price <> o.delivery_fee_list THEN f.reason END,
      delivery_fee_changed_by = NULL,
      delivery_fee_changed_at = CASE WHEN f.price <> o.delivery_fee_list THEN now() END,
      updated_at = now()
  FROM public.courier_offers f
  JOIN public.couriers c ON c.id = f.courier_id AND c.active
  WHERE o.id = p_order_id
    AND f.id = p_offer_id
    AND f.order_id = o.id
    AND f.closed_at IS NULL
    AND o.courier_status = 'searching'
    AND o.courier_id IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
  RETURNING o.business_id, o.status, f.courier_id, c.name, f.price, o.delivery_fee_list
  INTO v_order;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_name := v_order.name;

  UPDATE public.courier_offers
  SET closed_at = now()
  WHERE order_id = p_order_id AND closed_at IS NULL;

  INSERT INTO public.order_events (order_id, business_id, status, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status,
    CASE WHEN p_automatic THEN 'Envío asignado por la elección automática a ' ELSE 'Envío elegido por el cliente: ' END
      || v_name || ', ' || v_time,
    'delivery'
  );

  IF v_order.price <> v_order.delivery_fee_list THEN
    INSERT INTO public.order_events (order_id, business_id, status, note, kind)
    VALUES (
      p_order_id, v_order.business_id, v_order.status,
      'Precio del envío: $' || replace(to_char(v_order.delivery_fee_list, 'FM999,999,990'), ',', '.')
        || ' → $' || replace(to_char(v_order.price, 'FM999,999,990'), ',', '.'),
      'delivery'
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_courier_choice(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- La elección automática, perezosa e idempotente: si pasaron 5 minutos desde la primera oferta y el
-- pedido sigue buscando, elige la más barata; a igual precio, la del favorito del local; después, la
-- más vieja. Solo cuenta a repartidores activos. Si todavía no venció, no hace nada.
CREATE OR REPLACE FUNCTION public.settle_courier_offers(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_deadline timestamptz;
  v_offer uuid;
BEGIN
  -- El bloqueo serializa dos lecturas a la vez: la segunda ve el pedido ya resuelto.
  SELECT o.id, o.business_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.courier_status = 'searching'
    AND o.courier_id IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_deadline := public.courier_offers_deadline(p_order_id);

  IF v_deadline IS NULL OR now() < v_deadline THEN
    RETURN;
  END IF;

  SELECT f.id
  INTO v_offer
  FROM public.courier_offers f
  JOIN public.couriers c ON c.id = f.courier_id AND c.active
  WHERE f.order_id = p_order_id
    AND f.closed_at IS NULL
  ORDER BY f.price ASC,
           (f.courier_id IS NOT DISTINCT FROM (
             SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_order.business_id
           )) DESC,
           f.created_at ASC,
           f.id ASC
  LIMIT 1;

  IF v_offer IS NOT NULL THEN
    PERFORM public.apply_courier_choice(p_order_id, v_offer, true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_courier_offers(uuid) FROM PUBLIC, anon, authenticated;

-- Resuelve los pedidos vencidos que ve quien llama (su negocio, o las zonas que cubre un repartidor).
-- Los paneles la llaman antes de leer.
CREATE OR REPLACE FUNCTION public.settle_due_courier_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  FOR v_id IN
    SELECT o.id
    FROM public.orders o
    WHERE o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND public.courier_offers_deadline(o.id) <= now()
      AND (
        EXISTS (
          SELECT 1 FROM public.business_users bu
          WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
        )
        OR (
          v_courier IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.courier_zone_coverage cc
            WHERE cc.courier_id = v_courier AND cc.zone_id = o.delivery_zone_id
          )
        )
      )
  LOOP
    PERFORM public.settle_courier_offers(v_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_due_courier_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_due_courier_offers() TO authenticated;

-- ---------------------------------------------------------------------------
-- Las funciones del repartidor
-- ---------------------------------------------------------------------------

-- Los pedidos que el repartidor puede ofertar ahora, más los que cerró hace un rato (para mostrarle
-- "El cliente eligió otro repartidor" o "Cancelado por el local"). Antes de que lo elijan no ve nada
-- del cliente: solo lo que necesita para decidir, y cuántas ofertas hay, sin nombres ni precios.
CREATE OR REPLACE FUNCTION public.courier_available_orders()
RETURNS jsonb
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

  -- Lo vencido se resuelve antes de leer.
  PERFORM public.settle_due_courier_offers();

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
                 'precio_lista', o.delivery_fee_list
               ),
               'ofertas', (
                 SELECT count(*) FROM public.courier_offers f
                 WHERE f.order_id = o.id AND f.closed_at IS NULL
               ),
               'mi_oferta', (
                 SELECT jsonb_build_object(
                          'id', f.id, 'precio', f.price, 'motivo', f.reason, 'creada', f.created_at
                        )
                 FROM public.courier_offers f
                 WHERE f.order_id = o.id AND f.courier_id = v_courier AND f.closed_at IS NULL
               ),
               'resultado', CASE
                 WHEN o.courier_status = 'searching' AND o.status NOT IN ('delivered', 'cancelled') THEN NULL
                 WHEN o.status = 'cancelled' THEN 'cancelled'
                 WHEN o.courier_status = 'accepted' THEN 'chosen_other'
                 ELSE 'closed'
               END,
               'cerrado_el', (
                 SELECT f.closed_at FROM public.courier_offers f
                 WHERE f.order_id = o.id AND f.courier_id = v_courier
               )
             )
             ORDER BY o.offered_at, o.id
           )
    FROM public.orders o
    JOIN public.businesses b ON b.id = o.business_id
    LEFT JOIN public.business_settings s ON s.business_id = b.id
    WHERE public.courier_sees_order(o.id, v_courier)
       OR EXISTS (
         SELECT 1 FROM public.courier_offers f
         WHERE f.order_id = o.id
           AND f.courier_id = v_courier
           AND f.closed_at IS NOT NULL
           AND f.closed_at > now() - public.courier_offers_notice_window()
           AND o.courier_id IS DISTINCT FROM v_courier
       )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_available_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_available_orders() TO authenticated;

-- Ofertar (o cambiar la propia): precio de lista o uno distinto con motivo.
CREATE OR REPLACE FUNCTION public.courier_make_offer(
  p_order_id uuid,
  p_price numeric,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_list numeric;
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF p_price IS NULL OR p_price < 0 OR p_price >= 100000000 THEN
    RAISE EXCEPTION 'El precio del envío no es válido' USING ERRCODE = '22023';
  END IF;

  -- Si ya pasó el tiempo, el pedido se resuelve primero: una oferta tardía no cambia lo elegido.
  PERFORM public.settle_courier_offers(p_order_id);

  IF NOT public.courier_sees_order(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'El pedido ya no recibe ofertas' USING ERRCODE = 'P0020';
  END IF;

  SELECT o.delivery_fee_list INTO v_list FROM public.orders o WHERE o.id = p_order_id;

  IF p_price IS DISTINCT FROM v_list THEN
    IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 3 AND 140 THEN
      RAISE EXCEPTION 'Cambiar el precio del envío exige un motivo (de 3 a 140 caracteres)'
        USING ERRCODE = 'P0021';
    END IF;
  ELSE
    v_reason := NULL;
  END IF;

  INSERT INTO public.courier_offers (order_id, courier_id, price, reason)
  VALUES (p_order_id, v_courier, p_price, v_reason)
  ON CONFLICT (order_id, courier_id) DO UPDATE
  SET price = excluded.price,
      reason = excluded.reason,
      closed_at = NULL,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.courier_make_offer(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_make_offer(uuid, numeric, text) TO authenticated;

-- Retirar la propia oferta, mientras el cliente no eligió.
CREATE OR REPLACE FUNCTION public.courier_withdraw_offer(p_order_id uuid)
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

  PERFORM public.settle_courier_offers(p_order_id);

  DELETE FROM public.courier_offers f
  USING public.orders o
  WHERE f.order_id = p_order_id
    AND f.courier_id = v_courier
    AND f.closed_at IS NULL
    AND o.id = f.order_id
    AND o.courier_status = 'searching';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido ya no recibe ofertas' USING ERRCODE = 'P0020';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_withdraw_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_withdraw_offer(uuid) TO authenticated;

-- Rechazar: ese pedido deja de verse para este repartidor (y si tenía una oferta, se retira).
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
    RAISE EXCEPTION 'El pedido ya no recibe ofertas' USING ERRCODE = 'P0020';
  END IF;

  DELETE FROM public.courier_offers
  WHERE order_id = p_order_id AND courier_id = v_courier AND closed_at IS NULL;

  INSERT INTO public.courier_order_declines (order_id, courier_id, kind)
  VALUES (p_order_id, v_courier, 'rejected')
  ON CONFLICT (order_id, courier_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_decline_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_decline_order(uuid) TO authenticated;

-- Devolver el pedido elegido, antes de que el local se lo entregue. Vuelve a ofertas: se borra la
-- oferta de quien lo devolvió (que no puede volver a ofertar), las demás se reabren y la cuenta de los
-- 5 minutos arranca de nuevo desde ahora.
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
      delivery_fee = delivery_fee_list,
      delivery_fee_reason = NULL,
      delivery_fee_changed_by = NULL,
      delivery_fee_changed_at = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  DELETE FROM public.courier_offers WHERE order_id = p_order_id AND courier_id = v_courier;

  UPDATE public.courier_offers SET closed_at = NULL WHERE order_id = p_order_id;

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

-- El repartidor ya no toma: ofrece.
DROP FUNCTION IF EXISTS public.courier_take_order(uuid, numeric, text, text);

-- ---------------------------------------------------------------------------
-- Cancelar cierra las ofertas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_offers_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.courier_offers
  SET closed_at = now()
  WHERE order_id = new.id AND closed_at IS NULL;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.close_offers_on_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_close_offers_on_cancel ON public.orders;
CREATE TRIGGER orders_close_offers_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (new.status = 'cancelled' AND old.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.close_offers_on_cancel();

-- ---------------------------------------------------------------------------
-- Del lado del cliente
-- ---------------------------------------------------------------------------

-- El cliente elige una oferta de SU pedido. El código del seguimiento es el secreto: no hay sesión.
-- `p_price` (opcional) es el precio que el cliente estaba viendo: si el repartidor lo cambió mientras
-- tanto, `P0022` y no se elige nada. Una oferta de otro pedido o un pedido que ya no busca da `P0020`.
CREATE OR REPLACE FUNCTION public.public_choose_courier(
  p_code text,
  p_offer_id uuid,
  p_price numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order uuid;
  v_price numeric;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  SELECT o.id INTO v_order FROM public.orders o WHERE o.code = p_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  -- Si ya venció, se resuelve sola primero: el cliente se entera de que ya no puede elegir.
  PERFORM public.settle_courier_offers(v_order);

  SELECT f.price INTO v_price
  FROM public.courier_offers f
  WHERE f.id = p_offer_id AND f.order_id = v_order AND f.closed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido ya no recibe ofertas' USING ERRCODE = 'P0020';
  END IF;

  IF p_price IS NOT NULL AND p_price IS DISTINCT FROM v_price THEN
    RAISE EXCEPTION 'La oferta cambió' USING ERRCODE = 'P0022';
  END IF;

  IF NOT public.apply_courier_choice(v_order, p_offer_id, false) THEN
    RAISE EXCEPTION 'El pedido ya no recibe ofertas' USING ERRCODE = 'P0020';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.public_choose_courier(text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_choose_courier(text, uuid, numeric) TO anon, authenticated;

-- Misma `public_order_delivery` de la etapa 2, con las ofertas abiertas mientras busca: id, nombre del
-- repartidor, precio, motivo y `favorito` (primero el favorito del local, después por precio y
-- antigüedad), y `cierra_en` (cuándo se elige sola). Resuelve lo vencido antes de leer, por eso ya no
-- es STABLE. El teléfono del repartidor sigue siendo solo del elegido.
CREATE OR REPLACE FUNCTION public.public_order_delivery(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_offers jsonb;
  v_deadline timestamptz;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  PERFORM public.settle_courier_offers(o.id) FROM public.orders o WHERE o.code = p_code;

  SELECT o.id, c.name AS courier_name, c.whatsapp AS courier_whatsapp, o.delivery_zone_name,
         o.delivery_fee_list, o.delivery_fee, o.delivery_fee_reason, o.courier_status, o.courier_note,
         o.business_id, o.status
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code
    AND o.courier_status IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_order.courier_status = 'searching' AND v_order.status NOT IN ('delivered', 'cancelled') THEN
    SELECT coalesce(jsonb_agg(
             jsonb_build_object(
               'id', x.id,
               'repartidor', x.name,
               'precio', x.price,
               'motivo', x.reason,
               'favorito', x.favorite
             )
             ORDER BY x.favorite DESC, x.price ASC, x.created_at ASC, x.id ASC
           ), '[]'::jsonb)
    INTO v_offers
    FROM (
      SELECT f.id, c.name, f.price, f.reason, f.created_at,
             (f.courier_id IS NOT DISTINCT FROM s.favorite_courier_id) AS favorite
      FROM public.courier_offers f
      JOIN public.couriers c ON c.id = f.courier_id AND c.active
      LEFT JOIN public.business_settings s ON s.business_id = v_order.business_id
      WHERE f.order_id = v_order.id AND f.closed_at IS NULL
    ) x;

    v_deadline := public.courier_offers_deadline(v_order.id);
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_order.courier_name,
    'whatsapp', v_order.courier_whatsapp,
    'zona', v_order.delivery_zone_name,
    'precio_lista', v_order.delivery_fee_list,
    'precio', v_order.delivery_fee,
    'motivo_cambio', v_order.delivery_fee_reason,
    'estado', v_order.courier_status,
    'nota', v_order.courier_note,
    'ofertas', v_offers,
    'cierra_en', v_deadline
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Del lado del local
-- ---------------------------------------------------------------------------

-- Las ofertas de los pedidos que están buscando repartidor en el negocio de quien llama, con quién
-- ofreció, cuánto, y cuándo se elige sola. Resuelve lo vencido antes de leer. El nombre del
-- repartidor lo lee el local aunque no tenga permiso sobre `couriers` (p. ej. si lo dieron de baja).
CREATE OR REPLACE FUNCTION public.business_order_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  PERFORM public.settle_due_courier_offers();

  RETURN coalesce((
    SELECT jsonb_agg(
             jsonb_build_object(
               'order_id', o.id,
               'cierra_en', public.courier_offers_deadline(o.id),
               'ofertas', (
                 SELECT coalesce(jsonb_agg(
                          jsonb_build_object(
                            'id', f.id,
                            'courier_id', f.courier_id,
                            'repartidor', c.name,
                            'precio', f.price,
                            'motivo', f.reason,
                            'favorito', (f.courier_id IS NOT DISTINCT FROM s.favorite_courier_id)
                          )
                          ORDER BY (f.courier_id IS NOT DISTINCT FROM s.favorite_courier_id) DESC,
                                   f.price ASC, f.created_at ASC, f.id ASC
                        ), '[]'::jsonb)
                 FROM public.courier_offers f
                 JOIN public.couriers c ON c.id = f.courier_id
                 WHERE f.order_id = o.id AND f.closed_at IS NULL
               )
             )
           )
    FROM public.orders o
    LEFT JOIN public.business_settings s ON s.business_id = o.business_id
    WHERE o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND EXISTS (
        SELECT 1 FROM public.business_users bu
        WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
      )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.business_order_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_order_offers() TO authenticated;

-- Asignar a mano a un repartidor con quien el local habló por WhatsApp. Mismo cuerpo de la etapa 2,
-- y además cierra las ofertas abiertas.
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
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.courier_offers SET closed_at = now() WHERE order_id = p_order_id AND closed_at IS NULL;

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

-- "Lo llevo yo": el local resuelve el envío él mismo. Cierra las ofertas abiertas.
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
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.courier_offers SET closed_at = now() WHERE order_id = p_order_id AND closed_at IS NULL;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (p_order_id, v_order.business_id, v_order.status, v_uid, 'Lo lleva el local, ' || v_time, 'delivery');
END;
$$;

REVOKE ALL ON FUNCTION public.business_self_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_self_delivery(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Preferencias de envío: sin minutos para el favorito
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.save_delivery_preferences(uuid[], uuid, integer);
DROP FUNCTION IF EXISTS public.set_courier_preferences(uuid, integer);

CREATE OR REPLACE FUNCTION public.set_courier_preferences(p_favorite uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
BEGIN
  IF v_business IS NULL THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_my_favorite_courier(p_favorite);

  INSERT INTO public.business_settings (business_id, favorite_courier_id)
  VALUES (v_business, p_favorite)
  ON CONFLICT (business_id) DO UPDATE
  SET favorite_courier_id = excluded.favorite_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_courier_preferences(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_courier_preferences(uuid) TO authenticated;

-- Zonas + favorito en una sola transacción: el favorito se valida contra las zonas NUEVAS.
CREATE OR REPLACE FUNCTION public.save_delivery_preferences(
  p_zone_ids uuid[],
  p_favorite uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
  v_zones uuid[] := coalesce(p_zone_ids, ARRAY[]::uuid[]);
BEGIN
  IF v_business IS NULL THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_zones) AS requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.delivery_zones z WHERE z.id = requested.id AND z.active
    )
  ) THEN
    RAISE EXCEPTION 'Alguna zona no existe o no está disponible' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.business_delivery_zones
  WHERE business_id = v_business AND zone_id <> ALL (v_zones);

  INSERT INTO public.business_delivery_zones (business_id, zone_id)
  SELECT v_business, requested.id
  FROM unnest(v_zones) AS requested(id)
  ON CONFLICT DO NOTHING;

  PERFORM public.set_courier_preferences(p_favorite);
END;
$$;

REVOKE ALL ON FUNCTION public.save_delivery_preferences(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_delivery_preferences(uuid[], uuid) TO authenticated;

-- Misma `business_delivery_options` de `20261021000000_varios_repartidores_zonas.sql`, sin `favorite_minutes`.
CREATE OR REPLACE FUNCTION public.business_delivery_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
BEGIN
  IF v_business IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', z.id,
                 'name', z.name,
                 'price', z.price,
                 'selected', EXISTS (
                   SELECT 1 FROM public.business_delivery_zones bz
                   WHERE bz.business_id = v_business AND bz.zone_id = z.id
                 ),
                 'covered', EXISTS (
                   SELECT 1
                   FROM public.courier_zone_coverage cc
                   JOIN public.couriers c ON c.id = cc.courier_id AND c.active
                   WHERE cc.zone_id = z.id
                 )
               )
               ORDER BY z.sort_order, z.name
             )
      FROM public.delivery_zones z
      WHERE z.active
    ), '[]'::jsonb),
    'couriers', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', c.id,
                 'name', c.name,
                 'whatsapp', c.whatsapp,
                 'zone_ids', (
                   SELECT coalesce(jsonb_agg(cc.zone_id), '[]'::jsonb)
                   FROM public.courier_zone_coverage cc
                   JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
                   WHERE cc.courier_id = c.id
                 )
               )
               ORDER BY c.name, c.id
             )
      FROM public.couriers c
      WHERE c.active
        AND EXISTS (
          SELECT 1 FROM public.courier_zone_coverage cc
          JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
          WHERE cc.courier_id = c.id
        )
    ), '[]'::jsonb),
    'favorite_id', (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_business)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_options() TO authenticated;

-- ---------------------------------------------------------------------------
-- Fuera lo que ya nadie lee
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS offer_favorite_id,
  DROP COLUMN IF EXISTS offer_favorite_until;

ALTER TABLE public.business_settings
  DROP COLUMN IF EXISTS favorite_minutes;

-- ---------------------------------------------------------------------------
-- El seguimiento sabe si el pedido es para retirar
-- ---------------------------------------------------------------------------

-- Misma `public_order_tracking` de `20261011000000_posicion_imagen_cabecera.sql`, con una clave más en
-- `pedido`: `entrega` (`retiro` o `delivery`). La línea de pasos del seguimiento dice "Listo para retirar"
-- y "Retirado" solo en un pedido para retirar (SEGUIMIENTO-25).
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
         o.preorder, o.payment, o.payment_status, o.delivery,
         b.name AS business_name, b.whatsapp, b.slug,
         s.template, s.primary_color, s.secondary_color, s.header_image_url,
         s.header_image_x, s.header_image_y
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
      'imagen', v_order.header_image_url,
      'posicion', CASE
        WHEN v_order.header_image_x IS NOT NULL
        THEN jsonb_build_object('x', v_order.header_image_x, 'y', v_order.header_image_y)
      END
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
      'anticipado', CASE WHEN v_order.preorder THEN true END,
      'entrega', v_order.delivery
    ),
    'items', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'nombre', i.name,
                 'cantidad', i.quantity,
                 'precio', i.unit_price,
                 -- Foto de lo elegido (SEGUIMIENTO-22): grupo, nombre, cantidad y precio, sin ids.
                 'opciones', i.options
               )
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
