-- Favorito y asignación a mano con zonas propias del repartidor (ENVIO-229 a 232).
--
-- Con el tipo de precio `courier` (`businesses.delivery_pricing`), el favorito es quien pone las zonas y los precios:
-- no hace falta que cubra una zona común.
--
-- - `assert_valid_favorite_courier`: con tipo `courier` basta que el repartidor esté activo y tenga al menos una zona
--   propia activa. Con los otros tipos, la regla de siempre.
-- - `guard_favorite_courier`: con tipo `courier` el local no cambia su favorito (lo fija el superadmin).
-- - `superadmin_set_favorite_courier()`: el superadmin fija (o saca) el favorito de cualquier negocio.
-- - `business_delivery_options`: cada repartidor trae `own_zone_ids` (sus zonas propias activas) y también aparece el que
--   solo tiene zonas propias, para que el tablero pueda asignarle un pedido con zona propia.

-- Misma `assert_valid_favorite_courier` de `20261021000000_varios_repartidores_zonas.sql`, con el caso `courier`.
CREATE OR REPLACE FUNCTION public.assert_valid_favorite_courier(p_business_id uuid, p_courier_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pricing text;
BEGIN
  IF p_courier_id IS NULL THEN
    RETURN;
  END IF;

  SELECT b.delivery_pricing INTO v_pricing FROM public.businesses b WHERE b.id = p_business_id;

  IF v_pricing = 'courier' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.couriers c
      JOIN public.courier_own_zones cz ON cz.courier_id = c.id AND cz.active
      WHERE c.id = p_courier_id AND c.active
    ) THEN
      RAISE EXCEPTION 'El repartidor favorito tiene que estar activo y tener al menos una zona propia activa'
        USING ERRCODE = 'P0017';
    END IF;

    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.couriers c
    JOIN public.courier_zone_coverage cc ON cc.courier_id = c.id
    JOIN public.business_delivery_zones bz ON bz.zone_id = cc.zone_id AND bz.business_id = p_business_id
    JOIN public.delivery_zones z ON z.id = bz.zone_id AND z.active
    WHERE c.id = p_courier_id AND c.active
  ) THEN
    RAISE EXCEPTION 'El repartidor favorito tiene que estar activo y cubrir alguna de tus zonas'
      USING ERRCODE = 'P0017';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_valid_favorite_courier(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Misma `assert_my_favorite_courier` de `20261021000000_varios_repartidores_zonas.sql`: es la entrada del local
-- (`set_courier_preferences`), así que con tipo `courier` el error de "no podés cambiarlo" (P0030) sale antes que el de
-- la regla del favorito.
CREATE OR REPLACE FUNCTION public.assert_my_favorite_courier(p_courier_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business uuid := public.my_courier_business_id();
BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business AND b.delivery_pricing = 'courier')
     AND p_courier_id IS DISTINCT FROM (
       SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_business
     )
  THEN
    RAISE EXCEPTION 'Con precio del repartidor, el favorito lo fija el equipo de SMA a la Carta'
      USING ERRCODE = 'P0030';
  END IF;

  PERFORM public.assert_valid_favorite_courier(v_business, p_courier_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_my_favorite_courier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_my_favorite_courier(uuid) TO authenticated;

-- Misma `guard_favorite_courier` de `20261021000000_varios_repartidores_zonas.sql`: con tipo `courier` solo el
-- superadmin cambia el favorito (P0030).
CREATE OR REPLACE FUNCTION public.guard_favorite_courier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated')
     AND NOT public.is_super_admin()
     -- En un INSERT ... ON CONFLICT la fila ya existe: se compara con la guardada.
     AND new.favorite_courier_id IS DISTINCT FROM (
       SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = new.business_id
     )
     AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = new.business_id AND b.delivery_pricing = 'courier')
  THEN
    RAISE EXCEPTION 'Con precio del repartidor, el favorito lo fija el equipo de SMA a la Carta'
      USING ERRCODE = 'P0030';
  END IF;

  IF new.favorite_courier_id IS NOT NULL
     AND (tg_op = 'INSERT' OR new.favorite_courier_id IS DISTINCT FROM old.favorite_courier_id) THEN
    PERFORM public.assert_valid_favorite_courier(new.business_id, new.favorite_courier_id);
  END IF;

  RETURN new;
END;
$$;

-- El superadmin fija o saca el favorito de un negocio (ENVIO-229). Crea la fila de configuración si no la tiene.
CREATE OR REPLACE FUNCTION public.superadmin_set_favorite_courier(p_business_id uuid, p_courier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (select public.is_super_admin()) THEN
    RAISE EXCEPTION 'Solo el superadmin puede hacer esto' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id) THEN
    RAISE EXCEPTION 'El negocio no existe' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.business_settings (business_id, favorite_courier_id)
  VALUES (p_business_id, p_courier_id)
  ON CONFLICT (business_id) DO UPDATE
  SET favorite_courier_id = excluded.favorite_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_favorite_courier(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_set_favorite_courier(uuid, uuid) TO authenticated;

-- Misma `business_delivery_options` de `20261116000000_ajustes_de_terminos.sql`, con `own_zone_ids` y con los
-- repartidores que solo tienen zonas propias.
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
                 ),
                 'own_zone_ids', (
                   SELECT coalesce(jsonb_agg(cz.id), '[]'::jsonb)
                   FROM public.courier_own_zones cz
                   WHERE cz.courier_id = c.id AND cz.active
                 )
               ) || CASE
                 WHEN public.courier_vehicles(c.id) IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('vehiculo', public.courier_vehicles(c.id))
               END
               ORDER BY c.name, c.id
             )
      FROM public.couriers c
      WHERE c.active
        AND public.courier_terms_accepted(c.id)
        AND (
          EXISTS (
            SELECT 1 FROM public.courier_zone_coverage cc
            JOIN public.delivery_zones z ON z.id = cc.zone_id AND z.active
            WHERE cc.courier_id = c.id
          )
          OR EXISTS (SELECT 1 FROM public.courier_own_zones cz WHERE cz.courier_id = c.id AND cz.active)
        )
    ), '[]'::jsonb),
    'favorite_id', (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = v_business),
    -- Con precio del repartidor el local no cambia su favorito (ENVIO-230).
    'favorite_locked', coalesce((SELECT b.delivery_pricing = 'courier' FROM public.businesses b WHERE b.id = v_business), false),
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
