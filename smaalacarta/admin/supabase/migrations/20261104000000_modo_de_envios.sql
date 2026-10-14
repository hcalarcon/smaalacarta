-- Modo de envíos: precio fijo (el primero que toma) u ofertas (ENVIO-145 a 154).
--
-- Cambia una sola cosa del circuito de `20261023000000_ofertas_de_repartidor.sql` (que no se edita): el
-- superadmin elige, para toda la plataforma, si un pedido nuevo se reparte "al primero que toma, al
-- precio de lista de la zona" (`fixed`) o con ofertas y elección del cliente (`offers`, todo lo de
-- antes, intacto). Cada pedido conserva el modo con el que nació: mover el interruptor no toca los que
-- están en curso.
--
-- - `platform_settings`: una fila, arranca en `fixed`. Solo el superadmin la lee y la escribe.
-- - `effective_delivery_mode(negocio)`: hoy devuelve el de la plataforma. Todo el código lee el modo por
--   acá: el día que sea por local, se cambia solo esta función.
-- - `orders.delivery_mode`: se copia al entrar el pedido al circuito (trigger BEFORE INSERT/UPDATE, así
--   vale para el menú y para el pedido manual sin tocar sus funciones). Los abiertos hoy quedan `offers`.
-- - `courier_take_order(pedido)` vuelve, solo para `fixed`. Las funciones de ofertas solo valen en `offers`.
--
-- Errores: `P0019` ("ya lo tomó otro", otra vez en uso) y `P0023` ("este pedido no acepta ofertas", o
-- "no se toma": el pedido es del otro modo).

-- ---------------------------------------------------------------------------
-- Configuración de la plataforma
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  delivery_mode text NOT NULL DEFAULT 'fixed' CHECK (delivery_mode IN ('fixed', 'offers')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Sin políticas de insert ni de delete: la fila es una sola y no se crea ni se borra desde la app.
DROP POLICY IF EXISTS platform_settings_select_super_admin ON public.platform_settings;
CREATE POLICY platform_settings_select_super_admin
ON public.platform_settings
FOR SELECT
TO authenticated
USING ((select public.is_super_admin()));

DROP POLICY IF EXISTS platform_settings_update_super_admin ON public.platform_settings;
CREATE POLICY platform_settings_update_super_admin
ON public.platform_settings
FOR UPDATE
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

-- El único lugar donde se decide el modo de un negocio. Hoy es el de la plataforma.
CREATE OR REPLACE FUNCTION public.effective_delivery_mode(p_business_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.delivery_mode FROM public.platform_settings s WHERE s.id
$$;

REVOKE ALL ON FUNCTION public.effective_delivery_mode(uuid) FROM PUBLIC, anon, authenticated;

-- Cuántos pedidos están buscando repartidor ahora, para que el superadmin sepa si es buen momento de
-- cambiar el modo. Solo lo puede llamar el superadmin.
CREATE OR REPLACE FUNCTION public.platform_searching_orders()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (select public.is_super_admin()) THEN
    RAISE EXCEPTION 'Solo el superadmin puede hacer esto' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT count(*)::integer
    FROM public.orders o
    WHERE o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_searching_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_searching_orders() TO authenticated;

-- ---------------------------------------------------------------------------
-- El modo con el que nace cada pedido
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_mode text CHECK (delivery_mode IN ('fixed', 'offers'));

-- Los pedidos que hoy están en el circuito siguen con ofertas.
UPDATE public.orders
SET delivery_mode = 'offers'
WHERE courier_status IN ('waiting', 'searching', 'accepted')
  AND status NOT IN ('delivered', 'cancelled');

CREATE OR REPLACE FUNCTION public.set_order_delivery_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  new.delivery_mode := public.effective_delivery_mode(new.business_id);
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_delivery_mode() FROM PUBLIC, anon, authenticated;

-- Se copia una sola vez: cuando el pedido entra al circuito y todavía no tiene modo.
DROP TRIGGER IF EXISTS orders_set_delivery_mode ON public.orders;
CREATE TRIGGER orders_set_delivery_mode
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  WHEN (new.delivery_mode IS NULL AND new.courier_status IN ('waiting', 'searching', 'accepted'))
  EXECUTE FUNCTION public.set_order_delivery_mode();

-- Nadie cambia el modo de un pedido desde la app (ni el local ni el cliente).
CREATE OR REPLACE FUNCTION public.guard_order_delivery_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'El modo de envío del pedido no se cambia' USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_delivery_mode ON public.orders;
CREATE TRIGGER orders_guard_delivery_mode
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  WHEN (new.delivery_mode IS DISTINCT FROM old.delivery_mode)
  EXECUTE FUNCTION public.guard_order_delivery_mode();

-- ---------------------------------------------------------------------------
-- Precio fijo: el primero que toma
-- ---------------------------------------------------------------------------

-- Un solo UPDATE condicional: dos repartidores a la vez no pueden tomarlo los dos (gana uno; al otro no
-- le toca ninguna fila y recibe P0019). Sin precio ni motivo: el precio es el de lista de la zona.
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

-- ---------------------------------------------------------------------------
-- Cada modo con lo suyo
-- ---------------------------------------------------------------------------

-- courier_available_orders: igual que en 20261023000000, más `modo` en cada pedido (ENVIO-149).
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

-- courier_make_offer: igual que en 20261023000000; en un pedido `fixed` da P0023 (ENVIO-148).
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

-- courier_withdraw_offer: igual que en 20261023000000; en un pedido `fixed` da P0023 (ENVIO-148).
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

  IF public.courier_sees_order(p_order_id, v_courier)
     AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.delivery_mode = 'fixed') THEN
    RAISE EXCEPTION 'Este pedido no acepta ofertas' USING ERRCODE = 'P0023';
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

-- public_choose_courier: igual que en 20261023000000; en un pedido `fixed` da P0023 (ENVIO-148).
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

  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id = v_order AND o.delivery_mode = 'fixed') THEN
    RAISE EXCEPTION 'Este pedido no acepta ofertas' USING ERRCODE = 'P0023';
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

-- settle_courier_offers: igual que en 20261028000000, solo sobre pedidos `offers` (ENVIO-148).
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

-- public_order_delivery: igual que en 20261028000000, más `modo`; en `fixed` no manda ofertas (ENVIO-149).
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
         o.business_id, o.status, o.delivery_mode
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
    'ofertas', v_offers,
    'cierra_en', v_deadline
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;
