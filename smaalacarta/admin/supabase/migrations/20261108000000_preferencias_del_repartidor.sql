-- Preferencias del repartidor (SEGUIMIENTO-47 y ADMIN-REPARTIDOR-1): "Compro cosas en el camino", "Busco otros
-- pedidos" y un texto corto. Las edita solo el propio repartidor, con `courier_save_preferences`; el seguimiento
-- las lee únicamente del repartidor asignado a ese pedido, por `public_order_delivery`.

CREATE TABLE IF NOT EXISTS public.courier_preferences (
  courier_id uuid PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  shops_on_the_way boolean NOT NULL DEFAULT false,
  seeks_orders boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR (char_length(note) BETWEEN 1 AND 140 AND note = btrim(note))),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courier_preferences ENABLE ROW LEVEL SECURITY;

-- Cada repartidor lee las suyas. Sin políticas de escritura: se guardan por la función de abajo.
DROP POLICY IF EXISTS courier_preferences_select_own ON public.courier_preferences;
CREATE POLICY courier_preferences_select_own
ON public.courier_preferences
FOR SELECT
TO authenticated
USING (courier_id = (select public.my_courier_id()));

CREATE OR REPLACE FUNCTION public.courier_save_preferences(
  p_shops_on_the_way boolean,
  p_seeks_orders boolean,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier uuid := public.my_courier_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF v_courier IS NULL THEN
    RAISE EXCEPTION 'No sos repartidor' USING ERRCODE = '42501';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 140 THEN
    RAISE EXCEPTION 'El texto puede tener hasta 140 caracteres' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.courier_preferences (courier_id, shops_on_the_way, seeks_orders, note, updated_at)
  VALUES (v_courier, coalesce(p_shops_on_the_way, false), coalesce(p_seeks_orders, false), v_note, now())
  ON CONFLICT (courier_id) DO UPDATE
  SET shops_on_the_way = excluded.shops_on_the_way,
      seeks_orders = excluded.seeks_orders,
      note = excluded.note,
      updated_at = excluded.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.courier_save_preferences(boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_save_preferences(boolean, boolean, text) TO authenticated;

-- Misma `public_order_delivery` de `20261105000000_circuito_de_tiempos.sql`, más `preferencias`.
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
  v_prefs jsonb;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  PERFORM public.settle_courier_offers(o.id) FROM public.orders o WHERE o.code = p_code;

  SELECT o.id, c.name AS courier_name, c.whatsapp AS courier_whatsapp, o.delivery_zone_name,
         o.delivery_fee_list, o.delivery_fee, o.delivery_fee_reason, o.courier_status, o.courier_note,
         o.business_id, o.status, o.delivery_mode, o.courier_eta_dropoff_at, o.courier_id
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  WHERE o.code = p_code
    AND o.courier_status IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_order.courier_status = 'searching'
     AND v_order.status NOT IN ('delivered', 'cancelled')
     AND v_order.delivery_mode IS DISTINCT FROM 'fixed' THEN
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

  -- Lo que el repartidor dejó dicho (SEGUIMIENTO-47): solo del que tiene asignado este pedido, nunca mientras
  -- se busca, y solo si marcó algo o escribió algo.
  IF v_order.courier_id IS NOT NULL AND v_order.courier_status NOT IN ('waiting', 'searching') THEN
    SELECT jsonb_build_object(
             'compras_en_camino', p.shops_on_the_way,
             'busca_pedidos', p.seeks_orders,
             'texto', p.note
           )
    INTO v_prefs
    FROM public.courier_preferences p
    WHERE p.courier_id = v_order.courier_id
      AND (p.shops_on_the_way OR p.seeks_orders OR p.note IS NOT NULL);
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'repartidor', v_order.courier_name,
    'whatsapp', v_order.courier_whatsapp,
    'zona', v_order.delivery_zone_name,
    'precio_lista', v_order.delivery_fee_list,
    'precio', v_order.delivery_fee,
    'motivo_cambio', v_order.delivery_fee_reason,
    'estado', v_order.courier_status,
    'modo', v_order.delivery_mode,
    'nota', v_order.courier_note,
    'llega_a', CASE WHEN v_order.status IN ('handed_to_courier', 'on_the_way') THEN v_order.courier_eta_dropoff_at END,
    'preferencias', v_prefs,
    'ofertas', v_offers,
    'cierra_en', v_deadline
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_delivery(text) TO anon, authenticated;
