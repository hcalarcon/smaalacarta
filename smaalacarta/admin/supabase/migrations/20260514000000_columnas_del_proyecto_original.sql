-- Columnas que el proyecto original tenía y ninguna migración creaba.
-- Tomadas de src/types/database.ts; los valores por defecto son los que la
-- app espera cuando no se envía nada.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS visible boolean DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products(category_id);
