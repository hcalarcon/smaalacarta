-- Recordatorios de pedido nuevo sin atender (ADMIN-PWA-33 a 35).
--
-- El aviso push de un pedido nuevo sale una sola vez, cuando entra (INSERT). Si el local no lo ve, nadie
-- se lo vuelve a decir. Acá `run_order_timers()` (pg_cron, cada minuto) le suma un recordatorio cada 2
-- minutos a cada pedido por menú que sigue en `pending`, hasta 5. Es el mismo patrón que
-- `no_offers_alerted_at` (20261025000000_avisos_push.sql): el UPDATE dispara el Database Webhook sobre
-- `orders` y `src/lib/push/events.ts` deduce el evento `local_new_order_reminder` de que
-- `new_order_reminders` subió. Un pedido que sale de `pending` (confirmado, cancelado…) deja de cumplir
-- la condición y no se recuerda más; no hace falta limpiar nada.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS new_order_reminders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_order_reminded_at timestamptz;

-- Cada cuánto se recuerda y cuántas veces como máximo. Aparte, para que los tests y el texto del aviso
-- (`src/lib/push/messages.ts`) tengan un solo lugar donde mirar.
CREATE OR REPLACE FUNCTION public.new_order_reminder_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT interval '2 minutes' $$;

CREATE OR REPLACE FUNCTION public.new_order_reminder_max()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 5 $$;

-- Cuerpo anterior: el de `run_order_timers` en 20261025000000_avisos_push.sql, sin cambios, más el bloque
-- de recordatorios al final.
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
END;
$$;

REVOKE ALL ON FUNCTION public.run_order_timers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.new_order_reminder_interval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.new_order_reminder_max() FROM PUBLIC, anon, authenticated;
