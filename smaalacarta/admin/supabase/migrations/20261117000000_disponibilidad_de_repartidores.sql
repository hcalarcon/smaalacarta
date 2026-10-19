-- Repartidor "Disponible" y aviso cuando no hay repartidores (ENVIO-191 a 205).
--
-- - `platform_settings.courier_availability_enabled`: el interruptor "Disponibilidad de repartidores" del
--   superadmin. Arranca PRENDIDO. Todo el servidor lo lee con `courier_availability_enabled()`. Apagado: no se
--   ve el interruptor del repartidor ni ningún aviso, y el aviso push de pedido nuevo llega a todos como antes.
-- - `courier_availability`: una fila por repartidor que alguna vez se prendió (sin fila = No disponible, que es
--   como arrancan todos). Solo cambia por `courier_set_available()` y por el apagado automático.
-- - `courier_availability_events`: un registro por cada prendida o apagada (`manual` o `auto_off`), para medir la
--   prueba. Nadie lo edita ni lo borra: no tiene políticas de escritura.
-- - Actividad = prender, tomar u ofertar un pedido, o cambiar el estado de un pedido propio. La registran
--   triggers sobre `orders` y `courier_offers` (solo cuenta si la hace el propio repartidor). A las 4 horas sin
--   actividad `courier_availability_expire()` (pg_cron, cada minuto) lo apaga con `reason = 'auto_off'`.
-- - Un repartidor cuenta como disponible para una zona si está disponible (y con actividad en las últimas 4 horas:
--   así el conteo es correcto aunque el cron se atrase), activo, cubre la zona y, con "Exigir términos" prendido,
--   aceptó la versión vigente.
-- - Lo público (menú y seguimiento) solo recibe si hay o no hay: `public_zone_has_couriers()` y
--   `public_order_has_couriers()`. El local recibe la cantidad y las zonas vacías, sin nombres
--   (`business_courier_availability()`).
-- - `courier_availability_pulse`: una fila con un contador, sin datos de nadie, que sube con cada cambio de
--   disponibilidad. Está en la publicación de Realtime para que el panel se actualice sin recargar.
--
-- Las tablas nuevas filtran por `courier_id` (la disponibilidad es del repartidor, que no tiene negocio), igual que
-- `courier_preferences`.

-- ---------------------------------------------------------------------------
-- Interruptor de la plataforma
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS courier_availability_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.courier_availability_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.courier_availability_enabled FROM public.platform_settings s WHERE s.id), true)
$$;

REVOKE ALL ON FUNCTION public.courier_availability_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_availability_enabled() TO authenticated;

-- Cuánto dura la disponibilidad sin actividad. Un solo lugar.
CREATE OR REPLACE FUNCTION public.courier_availability_idle_limit()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT interval '4 hours'
$$;

REVOKE ALL ON FUNCTION public.courier_availability_idle_limit() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Estado y registro de cambios
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.courier_availability (
  courier_id uuid PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT false,
  since timestamptz,
  last_activity_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT available OR (since IS NOT NULL AND last_activity_at IS NOT NULL))
);

ALTER TABLE public.courier_availability ENABLE ROW LEVEL SECURITY;

-- Sin políticas de insert, update ni delete: cambia por `courier_set_available()` y el apagado automático.
DROP POLICY IF EXISTS courier_availability_select_own ON public.courier_availability;
CREATE POLICY courier_availability_select_own
ON public.courier_availability
FOR SELECT TO authenticated
USING (courier_id = public.my_courier_id());

DROP POLICY IF EXISTS courier_availability_select_super_admin ON public.courier_availability;
CREATE POLICY courier_availability_select_super_admin
ON public.courier_availability
FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.courier_availability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  available boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (reason IN ('manual', 'auto_off'))
);

CREATE INDEX IF NOT EXISTS courier_availability_events_courier_idx
  ON public.courier_availability_events (courier_id, at DESC);

ALTER TABLE public.courier_availability_events ENABLE ROW LEVEL SECURITY;

-- Sin políticas de escritura: es el registro de la prueba y no se toca.
DROP POLICY IF EXISTS courier_availability_events_select_own ON public.courier_availability_events;
CREATE POLICY courier_availability_events_select_own
ON public.courier_availability_events
FOR SELECT TO authenticated
USING (courier_id = public.my_courier_id());

DROP POLICY IF EXISTS courier_availability_events_select_super_admin ON public.courier_availability_events;
CREATE POLICY courier_availability_events_select_super_admin
ON public.courier_availability_events
FOR SELECT TO authenticated
USING (public.is_super_admin());

-- El contador de Realtime: sin datos de nadie, lo puede leer cualquiera con sesión.
CREATE TABLE IF NOT EXISTS public.courier_availability_pulse (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  n bigint NOT NULL DEFAULT 0
);

