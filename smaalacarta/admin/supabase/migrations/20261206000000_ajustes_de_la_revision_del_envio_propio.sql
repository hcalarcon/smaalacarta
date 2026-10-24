-- Ajustes de la revisión del envío propio (ENVIO-250 y 251).
--
-- - Un pedido de zona propia que quedó esperando cuando el negocio pasó a envío libre no tiene a quién buscar: al
--   confirmarlo queda "Lo llevo yo" en vez de esperar para siempre.
-- - Un repartidor que pasa a ser propio cierra sus ofertas abiertas: ya no puede ser elegido en pedidos de la red.
-- - Un favorito que ahora es repartidor propio deja de ser favorito de un negocio libre.

-- Misma `open_courier_search_on_confirm` de `20261203000000_envio_propio_del_negocio.sql`, con el caso de arriba.
CREATE OR REPLACE FUNCTION public.open_courier_search_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assign_direct_delivery(new.id);

  UPDATE public.orders
  SET courier_status = 'searching',
      offered_at = now()
  WHERE id = new.id
    AND courier_status = 'waiting'
    AND courier_id IS NULL
    AND delivery_zone_id IS NOT NULL;

  UPDATE public.orders
  SET courier_status = 'self',
      courier_responded_at = now()
  WHERE id = new.id
    AND courier_status = 'waiting'
    AND courier_id IS NULL
    AND delivery_zone_id IS NULL
    AND own_zone_id IS NOT NULL;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.open_courier_search_on_confirm() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.close_offers_when_courier_becomes_own()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.courier_offers WHERE courier_id = new.id AND closed_at IS NULL;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.close_offers_when_courier_becomes_own() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS couriers_close_offers_when_own ON public.couriers;
CREATE TRIGGER couriers_close_offers_when_own
  AFTER UPDATE OF courier_type ON public.couriers
  FOR EACH ROW
  WHEN (new.courier_type = 'own' AND old.courier_type IS DISTINCT FROM 'own')
  EXECUTE FUNCTION public.close_offers_when_courier_becomes_own();

UPDATE public.business_settings s
SET favorite_courier_id = NULL
FROM public.couriers c
WHERE c.id = s.favorite_courier_id AND c.courier_type = 'own';
