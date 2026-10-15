-- ENVIO-166: el repartidor elige el motivo al devolver un pedido (cambió la demora, problema con el
-- vehículo u otro con texto) en vez de deducirlo comparando horarios.
--
-- - `orders.returned_reason_kind` y `orders.returned_reason`: el motivo de la última devolución, para que el
--   local lo vea mientras el pedido vuelve a buscar repartidor. Reemplazan a `returned_prep_changed`.
-- - `courier_return_order(pedido, tipo, texto)`: reemplaza la de dos parámetros.
-- - `guard_order_courier` y `track_pickup_time`: mismas de `20261105000000_circuito_de_tiempos.sql`, con las
--   columnas nuevas en lugar de `returned_prep_changed`.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS returned_reason_kind text
    CHECK (returned_reason_kind IN ('delay_changed', 'vehicle', 'other')),
  ADD COLUMN IF NOT EXISTS returned_reason text
    CHECK (char_length(returned_reason) <= 140);

-- La guarda y el trigger se redefinen antes de borrar la columna: ninguna función la nombra al final.
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
       OR new.returned_reason_kind IS DISTINCT FROM old.returned_reason_kind
       OR new.returned_reason IS DISTINCT FROM old.returned_reason
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
      new.returned_reason_kind := NULL;
      new.returned_reason := NULL;
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

ALTER TABLE public.orders DROP COLUMN IF EXISTS returned_prep_changed;

-- Devolver exige un tipo. "Otro" trae el texto (3 a 140 caracteres); los otros dos no lo necesitan.
DROP FUNCTION IF EXISTS public.courier_return_order(uuid, text);

CREATE OR REPLACE FUNCTION public.courier_return_order(p_order_id uuid, p_kind text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_text text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_label text;
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_order record;
  v_name text;
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('delay_changed', 'vehicle', 'other') THEN
    RAISE EXCEPTION 'Elegí el motivo de la devolución' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'other' THEN
    IF v_text IS NULL OR char_length(v_text) < 3 OR char_length(v_text) > 140 THEN
      RAISE EXCEPTION 'Contá el motivo (de 3 a 140 caracteres)' USING ERRCODE = '22023';
    END IF;
    v_label := v_text;
  ELSE
    -- Los motivos fijos no llevan texto propio.
    v_text := NULL;
    v_label := CASE p_kind WHEN 'delay_changed' THEN 'cambió la demora' ELSE 'problema con el vehículo' END;
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
      returned_reason_kind = p_kind,
      returned_reason = v_text,
      updated_at = now()
  WHERE id = p_order_id;

  DELETE FROM public.courier_offers WHERE order_id = p_order_id AND courier_id = v_courier;

  UPDATE public.courier_offers SET closed_at = NULL WHERE order_id = p_order_id;

  INSERT INTO public.courier_order_declines (order_id, courier_id, kind, reason)
  VALUES (p_order_id, v_courier, 'returned', v_label)
  ON CONFLICT (order_id, courier_id)
  DO UPDATE SET kind = 'returned', reason = excluded.reason, created_at = now();

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Envío devuelto por ' || v_name || ': ' || v_label || ', ' || v_time,
    'delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_return_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_return_order(uuid, text, text) TO authenticated;
