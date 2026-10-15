-- Circuito de tiempos del envío (ENVIO-155 a 162).
--
-- 1. La búsqueda de repartidor se abre cuando el local acepta el pedido (`pending → confirmed`), en los dos
--    modos. Hasta hoy los pedidos comunes la abrían al crearse; ahora nacen `waiting` como los anticipados y
--    programados, y `open_courier_search()` (20261022000000) ya los pasa a `searching` al confirmar.
-- 2. El repartidor ve la demora antes de tomar: `listo_a` y `demora_min`. Salen de lo que cargó el local
--    (`prep_ready_at`) y, si no cargó nada, de `default_prep_minutes` desde que aceptó: esa estimación no se
--    guarda, así el cliente no ve una hora que el local no marcó.
-- 3. El repartidor carga "llego al local en X" y "llego al cliente en X" (`courier_set_eta`).
-- 4. Aviso para ir a retirar: `run_order_timers()` marca una vez `pickup_reminder_sent_at` 10 minutos antes de
--    la hora estimada. Ese UPDATE dispara el Database Webhook y `src/lib/push/events.ts` deduce el aviso, igual
--    que `no_offers_alerted_at`. Si el local cambia la demora, la marca se reinicia y queda la hora anterior en
--    `ready_was_at`.
--
-- Las migraciones anteriores no se tocan: cada función de abajo es la última versión con el cambio indicado.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_eta_pickup_at timestamptz,
  ADD COLUMN IF NOT EXISTS courier_eta_dropoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_was_at timestamptz,
  -- El repartidor lo devolvió después de que el local cambió la demora: el local lo ve mientras vuelve a buscar.
  ADD COLUMN IF NOT EXISTS returned_prep_changed boolean NOT NULL DEFAULT false;

-- Cuánto antes de la hora estimada de listo se le avisa al repartidor. Un solo lugar (el texto del aviso y
-- los tests lo leen de acá).
CREATE OR REPLACE FUNCTION public.pickup_reminder_lead()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT interval '10 minutes' $$;

REVOKE ALL ON FUNCTION public.pickup_reminder_lead() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hora estimada de listo y demora
-- ---------------------------------------------------------------------------

-- La hora de listo que ve el repartidor: la que cargó el local; la de un pedido programado; o, si el local
-- no cargó nada, `default_prep_minutes` desde que aceptó. SECURITY DEFINER: lee el evento de confirmación y
-- la configuración, que el repartidor no ve por RLS. No se entrega a ningún rol: la llaman las funciones de
-- abajo.
CREATE OR REPLACE FUNCTION public.order_ready_at(o public.orders)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    o.prep_ready_at,
    o.scheduled_for,
    coalesce(
      (SELECT min(e.created_at) FROM public.order_events e WHERE e.order_id = o.id AND e.status = 'confirmed'),
      o.created_at
    ) + make_interval(mins => coalesce(
      (SELECT s.default_prep_minutes FROM public.business_settings s WHERE s.business_id = o.business_id),
      20
    ))
  )
$$;

-- Los minutos de demora que muestra el repartidor: desde que el local cargó el tiempo (o aceptó) hasta la
-- hora de listo. Un pedido programado o anticipado ya tiene su hora y no tiene demora.
CREATE OR REPLACE FUNCTION public.order_prep_minutes(o public.orders)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN o.scheduled_for IS NOT NULL OR o.preorder THEN NULL
    ELSE greatest(1, round(extract(epoch FROM
      public.order_ready_at(o) - coalesce(
        o.prep_updated_at,
        (SELECT min(e.created_at) FROM public.order_events e WHERE e.order_id = o.id AND e.status = 'confirmed'),
        o.created_at
      )
    ) / 60)::integer)
  END
$$;

REVOKE ALL ON FUNCTION public.order_ready_at(public.orders) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_prep_minutes(public.orders) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- La búsqueda se abre al confirmar
-- ---------------------------------------------------------------------------

