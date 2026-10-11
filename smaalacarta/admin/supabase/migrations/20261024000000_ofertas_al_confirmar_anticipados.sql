-- Ofertas al confirmar para los pedidos anticipados y programados (ENVIO-121 a 125).
--
-- Un pedido para más tarde (`preorder = true` o `scheduled_for` no nulo) con envío ya no se ofrece a los
-- repartidores al crearse: nace `waiting` y pasa a `searching` (con `offered_at = now()`) cuando el local lo
-- saca de pendiente sin cancelarlo. Así ningún repartidor queda comprometido horas antes con un pedido que
-- el local todavía no aceptó. Los pedidos comunes siguen abriendo la búsqueda al crearse.
--
-- Mientras está `waiting`, `courier_sees_order` (que exige `searching`) no lo entrega a nadie: ni
-- `courier_available_orders` lo lista ni `courier_make_offer` lo acepta (P0020). No hace falta tocarlas.

-- Misma envoltura de 11 parámetros de `20261023000000_ofertas_de_repartidor.sql`. Cambia una cosa: el
-- pedido anticipado o programado nace `waiting`, sin `offered_at`.
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_slug text,
  p_customer_name text,
  p_delivery text,
  p_payment text,
  p_notes text,
  p_items jsonb,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_preorder boolean DEFAULT false,
  p_delivery_zone uuid DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery text := NULLIF(btrim(coalesce(p_delivery, '')), '');
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_address text := btrim(coalesce(p_delivery_address, ''));
  v_business_found boolean;
  v_business_id uuid;
  v_courier_delivery boolean;
  v_with_courier boolean;
  v_zone_id uuid;
  v_zone_name text;
  v_price numeric;
  v_result jsonb;
BEGIN
  SELECT b.id, b.courier_delivery INTO v_business_id, v_courier_delivery
  FROM public.businesses b
  WHERE b.slug = p_slug;
  v_business_found := FOUND;

  -- Si el negocio no existe, lo dice la función base (P0002).
  v_with_courier := v_business_found AND v_courier_delivery AND v_delivery = 'delivery';

  IF v_business_found AND p_delivery_zone IS NOT NULL AND NOT v_with_courier THEN
    RAISE EXCEPTION 'El negocio no tiene envío con repartidor para esa entrega' USING ERRCODE = 'P0016';
  END IF;

  IF v_with_courier THEN
    IF p_delivery_zone IS NULL THEN
      RAISE EXCEPTION 'Elegí el barrio del envío' USING ERRCODE = 'P0016';
    END IF;

    SELECT z.id, z.name, z.price
    INTO v_zone_id, v_zone_name, v_price
    FROM public.delivery_zones z
    WHERE z.id = p_delivery_zone
      AND z.active
      AND EXISTS (
        SELECT 1 FROM public.business_delivery_zones bz
        WHERE bz.business_id = v_business_id AND bz.zone_id = z.id
      )
      AND EXISTS (
        SELECT 1
        FROM public.courier_zone_coverage cc
        JOIN public.couriers c ON c.id = cc.courier_id AND c.active
        WHERE cc.zone_id = z.id
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El barrio no existe o no está disponible' USING ERRCODE = 'P0016';
    END IF;
  END IF;

  IF v_business_found AND char_length(v_phone) NOT BETWEEN 8 AND 15 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio (de 8 a 15 dígitos)' USING ERRCODE = 'P0018';
  END IF;

  IF v_with_courier AND char_length(v_address) NOT BETWEEN 5 AND 200 THEN
    RAISE EXCEPTION 'La dirección es obligatoria (de 5 a 200 caracteres)' USING ERRCODE = '22023';
  END IF;

  v_result := public.create_public_order_base(
    p_slug, p_customer_name, p_delivery, p_payment, p_notes, p_items, p_scheduled_for, p_preorder
  );

  IF v_with_courier THEN
    UPDATE public.orders
    SET courier_id = NULL,
        delivery_zone_id = v_zone_id,
        delivery_zone_name = v_zone_name,
        delivery_fee_list = v_price,
        delivery_fee = v_price,
        customer_phone = v_phone,
        delivery_address = v_address,
        courier_status = CASE WHEN preorder OR scheduled_for IS NOT NULL THEN 'waiting' ELSE 'searching' END,
        offered_at = CASE WHEN preorder OR scheduled_for IS NOT NULL THEN NULL ELSE now() END
    WHERE code = v_result ->> 'code';

    v_result := v_result || jsonb_build_object('delivery_fee', v_price);
  ELSE
    UPDATE public.orders
    SET customer_phone = v_phone
    WHERE code = v_result ->> 'code';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(
  text, text, text, text, text, jsonb, timestamptz, boolean, uuid, text, text
) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- Al confirmar, se abre la búsqueda
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: la guarda de `orders` no deja que el local mueva `courier_status` desde la app, pero
-- esto no lo decide el local: lo decide la regla.
CREATE OR REPLACE FUNCTION public.open_courier_search_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.orders
  SET courier_status = 'searching',
      offered_at = now()
  WHERE id = new.id
    AND courier_status = 'waiting'
    AND courier_id IS NULL
    AND delivery_zone_id IS NOT NULL;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.open_courier_search_on_confirm() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_open_courier_search_on_confirm ON public.orders;
CREATE TRIGGER orders_open_courier_search_on_confirm
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (old.status = 'pending' AND new.status NOT IN ('pending', 'cancelled'))
  EXECUTE FUNCTION public.open_courier_search_on_confirm();

-- Los anticipados y programados que hoy buscan, siguen pendientes y no tienen ninguna oferta, vuelven a
-- esperar la confirmación del local.
UPDATE public.orders o
SET courier_status = 'waiting',
    offered_at = NULL
WHERE o.courier_status = 'searching'
  AND o.courier_id IS NULL
  AND o.status = 'pending'
  AND (o.preorder OR o.scheduled_for IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.courier_offers f WHERE f.order_id = o.id);
