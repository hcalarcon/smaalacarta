-- Realtime de pedidos y ofertas (ENVIO-172).
--
-- El panel del local y el del repartidor se enteraban de un cambio recién en la próxima consulta periódica
-- (15 a 20 segundos). Con `orders` y `courier_offers` en la publicación `supabase_realtime`, el navegador
-- recibe el cambio al instante y pide los datos nuevos. Supabase Realtime aplica el RLS de cada tabla a cada
-- suscriptor: el local solo recibe lo de su negocio y el repartidor, lo que ya puede ver. No se crea ninguna
-- tabla ni política.
--
-- Idempotente y tolerante: en la base de tests no existe la publicación.
DO $$
DECLARE
  tbl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY['orders', 'courier_offers'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
