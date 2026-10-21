-- Ajustes a la disponibilidad de repartidores marcados por el /code-review (ENVIO-191 a 202).
--
-- - Ofertar cuenta como actividad al crear la oferta o cambiarla de precio o motivo, pero no cuando solo se cierra
--   o se reabre sola: la lectura perezosa de `settle_courier_offers` corre con la sesión del repartidor y no es algo
--   que él haya hecho.
-- - `courier_set_available` serializa las llamadas del mismo repartidor: un doble toque en el primer "prender" ya no
--   deja dos registros `manual`.
-- - `business_courier_availability` marca también las zonas de los pedidos abiertos del local aunque ya no envíe ahí.
--
-- Las funciones de abajo repiten, sin otros cambios, las de 20261117000000.

DROP TRIGGER IF EXISTS courier_offers_touch_activity ON public.courier_offers;
CREATE TRIGGER courier_offers_touch_activity
  AFTER INSERT OR UPDATE OF price, reason ON public.courier_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_courier_activity();

-- courier_set_available: igual que en 20261117000000, más el bloqueo por repartidor.
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

  -- Serializa dos llamadas del mismo repartidor (un doble toque, dos pestañas): sin fila todavía, el FOR UPDATE
  -- no bloquea nada y las dos verían que antes estaba apagado.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_courier::text, 0));

  SELECT a.available INTO v_was FROM public.courier_availability a WHERE a.courier_id = v_courier;

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

-- business_courier_availability: igual que en 20261117000000, más las zonas de los pedidos abiertos.
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
    -- Las zonas del local y las de sus pedidos todavía sin repartidor (aunque ya no envíe a esa zona).
    'empty_zone_ids', coalesce((
      SELECT jsonb_agg(z.zone_id ORDER BY z.zone_id)
      FROM (
        SELECT bz.zone_id FROM public.business_delivery_zones bz WHERE bz.business_id = p_business_id
        UNION
        SELECT o.delivery_zone_id
        FROM public.orders o
        WHERE o.business_id = p_business_id
          AND o.delivery_zone_id IS NOT NULL
          AND o.courier_id IS NULL
          AND o.courier_status IN ('waiting', 'searching')
          AND o.status NOT IN ('delivered', 'cancelled')
      ) z
      WHERE public.zone_available_couriers(z.zone_id) = 0
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_courier_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_courier_availability(uuid) TO authenticated;
