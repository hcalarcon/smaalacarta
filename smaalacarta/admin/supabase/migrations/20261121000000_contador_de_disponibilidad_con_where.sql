-- Arregla el interruptor Conectado del repartidor en Supabase (ENVIO-191 y 202).
--
-- `bump_courier_availability_pulse` (20261117000000) hacía `UPDATE ... SET n = n + 1` sin WHERE. Supabase tiene
-- activado pg_safeupdate, que rechaza un UPDATE sin WHERE ("UPDATE requires a WHERE clause", 21000): prender o apagar
-- fallaba siempre. La tabla tiene una sola fila (`id` es siempre true), así que el WHERE no cambia el resultado.

CREATE OR REPLACE FUNCTION public.bump_courier_availability_pulse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.courier_availability_pulse SET n = n + 1 WHERE id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_courier_availability_pulse() FROM PUBLIC, anon, authenticated;
