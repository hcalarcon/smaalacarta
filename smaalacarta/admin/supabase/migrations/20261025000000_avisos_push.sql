-- Avisos push para el panel instalable (ADMIN-PWA-1 a 8).
--
-- Dos cosas:
--
-- 1. `push_subscriptions`: las suscripciones push de cada persona. Es de la PERSONA, no del negocio
--    (excepción aprobada al CLAUDE.md): la cuenta repartidor no tiene negocio y más adelante se van a
--    registrar clientes, así que el RLS filtra por `user_id`, no por `business_id`. Las filas las crean y
--    mueven solo las funciones de abajo; el aviso en sí lo manda `/api/push/order` con la clave de servicio.
--
-- 2. Las tareas por tiempo con pg_cron (`run_order_timers`). La elección automática de ofertas
--    (`settle_courier_offers`, de `20261023000000_ofertas_de_repartidor.sql`) era perezosa: solo corría
--    cuando alguien miraba el pedido. Para avisarle al elegido sin que nadie tenga la página abierta, ahora
--    también corre cada minuto. Y se marca una sola vez (`orders.no_offers_alerted_at`) el pedido que lleva
--    10 minutos buscando sin ninguna oferta: ese UPDATE es el que dispara el aviso al local por el webhook.
--    La elección perezosa sigue andando igual (es idempotente); el cron solo la adelanta.

-- ---------------------------------------------------------------------------
-- Suscripciones
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- La dirección del servicio push del navegador. Única: el mismo aparato tiene una sola suscripción.
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Solo leer y borrar lo propio. No hay INSERT ni UPDATE directos: guardar pasa por
-- `save_push_subscription`, que además pasa un endpoint de una cuenta a otra.
DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own
ON public.push_subscriptions
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

-- Guarda la suscripción del usuario actual. Si ese endpoint ya estaba con otra cuenta (el mismo celular
-- usado por otra persona), se la saca a la anterior: un aparato avisa a una sola cuenta.
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh text := btrim(coalesce(p_p256dh, ''));
  v_auth text := btrim(coalesce(p_auth, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF v_endpoint !~ '^https://.+' OR char_length(v_endpoint) > 2048 THEN
    RAISE EXCEPTION 'La dirección de la suscripción no es válida' USING ERRCODE = '22023';
  END IF;

  IF v_p256dh = '' OR v_auth = '' OR char_length(v_p256dh) > 512 OR char_length(v_auth) > 512 THEN
    RAISE EXCEPTION 'Las claves de la suscripción no son válidas' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.push_subscriptions WHERE endpoint = v_endpoint;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_uid, v_endpoint, v_p256dh, v_auth, left(NULLIF(btrim(coalesce(p_user_agent, '')), ''), 300));
END;
$$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;

-- Borra la propia. SECURITY INVOKER: el RLS de arriba ya limita el DELETE a las filas del usuario.
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
$$;

REVOKE ALL ON FUNCTION public.delete_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tareas por tiempo
-- ---------------------------------------------------------------------------

-- Cuándo se marca (una sola vez) que nadie ofertó. Un lugar para la constante, como las ventanas de ofertas.
CREATE OR REPLACE FUNCTION public.no_offers_alert_window()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT interval '10 minutes' $$;

REVOKE ALL ON FUNCTION public.no_offers_alert_window() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS no_offers_alerted_at timestamptz;

-- Si el pedido vuelve a buscar repartidor (una devolución), la marca se limpia: la espera arranca de nuevo
-- y, si otra vez nadie oferta, vuelve a avisar. Es un trigger y no un cambio en `courier_return_order`
-- para no reescribir esa función: cubre cualquier camino que reabra la búsqueda.
CREATE OR REPLACE FUNCTION public.clear_no_offers_alert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  new.no_offers_alerted_at := NULL;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_no_offers_alert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_clear_no_offers_alert ON public.orders;
CREATE TRIGGER orders_clear_no_offers_alert
  BEFORE UPDATE OF courier_status ON public.orders
  FOR EACH ROW
  WHEN (new.courier_status = 'searching' AND old.courier_status IS DISTINCT FROM 'searching')
  EXECUTE FUNCTION public.clear_no_offers_alert();

-- Lo que corre cada minuto. SECURITY DEFINER y sin permiso para `anon` ni `authenticated`: lo llama pg_cron
-- (y los tests), nunca la app.
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
END;
$$;

REVOKE ALL ON FUNCTION public.run_order_timers() FROM PUBLIC, anon, authenticated;

-- Cada minuto, si la extensión está (en Supabase se activa desde el panel; los tests con PGlite no la tienen).
-- `cron.schedule` con el mismo nombre reemplaza el trabajo: la migración se puede repetir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'order-timers',
      '* * * * *',
      'select public.run_order_timers()'
    );
  END IF;
END;
$$;
