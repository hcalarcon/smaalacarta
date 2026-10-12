-- Envío listo al activarlo (ENVIO-128 a 136).
--
-- Activar `courier_delivery` no alcanzaba: las zonas del local (`business_delivery_zones`) solo se
-- cargaron, en `20261021000000_varios_repartidores_zonas.sql`, para los negocios que ya tenían el
-- envío en ese momento. A uno que se activa después le quedaban cero zonas: el menú no ofrecía envío y
-- ningún repartidor veía sus pedidos hasta que el local tildara zonas a mano.
--
-- - Un trigger en `businesses` carga todas las zonas activas cuando el envío pasa a activo y el local
--   no tiene ninguna. Vale para cualquier camino (superadmin, SQL). Si ya tenía zonas, no las toca.
-- - Se corrigen los negocios que ya estaban activos y sin zonas.
-- - Repartos al Toque es el favorito por defecto: `default_courier_id()` es el único lugar donde vive
--   su id y `effective_favorite_courier(negocio)` devuelve el favorito elegido o, si no hay, ese
--   repartidor (siempre que esté activo). No se escribe en `favorite_courier_id`: si el local elige
--   otro después, vale el suyo.
-- - Lo usan el orden y la marca `favorito` de las ofertas (`public_order_delivery`,
--   `business_order_offers`) y el desempate de `settle_courier_offers` (`run_order_timers` la llama).
-- - `business_delivery_options` suma `default_courier` ({id, name} o nulo) para que Configuración diga
--   a quién se recomienda sin escribir el nombre a mano.

-- ---------------------------------------------------------------------------
-- El favorito por defecto
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.default_courier_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '7a0c0e00-0000-4000-8000-000000000001'::uuid;
$$;

REVOKE ALL ON FUNCTION public.default_courier_id() FROM PUBLIC, anon, authenticated;

-- El favorito elegido por el local; si no eligió, Repartos al Toque mientras esté activo. Un negocio
-- sin fila en `business_settings` también cae en el repartidor por defecto.
CREATE OR REPLACE FUNCTION public.effective_favorite_courier(p_business uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = p_business),
    (SELECT c.id FROM public.couriers c WHERE c.id = public.default_courier_id() AND c.active)
  );
$$;

REVOKE ALL ON FUNCTION public.effective_favorite_courier(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Zonas al activar el envío
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.load_zones_on_courier_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.courier_delivery
     AND (tg_op = 'INSERT' OR old.courier_delivery IS DISTINCT FROM true)
     AND NOT EXISTS (SELECT 1 FROM public.business_delivery_zones bz WHERE bz.business_id = new.id) THEN
    INSERT INTO public.business_delivery_zones (business_id, zone_id)
    SELECT new.id, z.id
    FROM public.delivery_zones z
    WHERE z.active
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.load_zones_on_courier_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_load_delivery_zones ON public.businesses;
CREATE TRIGGER businesses_load_delivery_zones
  AFTER INSERT OR UPDATE OF courier_delivery ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.load_zones_on_courier_delivery();

-- Los que ya estaban con el envío activo y sin ninguna zona.
INSERT INTO public.business_delivery_zones (business_id, zone_id)
SELECT b.id, z.id
FROM public.businesses b
CROSS JOIN public.delivery_zones z
WHERE b.courier_delivery
  AND z.active
  AND NOT EXISTS (SELECT 1 FROM public.business_delivery_zones bz WHERE bz.business_id = b.id)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Quien lee el favorito usa el efectivo
-- ---------------------------------------------------------------------------

-- Misma `settle_courier_offers` de `20261023000000_ofertas_de_repartidor.sql`: el desempate a igual
-- precio usa `effective_favorite_courier`.
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

-- Misma `public_order_delivery` de `20261023000000_ofertas_de_repartidor.sql`: la marca y el orden de
-- `favorito` usan `effective_favorite_courier`.
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
         o.business_id, o.status
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code
    AND o.courier_status IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_order.courier_status = 'searching' AND v_order.status NOT IN ('delivered', 'cancelled') THEN
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
    'nota', v_order.courier_note,
    'ofertas', v_offers,
    'cierra_en', v_deadline
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;

-- Misma `business_order_offers` de `20261023000000_ofertas_de_repartidor.sql`: la marca y el orden de
-- `favorito` usan `effective_favorite_courier`.
CREATE OR REPLACE FUNCTION public.business_order_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  PERFORM public.settle_due_courier_offers();

  RETURN coalesce((
    SELECT jsonb_agg(
             jsonb_build_object(
               'order_id', o.id,
               'cierra_en', public.courier_offers_deadline(o.id),
               'ofertas', (
                 SELECT coalesce(jsonb_agg(
                          jsonb_build_object(
                            'id', f.id,
                            'courier_id', f.courier_id,
                            'repartidor', c.name,
                            'precio', f.price,
                            'motivo', f.reason,
                            'favorito', (f.courier_id IS NOT DISTINCT FROM public.effective_favorite_courier(o.business_id))
                          )
                          ORDER BY (f.courier_id IS NOT DISTINCT FROM public.effective_favorite_courier(o.business_id)) DESC,
                                   f.price ASC, f.created_at ASC, f.id ASC
                        ), '[]'::jsonb)
                 FROM public.courier_offers f
                 JOIN public.couriers c ON c.id = f.courier_id
                 WHERE f.order_id = o.id AND f.closed_at IS NULL
               )
             )
           )
    FROM public.orders o
    WHERE o.courier_status = 'searching'
      AND o.courier_id IS NULL
      AND o.status NOT IN ('delivered', 'cancelled')
      AND EXISTS (
        SELECT 1 FROM public.business_users bu
        WHERE bu.user_id = v_uid AND bu.business_id = o.business_id
      )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.business_order_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_order_offers() TO authenticated;

-- Misma `business_delivery_options` de `20261023000000_ofertas_de_repartidor.sql`, con `default_courier`.
CREATE OR REPLACE FUNCTION public.business_delivery_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
BEGIN
  IF v_business IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', z.id,
                 'name', z.name,
                 'price', z.price,
                 'selected', EXISTS (
                   SELECT 1 FROM public.business_delivery_zones bz
                   WHERE bz.business_id = v_business AND bz.zone_id = z.id
                 ),
                 'covered', EXISTS (
                   SELECT 1
                   FROM public.courier_zone_coverage cc
                   JOIN public.couriers c ON c.id = cc.courier_id AND c.active
                   WHERE cc.zone_id = z.id
                 )
               )
               ORDER BY z.sort_order, z.name
             )
      FROM public.delivery_zones z
      WHERE z.active
    ), '[]'::jsonb),
    'couriers', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', c.id,
                 'name', c.name,
                 'whatsapp', c.whatsapp,
                 'zone_ids', (
                   SELECT coalesce(jsonb_agg(cc.zone_id), '[]'::jsonb)
                   FROM public.courier_zone_coverage cc
                   JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
                   WHERE cc.courier_id = c.id
                 )
               )
               ORDER BY c.name, c.id
             )
      FROM public.couriers c
      WHERE c.active
        AND EXISTS (
          SELECT 1 FROM public.courier_zone_coverage cc
          JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
          WHERE cc.courier_id = c.id
        )
    ), '[]'::jsonb),
    'favorite_id', (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_business),
    'default_courier', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name)
      FROM public.couriers c
      WHERE c.id = public.default_courier_id() AND c.active
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_options() TO authenticated;
