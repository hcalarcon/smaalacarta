-- Nombre único en las imágenes predeterminadas (ADMIN-SUPER-25): el seed ampliado se apoya en el nombre
-- para sumar palabras clave a una entrada que ya existe en lugar de duplicarla (ON CONFLICT).
--
-- `20261012000000_imagenes_predeterminadas.sql` ya está en main y no se edita: acá se limpian los
-- duplicados que pudieran existir (en una base donde el superadmin cargó dos entradas con el mismo
-- nombre) y se agrega la clave única. De cada grupo de duplicados queda la más antigua, con las
-- palabras clave de todas.

-- 1. La más antigua de cada grupo recibe las palabras clave de las demás. El trigger las vuelve a
--    normalizar, sin repetidas.
WITH grupos AS (
  SELECT id,
         first_value(id) OVER w AS conservar,
         row_number() OVER w AS n
  FROM public.default_images
  WINDOW w AS (PARTITION BY lower(btrim(name)) ORDER BY created_at, id)
)
UPDATE public.default_images d
SET keywords = d.keywords || coalesce((
  SELECT array_agg(k)
  FROM public.default_images o
  JOIN grupos g ON g.id = o.id AND g.conservar = d.id AND g.n > 1
  CROSS JOIN LATERAL unnest(o.keywords) AS k
), ARRAY[]::text[])
WHERE d.id IN (SELECT conservar FROM grupos WHERE n > 1);

-- 2. Se borran las repetidas.
DELETE FROM public.default_images d
USING (
  SELECT id,
         row_number() OVER (PARTITION BY lower(btrim(name)) ORDER BY created_at, id) AS n
  FROM public.default_images
) x
WHERE d.id = x.id AND x.n > 1;

-- 3. La clave única. Sobre `lower(name)`: el trigger ya recorta los espacios de los bordes.
CREATE UNIQUE INDEX IF NOT EXISTS default_images_name_key
ON public.default_images (lower(name));
