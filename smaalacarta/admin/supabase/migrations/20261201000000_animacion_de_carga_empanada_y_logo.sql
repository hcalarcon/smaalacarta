-- Animación de carga: "Empanada" y "Usar imagen de logo" (PUBLICO-118 y 119).
--
-- - Se suman `empanada` y `logo` a las opciones de `business_settings.loader_animation`.
-- - `logo` muestra el logo del negocio (`config.logo`) con un pulso suave; sin logo, el de SMA a la Carta.
-- - Pasa a ser el valor por defecto: solo lo toman las filas que se crean de ahora en más. **No se toca ninguna fila
--   existente**: los negocios que ya tienen una elegida (o quedaron con la de siempre) se ven igual.
-- - `build_public_menu` no cambia: ya entrega `animacionCarga` tal cual está guardada.
-- - `save_menu_look` es la de 20261120000000, más las dos opciones nuevas en la lista.

ALTER TABLE public.business_settings ALTER COLUMN loader_animation SET DEFAULT 'logo';

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_loader_animation_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_loader_animation_check
  CHECK (
    loader_animation IN (
      'hamburguesa', 'pizza', 'cafe', 'helado', 'parrilla', 'sushi', 'pastas', 'panificados', 'empanada', 'logo', 'custom'
    )
  );

CREATE OR REPLACE FUNCTION public.save_menu_look(
  p_business_id uuid,
  p_menu_animation text,
  p_loader_animation text,
  p_loader_custom_url text,
  p_background_image_url text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loader_url text := NULLIF(btrim(coalesce(p_loader_custom_url, '')), '');
  v_background text := NULLIF(btrim(coalesce(p_background_image_url, '')), '');
BEGIN
  IF p_menu_animation IS NULL OR p_menu_animation NOT IN ('estandar', 'suave', 'dinamica', 'ninguna') THEN
    RAISE EXCEPTION 'La animación del menú no es válida' USING ERRCODE = '22023';
  END IF;

  IF p_loader_animation IS NULL OR p_loader_animation NOT IN (
    'hamburguesa', 'pizza', 'cafe', 'helado', 'parrilla', 'sushi', 'pastas', 'panificados', 'empanada', 'logo', 'custom'
  ) THEN
    RAISE EXCEPTION 'La animación de carga no es válida' USING ERRCODE = '22023';
  END IF;

  IF p_loader_animation = 'custom' AND v_loader_url IS NULL THEN
    RAISE EXCEPTION 'Subí el archivo de tu animación de carga' USING ERRCODE = '22023';
  END IF;

  IF v_loader_url IS NOT NULL AND v_loader_url !~ (
    '^https://[^[:space:]"''()<>]+/business-animations/' || p_business_id::text || '/[A-Za-z0-9-]+\.(gif|webp|png)$'
  ) THEN
    RAISE EXCEPTION 'La animación tiene que estar en la carpeta de tu negocio' USING ERRCODE = '22023';
  END IF;

  IF v_background IS NOT NULL AND v_background !~ (
    '^https://[^[:space:]"''()<>]+/business-images/' || p_business_id::text || '/[A-Za-z0-9-]+\.(jpg|png|webp)$'
  ) THEN
    RAISE EXCEPTION 'La imagen de fondo tiene que estar en la carpeta de tu negocio' USING ERRCODE = '22023';
  END IF;

  UPDATE public.business_settings
  SET menu_animation = p_menu_animation,
      loader_animation = p_loader_animation,
      -- Si dejó de usar la propia, no queda el archivo guardado de más.
      loader_custom_url = CASE WHEN p_loader_animation = 'custom' THEN v_loader_url END,
      background_image_url = v_background,
      updated_at = now()
  WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El negocio no existe o todavía no tiene configuración' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_menu_look(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_menu_look(uuid, text, text, text, text) TO authenticated;
