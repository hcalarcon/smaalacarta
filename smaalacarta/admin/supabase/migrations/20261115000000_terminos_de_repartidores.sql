-- Términos para repartidores (ENVIO-179 a 185).
--
-- - `platform_settings.courier_terms_required`: el interruptor "Exigir términos a repartidores". Arranca PRENDIDO.
--   Apagado, nada se muestra ni se bloquea. Todo el servidor lo lee con `courier_terms_required()`.
-- - `platform_settings.courier_terms_version`: la versión vigente (arranca en 1). Es el único lugar del servidor
--   donde vive; el texto está en admin/src/content/terminos-repartidores.md con el mismo número, y un test comprueba
--   que coincidan. Subir los términos: editar el archivo, subir el número y una migración con el UPDATE.
-- - `courier_terms_acceptances`: una fila por aceptación (repartidor, versión, `accepted_at` del servidor). No se
--   pisa ni se borra: es la prueba. No tiene políticas de escritura: se crea solo con `courier_accept_terms()`, que
--   exige la versión vigente y pone la hora. El repartidor lee las suyas y el superadmin todas.
-- - Sin aceptar la versión vigente (con el interruptor prendido): `courier_sees_order()` es falso,
--   `courier_available_orders()` devuelve vacío, y tomar u ofertar da `P0025`.
--
-- Las funciones de abajo repiten, sin otros cambios, las últimas versiones de 20261113000000.

-- ---------------------------------------------------------------------------
-- Interruptor y versión de la plataforma
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS courier_terms_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS courier_terms_version integer NOT NULL DEFAULT 1 CHECK (courier_terms_version >= 1);

-- Las pueden preguntar las pantallas del repartidor (con sesión). La tabla sigue siendo solo del superadmin.
CREATE OR REPLACE FUNCTION public.courier_terms_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.courier_terms_required FROM public.platform_settings s WHERE s.id), true)
$$;

REVOKE ALL ON FUNCTION public.courier_terms_required() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_terms_required() TO authenticated;

CREATE OR REPLACE FUNCTION public.courier_terms_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.courier_terms_version FROM public.platform_settings s WHERE s.id), 1)
$$;

REVOKE ALL ON FUNCTION public.courier_terms_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_terms_version() TO authenticated;

-- ---------------------------------------------------------------------------
-- Aceptaciones
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.courier_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (courier_id, version)
);

ALTER TABLE public.courier_terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Sin políticas de insert, update ni delete: se crea con courier_accept_terms() y no se toca más.
DROP POLICY IF EXISTS courier_terms_acceptances_select_own ON public.courier_terms_acceptances;
CREATE POLICY courier_terms_acceptances_select_own
ON public.courier_terms_acceptances
FOR SELECT TO authenticated
USING (courier_id = public.my_courier_id());

DROP POLICY IF EXISTS courier_terms_acceptances_select_super_admin ON public.courier_terms_acceptances;
CREATE POLICY courier_terms_acceptances_select_super_admin
ON public.courier_terms_acceptances
FOR SELECT TO authenticated
USING (public.is_super_admin());

