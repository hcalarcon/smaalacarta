-- Ajustes de la revisión del tipo de precio del envío (ENVIO-221 y 220).
--
-- - Una zona propia con un pedido en curso no se borra (P0029): si no, el pedido quedaba sin zona y sin quien lo viera.
--   Se desactiva. Los pedidos terminados no cuentan.
-- - Un negocio solo carga precios para las zonas que tiene tildadas.

CREATE OR REPLACE FUNCTION public.guard_own_zone_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.courier_zone_id = old.id
      AND o.status NOT IN ('delivered', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'La zona tiene un pedido en curso' USING ERRCODE = 'P0029';
  END IF;

  RETURN old;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_own_zone_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS courier_own_zones_guard_delete ON public.courier_own_zones;
CREATE TRIGGER courier_own_zones_guard_delete
  BEFORE DELETE ON public.courier_own_zones
  FOR EACH ROW EXECUTE FUNCTION public.guard_own_zone_delete();

DROP POLICY IF EXISTS business_zone_prices_insert_editor ON public.business_zone_prices;
CREATE POLICY business_zone_prices_insert_editor
ON public.business_zone_prices
FOR INSERT TO authenticated
WITH CHECK (
  (select public.can_edit_business_prices(business_zone_prices.business_id))
  AND EXISTS (
    SELECT 1 FROM public.business_delivery_zones bd
    WHERE bd.business_id = business_zone_prices.business_id AND bd.zone_id = business_zone_prices.zone_id
  )
);

DROP POLICY IF EXISTS business_zone_prices_update_editor ON public.business_zone_prices;
CREATE POLICY business_zone_prices_update_editor
ON public.business_zone_prices
FOR UPDATE TO authenticated
USING ((select public.can_edit_business_prices(business_zone_prices.business_id)))
WITH CHECK (
  (select public.can_edit_business_prices(business_zone_prices.business_id))
  AND EXISTS (
    SELECT 1 FROM public.business_delivery_zones bd
    WHERE bd.business_id = business_zone_prices.business_id AND bd.zone_id = business_zone_prices.zone_id
  )
);
