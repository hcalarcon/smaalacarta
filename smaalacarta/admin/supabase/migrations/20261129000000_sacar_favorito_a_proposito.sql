-- Sacar el favorito de un negocio solo a propósito (ENVIO-233).
--
-- `superadmin_set_favorite_courier(negocio, null)` sacaba el favorito sin que nadie lo hubiera pedido (un null que
-- llegó de más) y, con un negocio sin configuración, creaba una fila vacía. Ahora:
-- - fijar a alguien: `(negocio, repartidor)`; crea la fila si hace falta y solo escribe el favorito;
-- - sacarlo: `(negocio, null, true)` ("Sin favorito"); solo actualiza una fila que ya existe y solo ese campo;
-- - `(negocio, null)` sin avisar, o `(negocio, repartidor, true)`, es un error (22023): no se hace nada.

DROP FUNCTION IF EXISTS public.superadmin_set_favorite_courier(uuid, uuid);

CREATE OR REPLACE FUNCTION public.superadmin_set_favorite_courier(
  p_business_id uuid,
  p_courier_id uuid,
  p_clear boolean DEFAULT false
)
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

  -- Sin repartidor hace falta pedir sacar; con repartidor, no se puede pedir sacar.
  IF (p_courier_id IS NULL) <> coalesce(p_clear, false) THEN
    RAISE EXCEPTION 'Para sacar el favorito hay que pedirlo (sin repartidor y con p_clear); para fijarlo, un repartidor sin p_clear'
      USING ERRCODE = '22023';
  END IF;

  IF p_courier_id IS NULL THEN
    -- "Sin favorito": solo una fila que ya existe, y solo ese campo.
    UPDATE public.business_settings
    SET favorite_courier_id = NULL
    WHERE business_id = p_business_id;
    RETURN;
  END IF;

  INSERT INTO public.business_settings (business_id, favorite_courier_id)
  VALUES (p_business_id, p_courier_id)
  ON CONFLICT (business_id) DO UPDATE
  SET favorite_courier_id = excluded.favorite_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_favorite_courier(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_set_favorite_courier(uuid, uuid, boolean) TO authenticated;