-- El repartidor acepta la versión vigente, una sola vez. La hora la pone el servidor.
CREATE OR REPLACE FUNCTION public.courier_accept_terms(p_version integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF p_version IS DISTINCT FROM public.courier_terms_version() THEN
    RAISE EXCEPTION 'Los términos cambiaron: leé la versión vigente' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.courier_terms_acceptances (courier_id, user_id, version)
  VALUES (v_courier, v_uid, p_version)
  ON CONFLICT (courier_id, version) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_accept_terms(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_accept_terms(integer) TO authenticated;

-- ¿Este repartidor puede operar? Sí si no se exigen términos o si aceptó la versión vigente.
CREATE OR REPLACE FUNCTION public.courier_terms_accepted(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT public.courier_terms_required()
         OR EXISTS (
           SELECT 1 FROM public.courier_terms_acceptances a
           WHERE a.courier_id = p_courier_id AND a.version = public.courier_terms_version()
         )
$$;

REVOKE ALL ON FUNCTION public.courier_terms_accepted(uuid) FROM PUBLIC, anon, authenticated;

-- El estado del propio repartidor, para la pantalla de términos y "Mi perfil".
CREATE OR REPLACE FUNCTION public.courier_terms_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_last record;
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  -- La última que aceptó, sea de la versión vigente o de una anterior.
  SELECT a.version, a.accepted_at INTO v_last
  FROM public.courier_terms_acceptances a
  WHERE a.courier_id = v_courier
  ORDER BY a.version DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'required', public.courier_terms_required(),
    'version', public.courier_terms_version(),
    'accepted', EXISTS (
      SELECT 1 FROM public.courier_terms_acceptances a
      WHERE a.courier_id = v_courier AND a.version = public.courier_terms_version()
    ),
    'accepted_version', v_last.version,
    'accepted_at', v_last.accepted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_terms_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_terms_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- Quién ve, toma y oferta
-- ---------------------------------------------------------------------------

-- courier_sees_order: igual que en 20261113000000, más "aceptó los términos vigentes" (ENVIO-182).
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
      AND (NOT o.needs_car OR c.auto OR NOT public.vehicle_enabled())
      AND public.courier_terms_accepted(p_courier_id)
  );
$$;

REVOKE ALL ON FUNCTION public.courier_sees_order(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- courier_take_order: igual que en 20261113000000, más el error P0025 si no aceptó los términos.
CREATE OR REPLACE FUNCTION public.courier_take_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_courier uuid := public.my_courier_id();
  v_time text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_mode text;
  v_name text;
  v_order record;
BEGIN
  IF v_uid IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF NOT public.courier_terms_accepted(v_courier) THEN
    RAISE EXCEPTION 'Tenés que aceptar los términos para repartidores' USING ERRCODE = 'P0025';
  END IF;

  IF public.courier_blocked_by_car(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'Este pedido necesita auto' USING ERRCODE = 'P0024';
  END IF;

  SELECT o.delivery_mode INTO v_mode
  FROM public.orders o
  WHERE o.id = p_order_id AND public.courier_sees_order(o.id, v_courier);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ya lo tomó otro repartidor o ya no está disponible' USING ERRCODE = 'P0019';
  END IF;

  IF v_mode IS DISTINCT FROM 'fixed' THEN
    RAISE EXCEPTION 'Este pedido no se toma: acepta ofertas' USING ERRCODE = 'P0023';
  END IF;

  SELECT c.name INTO v_name FROM public.couriers c WHERE c.id = v_courier;

  UPDATE public.orders o
  SET courier_id = v_courier,
      courier_status = 'accepted',
      courier_note = NULL,
      courier_responded_at = now(),
      delivery_fee = o.delivery_fee_list,
      delivery_fee_reason = NULL,
      delivery_fee_changed_by = NULL,
      delivery_fee_changed_at = NULL,
      updated_at = now()
  WHERE o.id = p_order_id
    AND o.courier_status = 'searching'
    AND o.courier_id IS NULL
    AND o.delivery_mode = 'fixed'
    AND public.courier_sees_order(o.id, v_courier)
  RETURNING o.business_id, o.status INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ya lo tomó otro repartidor o ya no está disponible' USING ERRCODE = 'P0019';
  END IF;

  INSERT INTO public.order_events (order_id, business_id, status, changed_by, note, kind)
  VALUES (
    p_order_id, v_order.business_id, v_order.status, v_uid,
    'Envío tomado por ' || v_name || ', ' || v_time,
    'delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_take_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_take_order(uuid) TO authenticated;

-- courier_make_offer: igual que en 20261113000000, más el error P0025 si no aceptó los términos.
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

  IF NOT public.courier_terms_accepted(v_courier) THEN
    RAISE EXCEPTION 'Tenés que aceptar los términos para repartidores' USING ERRCODE = 'P0025';
  END IF;

  -- Si ya pasó el tiempo, el pedido se resuelve primero: una oferta tardía no cambia lo elegido.
  PERFORM public.settle_courier_offers(p_order_id);

  IF public.courier_blocked_by_car(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'Este pedido necesita auto' USING ERRCODE = 'P0024';
  END IF;

  IF NOT public.courier_sees_order(p_order_id, v_courier) THEN
    RAISE EXCEPTION 'El pedido ya no recibe ofertas' USING ERRCODE = 'P0020';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.delivery_mode = 'fixed') THEN
    RAISE EXCEPTION 'Este pedido no acepta ofertas' USING ERRCODE = 'P0023';
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

-- courier_available_orders: igual que en 20261113000000, vacío si no aceptó los términos.
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

  -- Sin aceptar los términos vigentes no ve ningún pedido (ENVIO-182).
  IF NOT public.courier_terms_accepted(v_courier) THEN
    RETURN '[]'::jsonb;
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
               'necesita_auto', (o.needs_car AND public.vehicle_enabled()),
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
