-- Tiempo para asignar a mano, configurable (ENVIO-241 a 244).
--
-- - `platform_settings.manual_assign_minutes`: cuántos minutos espera un pedido buscando repartidor sin ninguna oferta
--   antes de destacarlo en el tablero ("Nadie ofertó todavía: asignalo a mano o llevalo vos") y de avisarle al local
--   (`orders.no_offers_alerted_at`). Es global para la plataforma, de 1 a 30, y arranca en 5 (antes estaba fijo en 10).
--   Lo cambia solo el superadmin: la tabla ya tiene su RLS (20261104000000_modo_de_envios.sql), esta columna la hereda.
-- - `manual_assign_minutes()` lo lee desde el servidor y el tablero; `no_offers_alert_window()` (la que usa
--   `run_order_timers()` sin cambios) pasa a devolver ese valor. Los 5 minutos de la elección automática de ofertas
--   (`courier_offers_window()`) son otro tiempo y no se tocan.
--
-- Las migraciones anteriores no se tocan: `run_order_timers()` sigue siendo la de 20261105000000.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS manual_assign_minutes smallint NOT NULL DEFAULT 5
  CONSTRAINT platform_settings_manual_assign_minutes_range CHECK (manual_assign_minutes BETWEEN 1 AND 30);

-- SECURITY DEFINER: `platform_settings` es solo del superadmin y el local necesita el valor para ver su tablero.
CREATE OR REPLACE FUNCTION public.manual_assign_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.manual_assign_minutes FROM public.platform_settings s WHERE s.id), 5)::integer
$$;

REVOKE ALL ON FUNCTION public.manual_assign_minutes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_assign_minutes() TO authenticated;

-- Cuándo se marca (una sola vez) que nadie ofertó: el mismo valor, en intervalo. Solo la llama `run_order_timers()`.
CREATE OR REPLACE FUNCTION public.no_offers_alert_window()
RETURNS interval
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT make_interval(mins => public.manual_assign_minutes()) $$;

REVOKE ALL ON FUNCTION public.no_offers_alert_window() FROM PUBLIC, anon, authenticated;
