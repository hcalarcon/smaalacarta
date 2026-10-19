-- Ajustes a los términos para repartidores (ENVIO-186 a 190), marcados por el /code-review de la tarea 33.
--
-- Con "Exigir términos a repartidores" prendido, el repartidor que no aceptó la versión vigente:
-- - no recibe el aviso de pedido nuevo (`courier_push_eligible()`, que lee el endpoint del webhook push);
-- - queda afuera de la elección automática de ofertas (`settle_courier_offers`);
-- - no se le puede asignar a mano un pedido (error `P0026`) y no aparece en la lista para elegir
--   (`business_delivery_options`).
-- Apagado el interruptor, `courier_terms_accepted()` es verdadero para todos y nada de esto filtra.
--
-- Las funciones de abajo repiten, sin otros cambios, las últimas versiones: settle_courier_offers de
-- 20261104000000, business_assign_courier y business_delivery_options de 20261113000000.

-- De una lista de repartidores, los que pueden recibir el aviso de pedido nuevo. Solo la clave de servicio.
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
$$;

REVOKE ALL ON FUNCTION public.courier_push_eligible(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_push_eligible(uuid[]) TO service_role;

-- settle_courier_offers: igual que en 20261104000000, más "ignora las ofertas de quien no aceptó los términos".
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
    AND o.delivery_mode = 'offers'
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
    AND public.courier_terms_accepted(f.courier_id)
  ORDER BY f.price ASC,
           (f.courier_id IS NOT DISTINCT FROM (
             SELECT public.effective_favorite_courier(v_order.business_id)
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

-- business_assign_courier: igual que en 20261113000000, más el error P0026 si el repartidor no aceptó los términos.
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

  SELECT o.id, o.business_id, o.status, o.courier_status, o.delivery_zone_id, o.needs_car
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

  IF NOT public.courier_terms_accepted(p_courier_id) THEN
    RAISE EXCEPTION 'El repartidor todavía no aceptó los términos para repartidores' USING ERRCODE = 'P0026';
  END IF;

  IF v_order.needs_car
     AND public.vehicle_enabled()
     AND NOT EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = p_courier_id AND c.auto) THEN
    RAISE EXCEPTION 'Este pedido necesita auto' USING ERRCODE = 'P0024';
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

-- business_delivery_options: igual que en 20261113000000, más "solo los repartidores que aceptaron los términos".
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
               ) || CASE
                 WHEN public.courier_vehicles(c.id) IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('vehiculo', public.courier_vehicles(c.id))
               END
               ORDER BY c.name, c.id
             )
      FROM public.couriers c
      WHERE c.active
        AND public.courier_terms_accepted(c.id)
        AND EXISTS (
          SELECT 1 FROM public.courier_zone_coverage cc
          JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
          WHERE cc.courier_id = c.id
        )
    ), '[]'::jsonb),
    'favorite_id', (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_business),
    'default_courier', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name)
      FROM public.couriers c
      WHERE c.id = public.default_courier_id() AND c.active
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_options() TO authenticated;
