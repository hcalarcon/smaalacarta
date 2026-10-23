-- Ajustes de la revisión del favorito del repartidor (ENVIO-230).
--
-- - `guard_favorite_courier`: guardar la configuración (INSERT ... ON CONFLICT sin favorito) no cuenta como cambiarlo.
-- - `business_delivery_pricing` trae `favorite_id`, el favorito guardado, para que el superadmin no confunda el
--   efectivo (que puede ser el repartidor por defecto) con uno elegido.

CREATE OR REPLACE FUNCTION public.guard_favorite_courier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Un INSERT sin favorito (p. ej. `save_business_settings` creando o actualizando la fila con ON CONFLICT) no lo cambia.
  IF current_setting('role', true) IN ('anon', 'authenticated')
     AND NOT public.is_super_admin()
     AND NOT (tg_op = 'INSERT' AND new.favorite_courier_id IS NULL)
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


-- Misma `business_delivery_pricing` de `20261124000000_tipo_de_precio_del_envio.sql`, con `favorite_id`.
CREATE OR REPLACE FUNCTION public.business_delivery_pricing(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_business record;
  v_favorite uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (select public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.business_users bu WHERE bu.user_id = v_uid AND bu.business_id = p_business_id
    )
  ) THEN
    RAISE EXCEPTION 'No tenés acceso a ese negocio' USING ERRCODE = '42501';
  END IF;

  SELECT b.delivery_pricing, b.delivery_prices_editable, b.delivery_offers_enabled
  INTO v_business
  FROM public.businesses b
  WHERE b.id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El negocio no existe' USING ERRCODE = 'P0002';
  END IF;

  v_favorite := public.effective_favorite_courier(p_business_id);

  RETURN jsonb_build_object(
    'pricing', v_business.delivery_pricing,
    'editable', v_business.delivery_prices_editable,
    'offers_enabled', v_business.delivery_offers_enabled,
    -- El favorito guardado (el efectivo, en `courier`, puede ser el repartidor por defecto).
    'favorite_id', (SELECT s.favorite_courier_id FROM public.business_settings s WHERE s.business_id = p_business_id),
    'courier', (
      SELECT jsonb_build_object(
               'id', c.id, 'name', c.name, 'active', c.active,
               'zones', (SELECT count(*) FROM public.courier_own_zones cz WHERE cz.courier_id = c.id)
             )
      FROM public.couriers c
      WHERE c.id = v_favorite
    ),
    'courier_zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('id', cz.id, 'name', cz.name, 'price', cz.price, 'active', cz.active)
               ORDER BY cz.sort_order, cz.name
             )
      FROM public.courier_own_zones cz
      WHERE cz.courier_id = v_favorite
    ), '[]'::jsonb),
    'zones', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', z.id, 'name', z.name, 'common_price', z.price, 'business_price', bp.price
               )
               ORDER BY z.sort_order, z.name
             )
      FROM public.business_delivery_zones bd
      JOIN public.delivery_zones z ON z.id = bd.zone_id AND z.active
      LEFT JOIN public.business_zone_prices bp ON bp.business_id = bd.business_id AND bp.zone_id = z.id
      WHERE bd.business_id = p_business_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_delivery_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_delivery_pricing(uuid) TO authenticated;