-- Misma `create_public_order` de `20261024000000_ofertas_al_confirmar_anticipados.sql`. Cambia una cosa: todo
-- pedido con envío nace `waiting`, sin `offered_at`.
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
        courier_status = 'waiting',
        offered_at = NULL
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

-- Los pedidos que hoy buscan sin que el local los haya aceptado vuelven a esperar su confirmación. Las
-- ofertas que tengan eran sobre un pedido que el local todavía no aceptó: se cierran.
DELETE FROM public.courier_offers f
USING public.orders o
WHERE f.order_id = o.id
  AND o.courier_status = 'searching'
  AND o.courier_id IS NULL
  AND o.status = 'pending';

UPDATE public.orders o
SET courier_status = 'waiting',
    offered_at = NULL
WHERE o.courier_status = 'searching'
  AND o.courier_id IS NULL
  AND o.status = 'pending';

-- ---------------------------------------------------------------------------
-- Guarda de las columnas nuevas y seguimiento de la demora
-- ---------------------------------------------------------------------------

-- Misma `guard_order_courier` de `20261023000000_ofertas_de_repartidor.sql`, con las columnas nuevas: solo
-- las mueven las funciones del circuito y el cron (ENVIO-162).
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
       OR new.courier_eta_pickup_at IS DISTINCT FROM old.courier_eta_pickup_at
       OR new.courier_eta_dropoff_at IS DISTINCT FROM old.courier_eta_dropoff_at
       OR new.pickup_reminder_sent_at IS DISTINCT FROM old.pickup_reminder_sent_at
       OR new.ready_was_at IS DISTINCT FROM old.ready_was_at
       OR new.returned_prep_changed IS DISTINCT FROM old.returned_prep_changed
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

-- Cuando cambia el repartidor (toma, devolución, asignación del local) los tiempos del anterior no valen, y
-- cuando el local cambia la demora el aviso para retirar se rearma y se guarda la hora que el repartidor había
-- visto (ENVIO-159). SECURITY DEFINER para leer `order_ready_at`; corre después de la guarda
-- (`orders_guard_courier`: los triggers van en orden alfabético).
CREATE OR REPLACE FUNCTION public.track_pickup_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.courier_id IS DISTINCT FROM old.courier_id THEN
    new.courier_eta_pickup_at := NULL;
    new.courier_eta_dropoff_at := NULL;
    new.pickup_reminder_sent_at := NULL;
    new.ready_was_at := NULL;

    -- Lo tomó otro repartidor: la devolución anterior ya no cuenta.
    IF new.courier_id IS NOT NULL THEN
      new.returned_prep_changed := false;
    END IF;
  END IF;

  IF new.prep_ready_at IS DISTINCT FROM old.prep_ready_at THEN
    new.pickup_reminder_sent_at := NULL;

    IF old.courier_id IS NOT NULL AND new.courier_id IS NOT DISTINCT FROM old.courier_id THEN
      -- Se queda con la primera hora que vio el repartidor: varios cambios seguidos no la pisan.
      new.ready_was_at := coalesce(old.ready_was_at, public.order_ready_at(old));
    END IF;
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.track_pickup_time() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_track_pickup_time ON public.orders;
CREATE TRIGGER orders_track_pickup_time
  BEFORE UPDATE OF prep_ready_at, courier_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.track_pickup_time();

