-- Imágenes predeterminadas: de ilustraciones (emojis de Noto) a fotos reales de uso libre (ADMIN-SUPER-27).
-- Las fotos son de Pexels, de uso comercial sin atribución, y viven en `landing/assets/defaults/`
-- (cada una con el mismo nombre que el emoji que reemplaza, con extensión `.jpg`; ver el README de esa
-- carpeta). Las migraciones 20261012 y 20261015 ya cargaron las filas con `.svg` y no se editan: acá se
-- cambia la extensión de las direcciones del propio sitio. Las imágenes que cargó el superadmin con otra
-- dirección (un archivo propio en el bucket `default-images`) no se tocan.
-- Se puede correr más de una vez: lo que ya terminó en `.jpg` no coincide.
UPDATE public.default_images
SET image_url = regexp_replace(image_url, '\.svg$', '.jpg')
WHERE image_url ~ '^https://www\.smaalacarta\.com\.ar/assets/defaults/[a-z0-9-]+\.svg$';
