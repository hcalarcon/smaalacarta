-- Tutorial interactivo del repartidor (ENVIO-212 a 218).
--
-- - `couriers.tutorial_seen_at`: cuándo vio (terminó o salteó) el tutorial. Nulo = todavía no. Vive en la base y no
--   en el navegador para que no le vuelva a salir si cambia de celular.
-- - El repartidor no tiene política de UPDATE sobre `couriers` y no se le agrega: la columna la escribe solo
--   `courier_mark_tutorial_seen()`, que toma al repartidor de `my_courier_id()` (nunca de un parámetro). Pone la
--   hora la primera vez y no la pisa después.
-- - `courier_tutorial_status()`: si ya lo vio, el modo de envíos de la plataforma (`fixed` u `offers`) y el precio
--   de lista de una zona real, que el pedido de práctica usa para mostrar un monto verosímil. El modo lo lee con
--   SECURITY DEFINER porque `platform_settings` es solo del superadmin; el precio es el de la zona activa más barata
--   que cubre (o, si no cubre ninguna, la más barata de la plataforma).

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS tutorial_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.courier_tutorial_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_seen timestamptz;
  v_price numeric;
BEGIN
  IF (select auth.uid()) IS NULL OR v_courier IS NULL THEN
    RAISE EXCEPTION 'Solo el repartidor puede hacer esto' USING ERRCODE = '42501';
  END IF;

  SELECT c.tutorial_seen_at INTO v_seen FROM public.couriers c WHERE c.id = v_courier;

  SELECT min(z.price) INTO v_price
  FROM public.delivery_zones z
  JOIN public.courier_zone_coverage cz ON cz.zone_id = z.id AND cz.courier_id = v_courier
  WHERE z.active;

  IF v_price IS NULL THEN
    SELECT min(z.price) INTO v_price FROM public.delivery_zones z WHERE z.active;
  END IF;

  RETURN jsonb_build_object(
    'seen', v_seen IS NOT NULL,
    'mode', coalesce((SELECT s.delivery_mode FROM public.platform_settings s WHERE s.id), 'fixed'),
    'zone_price', v_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_tutorial_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_tutorial_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.courier_mark_tutorial_seen()
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

  UPDATE public.couriers
  SET tutorial_seen_at = coalesce(tutorial_seen_at, now())
  WHERE id = v_courier;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_mark_tutorial_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_mark_tutorial_seen() TO authenticated;