-- ---------------------------------------------------------------------------
-- El repartidor carga sus dos tiempos (ENVIO-157)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.courier_set_eta(p_order_id uuid, p_kind text, p_minutes integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_order record;
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('pickup', 'dropoff') THEN
    RAISE EXCEPTION 'Tipo de tiempo desconocido' USING ERRCODE = '22023';
  END IF;

  IF p_minutes IS NULL OR p_minutes NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'El tiempo tiene que estar entre 1 y 120 minutos' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.courier_id = v_courier
    AND o.courier_status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF p_kind = 'pickup' AND v_order.status NOT IN ('pending', 'confirmed', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'El pedido ya salió del local' USING ERRCODE = 'P0004';
  END IF;

  IF p_kind = 'dropoff' AND v_order.status NOT IN ('handed_to_courier', 'on_the_way') THEN
    RAISE EXCEPTION 'El tiempo al cliente se carga con el pedido retirado' USING ERRCODE = 'P0004';
  END IF;

  v_at := now() + make_interval(mins => p_minutes);

  UPDATE public.orders
  SET courier_eta_pickup_at = CASE WHEN p_kind = 'pickup' THEN v_at ELSE courier_eta_pickup_at END,
      courier_eta_dropoff_at = CASE WHEN p_kind = 'dropoff' THEN v_at ELSE courier_eta_dropoff_at END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_set_eta(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_set_eta(uuid, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ven el repartidor y el cliente
-- ---------------------------------------------------------------------------

-- Misma `courier_return_order` de `20261023000000_ofertas_de_repartidor.sql`: si el local cambió la demora
-- después de que lo tomó, el pedido vuelve marcado (`returned_prep_changed`) para que el local lo vea (ENVIO-164).
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
      returned_prep_changed = (ready_was_at IS NOT NULL AND ready_was_at IS DISTINCT FROM prep_ready_at),
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

-- Misma `courier_available_orders` de `20261104000000_modo_de_envios.sql`, más `listo_a` y `demora_min`.
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
               'modo', o.delivery_mode,
               'creado', o.created_at,
               'ofrecido_el', o.offered_at,
               'listo_a', public.order_ready_at(o),
               'demora_min', public.order_prep_minutes(o),
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

-- Misma `courier_orders` de `20261029000000_notas_por_item.sql`, más `tiempos` en cada pedido.
CREATE OR REPLACE FUNCTION public.courier_orders(
  p_since timestamptz DEFAULT now() - interval '2 days'
)
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
               'programado', o.scheduled_for,
               'anticipado', o.preorder,
               'negocio', jsonb_build_object(
                 'nombre', b.name,
                 'direccion', s.address,
                 'whatsapp', b.whatsapp
               ),
               'cliente', jsonb_build_object(
                 'nombre', o.customer_name,
                 'telefono', o.customer_phone,
                 'direccion', o.delivery_address
               ),
               'total', o.total,
               'pago', o.payment,
               'pago_estado', o.payment_status,
               'notas', o.notes,
               'items', coalesce((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'nombre', i.name,
                            'cantidad', i.quantity,
                            'precio', i.unit_price,
                            'opciones', i.options,
                            'nota', i.note
                          )
                          ORDER BY i.sort_order, i.id
                        )
                 FROM public.order_items i
                 WHERE i.order_id = o.id
               ), '[]'::jsonb),
               'envio', jsonb_build_object(
                 'zona', o.delivery_zone_name,
                 'precio_lista', o.delivery_fee_list,
                 'precio', o.delivery_fee,
                 'motivo_cambio', o.delivery_fee_reason,
                 'cambiado_el', o.delivery_fee_changed_at,
                 'estado', o.courier_status,
                 'nota', o.courier_note,
                 'consultado_el', o.courier_requested_at,
                 'respondido_el', o.courier_responded_at
               ),
               'tiempos', jsonb_build_object(
                 'listo_a', public.order_ready_at(o),
                 'demora_min', public.order_prep_minutes(o),
                 'listo_antes', o.ready_was_at,
                 'llega_local_a', o.courier_eta_pickup_at,
                 'llega_cliente_a', o.courier_eta_dropoff_at
               ),
               'rendicion', jsonb_build_object(
                 'rendido_el', o.settled_at,
                 'recibido_el', o.settlement_received_at
               )
             )
             ORDER BY o.created_at DESC, o.id
           )
    FROM public.orders o
    JOIN public.businesses b ON b.id = o.business_id
    LEFT JOIN public.business_settings s ON s.business_id = b.id
    WHERE o.courier_id = v_courier
      AND (
        o.created_at >= p_since
        OR o.status NOT IN ('delivered', 'cancelled')
        -- Una rendición sin cerrar no desaparece del panel por ser vieja.
        OR (o.status = 'delivered' AND o.payment = 'efectivo' AND o.settlement_received_at IS NULL)
      )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_orders(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_orders(timestamptz) TO authenticated;

-- Misma `public_order_delivery` de `20261104000000_modo_de_envios.sql`, más `llega_a` (ENVIO-161): lo que
-- cargó el repartidor para llegar al cliente, recién cuando ya retiró el pedido.
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
         o.business_id, o.status, o.delivery_mode, o.courier_eta_dropoff_at
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code
    AND o.courier_status IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_order.courier_status = 'searching'
     AND v_order.status NOT IN ('delivered', 'cancelled')
     AND v_order.delivery_mode IS DISTINCT FROM 'fixed' THEN
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
             (f.courier_id IS NOT DISTINCT FROM public.effective_favorite_courier(v_order.business_id)) AS favorite
      FROM public.courier_offers f
      JOIN public.couriers c ON c.id = f.courier_id AND c.active
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
    'modo', v_order.delivery_mode,
    'nota', v_order.courier_note,
    'llega_a', CASE WHEN v_order.status IN ('handed_to_courier', 'on_the_way') THEN v_order.courier_eta_dropoff_at END,
    'ofertas', v_offers,
    'cierra_en', v_deadline
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- El aviso para ir a retirar
-- ---------------------------------------------------------------------------

-- Misma `run_order_timers` de `20261030000000_recordatorios_pedido_nuevo.sql`, más el aviso previo al final.
CREATE OR REPLACE FUNCTION public.run_order_timers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- La elección automática de TODOS los pedidos vencidos, no solo los que mira alguien.
  FOR v_id IN
    SELECT o.id
    FROM public.orders o
    WHERE o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND public.courier_offers_deadline(o.id) <= now()
  LOOP
    PERFORM public.settle_courier_offers(v_id);
  END LOOP;

  -- Nadie ofertó en 10 minutos: se marca una sola vez por búsqueda. Un pedido de Mercado Pago sin pagar no
  -- se ofrece (`courier_sees_order`), así que tampoco cuenta.
  UPDATE public.orders o
  SET no_offers_alerted_at = now()
  WHERE o.courier_status = 'searching'
    AND o.courier_id IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
    AND o.payment_status NOT IN ('awaiting', 'failed')
    AND o.no_offers_alerted_at IS NULL
    AND o.offered_at <= now() - public.no_offers_alert_window()
    AND NOT EXISTS (SELECT 1 FROM public.courier_offers f WHERE f.order_id = o.id);

  -- Pedido por menú que sigue sin atender: un recordatorio cada 2 minutos desde que llegó o desde el
  -- último, hasta 5. Lo que carga el propio local (`manual`) y el de Mercado Pago sin pagar o fallido no
  -- cuentan, igual que en el aviso de pedido nuevo.
  UPDATE public.orders o
  SET new_order_reminders = o.new_order_reminders + 1,
      new_order_reminded_at = now()
  WHERE o.status = 'pending'
    AND o.source = 'web'
    AND o.payment_status NOT IN ('awaiting', 'failed')
    AND o.new_order_reminders < public.new_order_reminder_max()
    AND coalesce(o.new_order_reminded_at, o.created_at) <= now() - public.new_order_reminder_interval();

  -- Pedido con repartidor que se acerca a la hora estimada de listo: una marca por demora (ENVIO-158). Si el
  -- local cambia la demora, `track_pickup_time()` la borra y el aviso se rearma. Listo y entregado ya no
  -- avisan por este camino.
  UPDATE public.orders o
  SET pickup_reminder_sent_at = now()
  WHERE o.courier_id IS NOT NULL
    AND o.courier_status = 'accepted'
    AND o.status IN ('confirmed', 'preparing')
    AND o.pickup_reminder_sent_at IS NULL
    AND public.order_ready_at(o) <= now() + public.pickup_reminder_lead();
END;
$$;

REVOKE ALL ON FUNCTION public.run_order_timers() FROM PUBLIC, anon, authenticated;