INSERT INTO public.courier_availability_pulse (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.courier_availability_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_availability_pulse_select ON public.courier_availability_pulse;
CREATE POLICY courier_availability_pulse_select
ON public.courier_availability_pulse
FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.bump_courier_availability_pulse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.courier_availability_pulse SET n = n + 1;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_courier_availability_pulse() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS courier_availability_pulse_insert ON public.courier_availability;
CREATE TRIGGER courier_availability_pulse_insert
  AFTER INSERT ON public.courier_availability
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.bump_courier_availability_pulse();

DROP TRIGGER IF EXISTS courier_availability_pulse_update ON public.courier_availability;
CREATE TRIGGER courier_availability_pulse_update
  AFTER UPDATE OF available ON public.courier_availability
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.bump_courier_availability_pulse();

-- Realtime, solo si la publicación existe (en los tests con PGlite no está).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'courier_availability_pulse'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_availability_pulse;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Prender y apagar
-- ---------------------------------------------------------------------------

-- El propio repartidor prende o apaga. Prender (o volver a prender estando prendido) cuenta como actividad.
CREATE OR REPLACE FUNCTION public.courier_set_available(p_available boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_was boolean;
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF p_available IS NULL THEN
    RAISE EXCEPTION 'Falta indicar si estás disponible' USING ERRCODE = '22023';
  END IF;

  IF NOT public.courier_availability_enabled() THEN
    RAISE EXCEPTION 'La disponibilidad no está activada' USING ERRCODE = 'P0027';
  END IF;

  SELECT a.available INTO v_was FROM public.courier_availability a WHERE a.courier_id = v_courier FOR UPDATE;

  IF p_available THEN
    INSERT INTO public.courier_availability AS a (courier_id, available, since, last_activity_at, updated_at)
    VALUES (v_courier, true, now(), now(), now())
    ON CONFLICT (courier_id) DO UPDATE
    SET available = true,
        since = CASE WHEN a.available THEN a.since ELSE now() END,
        last_activity_at = now(),
        updated_at = now();
  ELSE
    UPDATE public.courier_availability
    SET available = false, since = NULL, updated_at = now()
    WHERE courier_id = v_courier;
  END IF;

  -- Un registro solo cuando cambia de verdad.
  IF coalesce(v_was, false) IS DISTINCT FROM p_available THEN
    INSERT INTO public.courier_availability_events (courier_id, available, reason)
    VALUES (v_courier, p_available, 'manual');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_set_available(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_set_available(boolean) TO authenticated;

-- Lo que ve el propio repartidor: si está disponible, desde cuándo y cuándo se apagaría solo.
CREATE OR REPLACE FUNCTION public.courier_availability_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_row record;
  v_on boolean;
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  SELECT a.available, a.since, a.last_activity_at INTO v_row
  FROM public.courier_availability a
  WHERE a.courier_id = v_courier;

  -- Pasadas las 4 horas se ve apagado aunque el cron todavía no haya pasado.
  v_on := coalesce(v_row.available, false)
          AND v_row.last_activity_at > now() - public.courier_availability_idle_limit();

  RETURN jsonb_build_object(
    'enabled', public.courier_availability_enabled(),
    'available', v_on,
    'since', CASE WHEN v_on THEN v_row.since END,
    'expires_at', CASE WHEN v_on THEN v_row.last_activity_at + public.courier_availability_idle_limit() END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_availability_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_availability_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- Actividad y apagado automático
-- ---------------------------------------------------------------------------

-- Suma actividad al repartidor cuando es él quien toma, oferta o cambia el estado (no el local, el cliente ni
-- el cron).
CREATE OR REPLACE FUNCTION public.touch_courier_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.courier_id IS NOT NULL AND new.courier_id IS NOT DISTINCT FROM public.my_courier_id() THEN
    UPDATE public.courier_availability
    SET last_activity_at = now()
    WHERE courier_id = new.courier_id AND available;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_courier_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_touch_courier_activity ON public.orders;
CREATE TRIGGER orders_touch_courier_activity
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (
    new.courier_id IS NOT NULL
    AND (
      new.courier_id IS DISTINCT FROM old.courier_id
      OR new.courier_status IS DISTINCT FROM old.courier_status
      OR new.status IS DISTINCT FROM old.status
    )
  )
  EXECUTE FUNCTION public.touch_courier_activity();

DROP TRIGGER IF EXISTS courier_offers_touch_activity ON public.courier_offers;
CREATE TRIGGER courier_offers_touch_activity
  AFTER INSERT OR UPDATE ON public.courier_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_courier_activity();

-- Cada minuto (pg_cron): apaga a quien lleva 4 horas sin actividad y deja el registro `auto_off`.
CREATE OR REPLACE FUNCTION public.courier_availability_expire()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.courier_availability a
    SET available = false, since = NULL, updated_at = now()
    WHERE a.available
      AND a.last_activity_at <= now() - public.courier_availability_idle_limit()
    RETURNING a.courier_id
  ), logged AS (
    INSERT INTO public.courier_availability_events (courier_id, available, reason)
    SELECT e.courier_id, false, 'auto_off' FROM expired e
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM logged;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_availability_expire() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'courier-availability-expire',
      '* * * * *',
      'select public.courier_availability_expire()'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Quién cuenta como disponible
-- ---------------------------------------------------------------------------

-- ¿Este repartidor está disponible ahora? Prendido, con actividad en las últimas 4 horas, activo y con los
-- términos vigentes aceptados (si se exigen).
CREATE OR REPLACE FUNCTION public.courier_available_now(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courier_availability a
    JOIN public.couriers c ON c.id = a.courier_id AND c.active
    WHERE a.courier_id = p_courier_id
      AND a.available
      AND a.last_activity_at > now() - public.courier_availability_idle_limit()
      AND public.courier_terms_accepted(p_courier_id)
  )
$$;

REVOKE ALL ON FUNCTION public.courier_available_now(uuid) FROM PUBLIC, anon, authenticated;

-- Cuántos repartidores disponibles cubren la zona.
CREATE OR REPLACE FUNCTION public.zone_available_couriers(p_zone_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.courier_zone_coverage cc
  WHERE cc.zone_id = p_zone_id
    AND public.courier_available_now(cc.courier_id)
$$;

REVOKE ALL ON FUNCTION public.zone_available_couriers(uuid) FROM PUBLIC, anon, authenticated;

-- Para el menú: ¿hay repartidores disponibles para esta zona? Solo sí o no, sin nombres ni cantidades. Con el
-- interruptor apagado, o con una zona que no existe, responde que sí: no hay nada que avisar.
CREATE OR REPLACE FUNCTION public.public_zone_has_couriers(p_zone_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN NOT public.courier_availability_enabled() THEN true
           WHEN NOT EXISTS (SELECT 1 FROM public.delivery_zones z WHERE z.id = p_zone_id AND z.active) THEN true
           ELSE public.zone_available_couriers(p_zone_id) > 0
         END
$$;

REVOKE ALL ON FUNCTION public.public_zone_has_couriers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_zone_has_couriers(uuid) TO anon, authenticated;

-- Para el seguimiento: mientras el pedido busca repartidor, ¿hay alguno disponible para su zona? Nulo cuando no
-- aplica (código que no existe, pedido que ya tiene repartidor o terminó, interruptor apagado).
CREATE OR REPLACE FUNCTION public.public_order_has_couriers(p_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_zone uuid;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  IF NOT public.courier_availability_enabled() THEN
    RETURN NULL;
  END IF;

  SELECT o.delivery_zone_id INTO v_zone
  FROM public.orders o
  WHERE o.code = p_code
    AND o.courier_status IN ('waiting', 'searching')
    AND o.courier_id IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
    AND o.delivery_zone_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN public.zone_available_couriers(v_zone) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_has_couriers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_has_couriers(text) TO anon, authenticated;

-- Para la pantalla de pedidos del local: cuántos repartidores disponibles cubren al menos una de sus zonas, y
-- cuáles de sus zonas están en 0. El negocio lo pone el servidor (`requireBusiness()`), pero la función igual
-- comprueba que quien llama es miembro.
CREATE OR REPLACE FUNCTION public.business_courier_availability(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_users bu WHERE bu.user_id = v_uid AND bu.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'No tenés acceso a ese negocio' USING ERRCODE = '42501';
  END IF;

  IF NOT public.courier_availability_enabled() THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  RETURN jsonb_build_object(
    'enabled', true,
    'total', (
      SELECT count(DISTINCT cc.courier_id)::integer
      FROM public.business_delivery_zones bz
      JOIN public.courier_zone_coverage cc ON cc.zone_id = bz.zone_id
      WHERE bz.business_id = p_business_id
        AND public.courier_available_now(cc.courier_id)
    ),
    'empty_zone_ids', coalesce((
      SELECT jsonb_agg(bz.zone_id ORDER BY bz.zone_id)
      FROM public.business_delivery_zones bz
      WHERE bz.business_id = p_business_id
        AND public.zone_available_couriers(bz.zone_id) = 0
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_courier_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_courier_availability(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Aviso push de pedido nuevo
-- ---------------------------------------------------------------------------

-- courier_push_eligible: igual que en 20261116000000, más "disponible ahora" cuando el interruptor de
-- disponibilidad está prendido. Los avisos de pedidos que ya son del repartidor no pasan por acá.
CREATE OR REPLACE FUNCTION public.courier_push_eligible(p_courier_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(c.id), '{}'::uuid[])
  FROM public.couriers c
  WHERE c.id = ANY (p_courier_ids)
    AND public.courier_terms_accepted(c.id)
    AND (NOT public.courier_availability_enabled() OR public.courier_available_now(c.id))
$$;

REVOKE ALL ON FUNCTION public.courier_push_eligible(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_push_eligible(uuid[]) TO service_role;
