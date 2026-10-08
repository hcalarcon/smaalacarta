-- Imágenes predeterminadas por producto (ADMIN-CONFIG-31 y 32, ADMIN-SUPER-17 a 24, PUBLICO-51 a 57, ESTATICO-11):
-- un producto sin imagen propia muestra una ilustración elegida por coincidencia con su nombre (o el
-- de su categoría), que se resuelve en `public_menu` sin escribir nada en `products`. La imagen propia
-- siempre gana. Si no hay coincidencia, o el negocio apagó el interruptor, el menú muestra su logo
-- (eso lo resuelve `web/`).
--
-- - `business_settings.show_default_images`: interruptor por negocio (por defecto, prendido).
-- - `normalize_words`: minúsculas, sin tildes, solo letras y números, singularizada.
-- - `default_images`: las ilustraciones, administradas por el superadmin. Las palabras clave se
--   normalizan solas al guardar (trigger). RLS: lee cualquiera (las activas), escribe el superadmin.
-- - Bucket `default-images`: lectura pública, escritura solo del superadmin.
-- - `suggest_default_image(nombre, categoría)`: la entrada que mejor coincide. Una sola fuente de verdad:
--   la usan `public_menu`, el probador del superadmin y el panel del negocio.
-- - `default_images_unmatched()`: reporte para el superadmin de los productos que no obtienen imagen.
-- - `save_business_settings` (parámetro nuevo, con valor por defecto para no romper al panel viejo
--   mientras se despliega) y `public_menu`: partieron de `20261011000000_posicion_imagen_cabecera.sql`,
--   que es la última migración que los redefine.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS show_default_images boolean NOT NULL DEFAULT true;

-- Palabras de un texto para comparar nombres: minúsculas, sin tildes ni eñes (translate manual, sin
-- la extensión unaccent), solo letras y números, y singularizadas de forma simple: en las palabras de
-- más de 4 letras se quita la "s" final ("hamburguesas" -> "hamburguesa") y la "es" si termina en
-- "nes" o "ches" ("panes" -> "pan", "sandwiches" -> "sandwich"). El resto se deja como está.
CREATE OR REPLACE FUNCTION public.normalize_words(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(s.w ORDER BY s.ord), ARRAY[]::text[])
  FROM (
    SELECT t.ord,
           CASE
             WHEN length(t.word) > 4 AND t.word ~ '(nes|ches)$' THEN left(t.word, length(t.word) - 2)
             WHEN length(t.word) > 4 AND t.word ~ 's$' THEN left(t.word, length(t.word) - 1)
             ELSE t.word
           END AS w
    FROM regexp_split_to_table(
           regexp_replace(
             translate(lower(coalesce(p_text, '')), 'áéíóúüñàèìòùâêîôû', 'aeiouunaeiouaeiou'),
             '[^a-z0-9]+', ' ', 'g'
           ),
           ' '
         ) WITH ORDINALITY AS t(word, ord)
    WHERE t.word <> ''
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_words(text) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.default_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  -- Frases ya normalizadas ("milanesa napolitana"): se coincide cuando TODAS sus palabras están en el nombre.
  keywords text[] NOT NULL DEFAULT '{}',
  image_url text NOT NULL CHECK (image_url ~ '^https://[^[:space:]"''()<>]+$'),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN -100 AND 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normaliza las palabras clave al guardar: cada una pasa por `normalize_words`, se descartan las
-- vacías y las repetidas, y quedan ordenadas.
CREATE OR REPLACE FUNCTION public.default_images_normalize_keywords()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.keywords := coalesce((
    SELECT array_agg(DISTINCT k.phrase ORDER BY k.phrase)
    FROM (
      SELECT array_to_string(public.normalize_words(raw), ' ') AS phrase
      FROM unnest(NEW.keywords) AS raw
    ) k
    WHERE k.phrase <> ''
  ), ARRAY[]::text[]);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS default_images_normalize ON public.default_images;
CREATE TRIGGER default_images_normalize
BEFORE INSERT OR UPDATE ON public.default_images
FOR EACH ROW EXECUTE FUNCTION public.default_images_normalize_keywords();

ALTER TABLE public.default_images ENABLE ROW LEVEL SECURITY;

-- Cualquiera lee las activas (las usa el menú público); el superadmin ve y escribe todas.
DROP POLICY IF EXISTS default_images_select_active ON public.default_images;
CREATE POLICY default_images_select_active
ON public.default_images
FOR SELECT
TO anon, authenticated
USING (active);

DROP POLICY IF EXISTS default_images_select_super_admin ON public.default_images;
CREATE POLICY default_images_select_super_admin
ON public.default_images
FOR SELECT
TO authenticated
USING ((select public.is_super_admin()));

DROP POLICY IF EXISTS default_images_insert_super_admin ON public.default_images;
CREATE POLICY default_images_insert_super_admin
ON public.default_images
FOR INSERT
TO authenticated
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS default_images_update_super_admin ON public.default_images;
CREATE POLICY default_images_update_super_admin
ON public.default_images
FOR UPDATE
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS default_images_delete_super_admin ON public.default_images;
CREATE POLICY default_images_delete_super_admin
ON public.default_images
FOR DELETE
TO authenticated
USING ((select public.is_super_admin()));

-- Bucket de las ilustraciones: lectura pública (las direcciones se abren sin sesión), escritura
-- solo del superadmin. WebP, PNG, JPG y SVG, hasta 1 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'default-images',
  'default-images',
  true,
  1048576,
  ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS default_images_bucket_select ON storage.objects;
CREATE POLICY default_images_bucket_select
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'default-images');

DROP POLICY IF EXISTS default_images_bucket_insert ON storage.objects;
CREATE POLICY default_images_bucket_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'default-images'
  AND name !~ '\.\.'
  AND (select public.is_super_admin())
);

DROP POLICY IF EXISTS default_images_bucket_update ON storage.objects;
CREATE POLICY default_images_bucket_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'default-images' AND (select public.is_super_admin()))
WITH CHECK (bucket_id = 'default-images' AND name !~ '\.\.' AND (select public.is_super_admin()));

DROP POLICY IF EXISTS default_images_bucket_delete ON storage.objects;
CREATE POLICY default_images_bucket_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'default-images' AND (select public.is_super_admin()));

-- La entrada que mejor coincide con un producto. Una entrada coincide si TODAS las palabras de alguna
-- de sus palabras clave están entre las del nombre; puntaje = palabras de esa clave (la más específica
-- gana) + prioridad. Si ninguna coincide con el nombre, se prueba con el nombre de la categoría, que
-- siempre queda por debajo de cualquier coincidencia por nombre. Desempate estable: prioridad, nombre, id.
-- Sin coincidencia no devuelve filas.
CREATE OR REPLACE FUNCTION public.suggest_default_image(p_name text, p_category text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, image_url text, keyword text, by_category boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH w AS (
    SELECT public.normalize_words(p_name) AS name_words,
           public.normalize_words(p_category) AS category_words
  ),
  cand AS (
    SELECT d.id, d.name, d.image_url, d.priority, k.keyword,
           cardinality(string_to_array(k.keyword, ' ')) AS n,
           string_to_array(k.keyword, ' ') <@ w.name_words AS in_name,
           string_to_array(k.keyword, ' ') <@ w.category_words AS in_category
    FROM public.default_images d
    CROSS JOIN w
    CROSS JOIN LATERAL unnest(d.keywords) AS k(keyword)
    WHERE d.active AND k.keyword <> ''
  )
  SELECT c.id, c.name, c.image_url, c.keyword, NOT c.in_name AS by_category
  FROM cand c
  WHERE c.in_name OR c.in_category
  ORDER BY c.in_name DESC, c.n + c.priority DESC, c.priority DESC, c.name, c.id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_default_image(text, text) TO anon, authenticated;

-- `save_business_settings` gana un parámetro: se reemplaza la versión anterior.
DROP FUNCTION IF EXISTS public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer
);


CREATE OR REPLACE FUNCTION public.save_business_settings(
  p_business_id uuid,
  p_published boolean,
  p_template text,
  p_tagline text,
  p_primary_color text,
  p_secondary_color text,
  p_header_image_url text,
  p_schedule jsonb,
  p_whatsapp text,
  p_address text,
  p_instagram_url text,
  p_facebook_url text,
  p_temporarily_closed boolean,
  p_closed_message text,
  p_reopens_on date,
  p_logo_url text,
  p_menu_pdf_url text,
  p_theme text,
  p_delivery_options text[],
  p_payment_options text[],
  p_transfer_alias text,
  p_transfer_cbu text,
  p_allow_scheduled_orders boolean,
  p_scheduled_lead_minutes integer,
  p_preorders_enabled boolean,
  p_preorder_cutoffs jsonb,
  p_header_image_x integer,
  p_header_image_y integer,
  p_show_default_images boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_settings
    (business_id, published, template, tagline, primary_color, secondary_color,
     header_image_url, schedule, address, instagram_url, facebook_url,
     temporarily_closed, closed_message, reopens_on, logo_url, menu_pdf_url, theme,
     delivery_options, payment_options, transfer_alias, transfer_cbu,
     allow_scheduled_orders, scheduled_lead_minutes, preorders_enabled, preorder_cutoffs,
     header_image_x, header_image_y, show_default_images)
  VALUES
    (p_business_id, p_published, p_template, NULLIF(p_tagline, ''), p_primary_color,
     p_secondary_color, NULLIF(p_header_image_url, ''), p_schedule,
     NULLIF(p_address, ''), NULLIF(p_instagram_url, ''), NULLIF(p_facebook_url, ''),
     p_temporarily_closed, NULLIF(p_closed_message, ''), p_reopens_on,
     NULLIF(p_logo_url, ''), NULLIF(p_menu_pdf_url, ''), p_theme,
     p_delivery_options, p_payment_options,
     CASE WHEN 'transferencia' = ANY (p_payment_options) THEN NULLIF(p_transfer_alias, '') END,
     CASE WHEN 'transferencia' = ANY (p_payment_options) THEN NULLIF(p_transfer_cbu, '') END,
     p_allow_scheduled_orders, p_scheduled_lead_minutes, p_preorders_enabled, p_preorder_cutoffs,
     p_header_image_x, p_header_image_y, p_show_default_images)
  ON CONFLICT (business_id) DO UPDATE
  SET published = EXCLUDED.published,
      template = EXCLUDED.template,
      tagline = EXCLUDED.tagline,
      primary_color = EXCLUDED.primary_color,
      secondary_color = EXCLUDED.secondary_color,
      header_image_url = EXCLUDED.header_image_url,
      schedule = EXCLUDED.schedule,
      address = EXCLUDED.address,
      instagram_url = EXCLUDED.instagram_url,
      facebook_url = EXCLUDED.facebook_url,
      temporarily_closed = EXCLUDED.temporarily_closed,
      closed_message = EXCLUDED.closed_message,
      reopens_on = EXCLUDED.reopens_on,
      logo_url = EXCLUDED.logo_url,
      menu_pdf_url = EXCLUDED.menu_pdf_url,
      theme = EXCLUDED.theme,
      delivery_options = EXCLUDED.delivery_options,
      payment_options = EXCLUDED.payment_options,
      transfer_alias = EXCLUDED.transfer_alias,
      transfer_cbu = EXCLUDED.transfer_cbu,
      allow_scheduled_orders = EXCLUDED.allow_scheduled_orders,
      scheduled_lead_minutes = EXCLUDED.scheduled_lead_minutes,
      preorders_enabled = EXCLUDED.preorders_enabled,
      preorder_cutoffs = EXCLUDED.preorder_cutoffs,
      header_image_x = EXCLUDED.header_image_x,
      header_image_y = EXCLUDED.header_image_y,
      show_default_images = EXCLUDED.show_default_images,
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_menu(
  p_slug text,
  p_via_path boolean DEFAULT false,
  p_static boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_config jsonb;
  v_offers jsonb;
  v_categories jsonb;
  v_show_default boolean;
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  SELECT b.id,
         jsonb_strip_nulls(jsonb_build_object(
           'nombre', b.name,
           'descripcion', s.tagline,
           'template', s.template,
           'tema', s.theme,
           'tipo', 'cliente',
           'telefono', b.whatsapp,
           'colores', jsonb_build_object(
             'primary', s.primary_color,
             'secondary', s.secondary_color
           ),
           'logo', s.logo_url,
           'header', CASE
             WHEN s.header_image_url IS NOT NULL
             THEN jsonb_build_object(
               'imagen', s.header_image_url,
               'posicion', jsonb_build_object('x', s.header_image_x, 'y', s.header_image_y)
             )
           END,
           'horarios', CASE WHEN s.schedule <> '{}'::jsonb THEN s.schedule END,
           'direccion', s.address,
           'redes', CASE
             WHEN s.instagram_url IS NOT NULL OR s.facebook_url IS NOT NULL
             THEN jsonb_build_object(
               'instagram', s.instagram_url,
               'facebook', s.facebook_url
             )
           END,
           'cierre', CASE
             WHEN s.temporarily_closed
                  AND (s.reopens_on IS NULL OR s.reopens_on > v_today)
             THEN jsonb_build_object(
               'mensaje', s.closed_message,
               'hasta', s.reopens_on
             )
           END,
           'entrega', to_jsonb(s.delivery_options),
           -- Mercado Pago solo se ofrece si el negocio tiene credenciales habilitadas (MP-1); de
           -- `payment_credentials` no sale nada más que este dato.
           'pagos', to_jsonb(CASE
             WHEN EXISTS (
               SELECT 1 FROM public.payment_credentials pc
               WHERE pc.business_id = b.id AND pc.enabled
             ) THEN s.payment_options
             ELSE array_remove(s.payment_options, 'mercadopago')
           END),
           'transferencia', CASE
             WHEN 'transferencia' = ANY (s.payment_options)
                  AND (s.transfer_alias IS NOT NULL OR s.transfer_cbu IS NOT NULL)
             THEN jsonb_build_object('alias', s.transfer_alias, 'cbu', s.transfer_cbu)
           END,
           'programados', s.allow_scheduled_orders,
           'anticipacionMin', s.scheduled_lead_minutes,
           'anticipados', CASE
             WHEN pw.opens_at IS NOT NULL
             THEN jsonb_build_object(
               'activo', true,
               'proximaApertura', to_char(pw.opens_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'corte', to_char(pw.cutoff_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             )
           END
         )),
         s.show_default_images
  INTO v_business_id, v_config, v_show_default
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  LEFT JOIN LATERAL public.preorder_window(s.schedule, s.preorder_cutoffs, now()) pw
    ON s.preorders_enabled
       AND NOT (s.temporarily_closed AND (s.reopens_on IS NULL OR s.reopens_on > v_today))
  WHERE b.slug = p_slug
    AND s.published
    AND b.active
    AND (
      CASE
        -- Estático (`/menu.html`): exige plan_web; por path, sin plan_completo; por subdominio, con él.
        WHEN p_static THEN b.plan_web AND (CASE WHEN p_via_path THEN NOT b.plan_completo ELSE b.plan_completo END)
        -- Interactivo: solo por subdominio y con plan_completo.
        ELSE b.plan_completo AND NOT p_via_path
      END
    );

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(offer.item ORDER BY offer.created_at, offer.id)
  INTO v_offers
  FROM (
    SELECT pr.id,
           pr.created_at,
           jsonb_strip_nulls(jsonb_build_object(
             'id', pr.id,
             'esPromo', true,
             'nombre', pr.name,
             'descripcion', concat_ws(' · ', NULLIF(pr.description, ''), 'Incluye: ' || t.names),
             'precio', t.final_price,
             'precioAnterior', CASE WHEN t.total > t.final_price THEN t.total END,
             'promo', CASE
               WHEN pr.type = 'percent' THEN trim_scale(pr.discount_percent)::text || '% OFF'
               ELSE 'Combo'
             END
           )) AS item
    FROM public.promotions pr
    CROSS JOIN LATERAL (
      SELECT count(*) AS n,
             bool_and(p.active AND NOT p.sold_out) AS all_active,
             sum(p.price) AS total,
             string_agg(p.name, ', ' ORDER BY i.sort_order) AS names,
             CASE
               WHEN pr.type = 'combo' THEN pr.price
               ELSE round(sum(p.price) * (1 - pr.discount_percent / 100), 2)
             END AS final_price
      FROM public.promotion_items i
      JOIN public.products p
        ON p.id = i.product_id AND p.business_id = i.business_id
      WHERE i.promotion_id = pr.id
    ) t
    WHERE pr.business_id = v_business_id
      AND pr.active
      AND t.n > 0
      AND t.all_active
  ) offer;

  SELECT coalesce(jsonb_agg(cat.item ORDER BY cat.position), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'nombre', c.name,
             'descripcion', c.description,
             'nombre_en', NULLIF(trim(c.name_en), ''),
             'nombre_pt', NULLIF(trim(c.name_pt), ''),
             'descripcion_en', NULLIF(trim(c.description_en), ''),
             'descripcion_pt', NULLIF(trim(c.description_pt), ''),
             'items', prods.items
           )) AS item,
           row_number() OVER (ORDER BY c.sort_order NULLS LAST, c.created_at, c.id) AS position
    FROM public.categories c
    CROSS JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'id', p.id,
                 'nombre', p.name,
                 'descripcion', p.description,
                 'nombre_en', NULLIF(trim(p.name_en), ''),
                 'nombre_pt', NULLIF(trim(p.name_pt), ''),
                 'descripcion_en', NULLIF(trim(p.description_en), ''),
                 'descripcion_pt', NULLIF(trim(p.description_pt), ''),
                 'precio', p.price,
                 -- La imagen propia siempre gana; sin ella, la ilustración sugerida (una sola vez por producto).
                 'imagen', coalesce(NULLIF(btrim(p.image_url), ''), di.image_url),
                 'imagenIlustrativa', CASE
                   WHEN NULLIF(btrim(p.image_url), '') IS NULL AND di.image_url IS NOT NULL THEN true
                 END,
                 'destacado', coalesce(p.featured, false),
                 'agotado', p.sold_out,
                 -- Grupos de opciones y extras (PUBLICO-39): solo los activos asociados a este
                 -- producto, con sus opciones activas. Un grupo sin opciones activas no se entrega.
                 'opciones', (
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'id', g.id,
                              'nombre', g.name,
                              'min', g.min_select,
                              'max', g.max_select,
                              'repetir', g.allow_repeat,
                              'opciones', og.opts
                            )
                            ORDER BY pog.sort_order, g.id
                          )
                   FROM public.product_option_groups pog
                   JOIN public.option_groups g
                     ON g.id = pog.group_id AND g.business_id = pog.business_id AND g.active
                   CROSS JOIN LATERAL (
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'id', o.id,
                                'nombre', o.name,
                                'precio', o.price_delta,
                                'agotado', o.sold_out
                              )
                              ORDER BY o.sort_order, o.id
                            ) AS opts
                     FROM public.options o
                     WHERE o.group_id = g.id AND o.business_id = g.business_id AND o.active
                   ) og
                   WHERE pog.product_id = p.id
                     AND pog.business_id = p.business_id
                     AND og.opts IS NOT NULL
                 )
               ))
               ORDER BY p.sort_order NULLS LAST, p.created_at, p.id
             ) AS items
      FROM public.products p
      LEFT JOIN LATERAL (
        SELECT d.image_url
        FROM public.suggest_default_image(p.name, c.name) d
        WHERE v_show_default AND NULLIF(btrim(p.image_url), '') IS NULL
      ) di ON true
      WHERE p.category_id = c.id
        AND p.business_id = c.business_id
        AND p.active
    ) prods
    WHERE c.business_id = v_business_id
      AND c.active
      AND prods.items IS NOT NULL
  ) cat;

  IF v_offers IS NOT NULL THEN
    v_categories := jsonb_build_array(
      jsonb_build_object('nombre', 'Ofertas', 'tipo', 'ofertas', 'items', v_offers)
    ) || v_categories;
  END IF;

  RETURN jsonb_build_object(
    'config', v_config,
    'menu', jsonb_build_object('categorias', v_categories)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_menu(text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_menu(text, boolean, boolean) TO anon, authenticated;


-- Reporte para el superadmin (ADMIN-SUPER-19): los productos activos de los negocios publicados que no
-- tienen imagen propia ni sugerida, agrupados por nombre normalizado, con la cantidad de negocios. Solo
-- lectura; el superadmin no ve los productos de los negocios por RLS, así que la función los lee con sus
-- permisos y comprueba antes que quien llama es superadmin.
CREATE OR REPLACE FUNCTION public.default_images_unmatched()
RETURNS TABLE (normalized_name text, example_name text, business_count bigint, product_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo el superadmin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT array_to_string(public.normalize_words(p.name), ' ') AS normalized_name,
         min(p.name) AS example_name,
         count(DISTINCT p.business_id) AS business_count,
         count(*) AS product_count
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id AND c.business_id = p.business_id
  JOIN public.businesses b ON b.id = p.business_id
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE s.published
    AND b.active
    AND p.active
    AND c.active
    AND NULLIF(btrim(p.image_url), '') IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.suggest_default_image(p.name, c.name))
    AND cardinality(public.normalize_words(p.name)) > 0
  GROUP BY 1
  ORDER BY count(DISTINCT p.business_id) DESC, count(*) DESC, 1;
END;
$$;

REVOKE ALL ON FUNCTION public.default_images_unmatched() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.default_images_unmatched() TO authenticated;

-- Seed inicial: ilustraciones de Noto Emoji (Google, Apache 2.0), copiadas sin cambios a
-- `landing/assets/defaults/` (ver el README de esa carpeta). Archivo = `emoji_u<código>.svg`:
--   hamburguesa.svg = emoji_u1f354.svg
--   pizza.svg = emoji_u1f355.svg
--   empanada.svg = emoji_u1f95f.svg
--   carne.svg = emoji_u1f969.svg
--   queso.svg = emoji_u1f9c0.svg
--   sandwich.svg = emoji_u1f96a.svg
--   hot-dog.svg = emoji_u1f32d.svg
--   papas-fritas.svg = emoji_u1f35f.svg
--   papa.svg = emoji_u1f954.svg
--   pan.svg = emoji_u1f35e.svg
--   baguette.svg = emoji_u1f956.svg
--   medialuna.svg = emoji_u1f950.svg
--   tarta.svg = emoji_u1f967.svg
--   ensalada.svg = emoji_u1f957.svg
--   pasta.svg = emoji_u1f35d.svg
--   sopa.svg = emoji_u1f372.svg
--   carne-hueso.svg = emoji_u1f356.svg
--   pollo.svg = emoji_u1f357.svg
--   panceta.svg = emoji_u1f953.svg
--   pescado.svg = emoji_u1f41f.svg
--   camaron.svg = emoji_u1f364.svg
--   sushi.svg = emoji_u1f363.svg
--   helado.svg = emoji_u1f368.svg
--   torta.svg = emoji_u1f370.svg
--   chocolate.svg = emoji_u1f36b.svg
--   flan.svg = emoji_u1f36e.svg
--   galleta.svg = emoji_u1f36a.svg
--   dona.svg = emoji_u1f369.svg
--   cupcake.svg = emoji_u1f9c1.svg
--   panqueque.svg = emoji_u1f95e.svg
--   waffle.svg = emoji_u1f9c7.svg
--   huevo.svg = emoji_u1f373.svg
--   bento.svg = emoji_u1f371.svg
--   cafe.svg = emoji_u2615.svg
--   te.svg = emoji_u1fad6.svg
--   mate.svg = emoji_u1f9c9.svg
--   gaseosa.svg = emoji_u1f964.svg
--   agua.svg = emoji_u1f4a7.svg
--   cerveza.svg = emoji_u1f37a.svg
--   vino.svg = emoji_u1f377.svg
--   coctel.svg = emoji_u1f378.svg
--   whisky.svg = emoji_u1f943.svg
--   champagne.svg = emoji_u1f37e.svg
--   jugo.svg = emoji_u1f9c3.svg
--   licuado.svg = emoji_u1f95b.svg
--   limon.svg = emoji_u1f34b.svg
--   fruta.svg = emoji_u1f34e.svg
--   banana.svg = emoji_u1f34c.svg
--   frutilla.svg = emoji_u1f353.svg
--   anana.svg = emoji_u1f34d.svg
--   verduras.svg = emoji_u1f966.svg
--   tomate.svg = emoji_u1f345.svg
--   choclo.svg = emoji_u1f33d.svg
--   pochoclo.svg = emoji_u1f37f.svg
--   arroz.svg = emoji_u1f35a.svg
--   taco.svg = emoji_u1f32e.svg
--   burrito.svg = emoji_u1f32f.svg
--   shawarma.svg = emoji_u1f959.svg
-- Las palabras clave se normalizan solas (trigger). La prioridad desempata: un plato principal
-- ("hamburguesa con papas fritas") gana sobre el acompañamiento.
INSERT INTO public.default_images (name, keywords, image_url, priority)
VALUES
  ('Hamburguesa', ARRAY['hamburguesa', 'burger', 'cheeseburger'], 'https://www.smaalacarta.com.ar/assets/defaults/hamburguesa.svg', 6),
  ('Pizza', ARRAY['pizza', 'pizzeta', 'pizzas'], 'https://www.smaalacarta.com.ar/assets/defaults/pizza.svg', 6),
  ('Pizza muzzarella', ARRAY['pizza muzzarella', 'muzzarella', 'mozzarella', 'muzarella', 'mozarella'], 'https://www.smaalacarta.com.ar/assets/defaults/pizza.svg', 6),
  ('Fugazzeta', ARRAY['fugazzeta', 'fugazza', 'fugazetta', 'faina'], 'https://www.smaalacarta.com.ar/assets/defaults/pizza.svg', 6),
  ('Empanada', ARRAY['empanada', 'pastelito', 'tapas de empanada'], 'https://www.smaalacarta.com.ar/assets/defaults/empanada.svg', 5),
  ('Milanesa', ARRAY['milanesa', 'milanga', 'suprema', 'schnitzel'], 'https://www.smaalacarta.com.ar/assets/defaults/carne.svg', 4),
  ('Milanesa napolitana', ARRAY['milanesa napolitana', 'milanga napolitana'], 'https://www.smaalacarta.com.ar/assets/defaults/queso.svg', 4),
  ('Sándwich', ARRAY['sándwich', 'sanguche', 'sanguchito', 'tostado', 'miga'], 'https://www.smaalacarta.com.ar/assets/defaults/sandwich.svg', 5),
  ('Lomito', ARRAY['lomito', 'lomo'], 'https://www.smaalacarta.com.ar/assets/defaults/sandwich.svg', 5),
  ('Choripán', ARRAY['choripán', 'chori', 'pancho', 'hot dog', 'superpancho'], 'https://www.smaalacarta.com.ar/assets/defaults/hot-dog.svg', 5),
  ('Papas fritas', ARRAY['papas fritas', 'papa frita', 'fritas', 'bastones', 'papas bravas'], 'https://www.smaalacarta.com.ar/assets/defaults/papas-fritas.svg', 1),
  ('Papa', ARRAY['papa', 'papas', 'puré', 'pure', 'batata', 'rústicas'], 'https://www.smaalacarta.com.ar/assets/defaults/papa.svg', 0),
  ('Focaccia', ARRAY['focaccia', 'focacia'], 'https://www.smaalacarta.com.ar/assets/defaults/pan.svg', 3),
  ('Pan', ARRAY['pan', 'panes', 'pan casero', 'bollo', 'pan de campo', 'lactal'], 'https://www.smaalacarta.com.ar/assets/defaults/pan.svg', 0),
  ('Baguette y tostadas', ARRAY['baguette', 'flauta', 'pan francés', 'tostadas', 'tostada', 'bruschetta'], 'https://www.smaalacarta.com.ar/assets/defaults/baguette.svg', 1),
  ('Medialuna', ARRAY['medialuna', 'croissant', 'factura', 'facturas', 'vigilante', 'criollo'], 'https://www.smaalacarta.com.ar/assets/defaults/medialuna.svg', 3),
  ('Tarta', ARRAY['tarta', 'quiche', 'pascualina', 'tartaleta'], 'https://www.smaalacarta.com.ar/assets/defaults/tarta.svg', 4),
  ('Ensalada', ARRAY['ensalada', 'caesar', 'césar'], 'https://www.smaalacarta.com.ar/assets/defaults/ensalada.svg', 3),
  ('Pasta', ARRAY['pasta', 'fideos', 'tallarines', 'spaghetti', 'espagueti', 'penne', 'fettuccine', 'lasagna', 'lasaña', 'canelones', 'sorrentinos', 'moñitos'], 'https://www.smaalacarta.com.ar/assets/defaults/pasta.svg', 4),
  ('Ñoquis', ARRAY['ñoquis', 'gnocchi'], 'https://www.smaalacarta.com.ar/assets/defaults/pasta.svg', 4),
  ('Ravioles', ARRAY['ravioles', 'agnolotti', 'capeletis'], 'https://www.smaalacarta.com.ar/assets/defaults/pasta.svg', 4),
  ('Sopa', ARRAY['sopa', 'caldo', 'crema de', 'puchero', 'locro', 'guiso', 'lentejas', 'cazuela'], 'https://www.smaalacarta.com.ar/assets/defaults/sopa.svg', 2),
  ('Parrilla', ARRAY['parrilla', 'asado', 'parrillada', 'vacío', 'costilla', 'tira de asado', 'chorizo', 'morcilla', 'chinchulín', 'achuras', 'picaña'], 'https://www.smaalacarta.com.ar/assets/defaults/carne-hueso.svg', 4),
  ('Bife', ARRAY['bife', 'ojo de bife', 'entraña', 'churrasco', 'ribeye', 'bondiola'], 'https://www.smaalacarta.com.ar/assets/defaults/carne.svg', 3),
  ('Pollo', ARRAY['pollo', 'alitas', 'pechuga', 'muslo', 'nuggets', 'spiedo', 'pata muslo'], 'https://www.smaalacarta.com.ar/assets/defaults/pollo.svg', 2),
  ('Cerdo y fiambres', ARRAY['cerdo', 'panceta', 'jamón', 'matambre', 'lechón', 'bacon', 'fiambre'], 'https://www.smaalacarta.com.ar/assets/defaults/panceta.svg', 2),
  ('Pescado', ARRAY['pescado', 'merluza', 'salmón', 'trucha', 'lenguado', 'rabas', 'calamar', 'fish'], 'https://www.smaalacarta.com.ar/assets/defaults/pescado.svg', 2),
  ('Mariscos', ARRAY['camarones', 'langostinos', 'mariscos', 'gambas', 'paella', 'cangrejo'], 'https://www.smaalacarta.com.ar/assets/defaults/camaron.svg', 2),
  ('Sushi', ARRAY['sushi', 'niguiri', 'sashimi', 'maki', 'temaki', 'uramaki', 'california roll'], 'https://www.smaalacarta.com.ar/assets/defaults/sushi.svg', 4),
  ('Helado', ARRAY['helado', 'gelato', 'cucurucho', 'bocha', 'sundae', 'frozen'], 'https://www.smaalacarta.com.ar/assets/defaults/helado.svg', 4),
  ('Torta', ARRAY['torta', 'cheesecake', 'lemon pie', 'chocotorta', 'tiramisú', 'bizcochuelo', 'cumpleaños'], 'https://www.smaalacarta.com.ar/assets/defaults/torta.svg', 3),
  ('Chocolate', ARRAY['chocolate', 'brownie', 'bombón', 'cacao', 'trufa'], 'https://www.smaalacarta.com.ar/assets/defaults/chocolate.svg', 1),
  ('Flan y postres', ARRAY['flan', 'postre', 'budín', 'mousse', 'panna cotta', 'creme brulee', 'queso y dulce'], 'https://www.smaalacarta.com.ar/assets/defaults/flan.svg', 1),
  ('Alfajor', ARRAY['alfajor', 'galleta', 'galletitas', 'cookie', 'bizcocho'], 'https://www.smaalacarta.com.ar/assets/defaults/galleta.svg', 2),
  ('Donas y churros', ARRAY['dona', 'donut', 'berlinesa', 'churro', 'churros'], 'https://www.smaalacarta.com.ar/assets/defaults/dona.svg', 2),
  ('Cupcake y muffin', ARRAY['cupcake', 'muffin', 'magdalena'], 'https://www.smaalacarta.com.ar/assets/defaults/cupcake.svg', 2),
  ('Panqueque', ARRAY['panqueque', 'crepe', 'crepes', 'panqueques'], 'https://www.smaalacarta.com.ar/assets/defaults/panqueque.svg', 3),
  ('Waffle', ARRAY['waffle', 'waffles'], 'https://www.smaalacarta.com.ar/assets/defaults/waffle.svg', 3),
  ('Huevo', ARRAY['huevo', 'huevos', 'omelette', 'tortilla', 'revuelto'], 'https://www.smaalacarta.com.ar/assets/defaults/huevo.svg', 2),
  ('Combo', ARRAY['combo', 'menú del día', 'menú ejecutivo', 'plato del día', 'tabla', 'picada', 'box', 'promo'], 'https://www.smaalacarta.com.ar/assets/defaults/bento.svg', 0),
  ('Café', ARRAY['café', 'cafés', 'capuchino', 'cappuccino', 'latte', 'cortado', 'lágrima', 'espresso', 'moka', 'desayuno', 'merienda', 'café con leche'], 'https://www.smaalacarta.com.ar/assets/defaults/cafe.svg', 2),
  ('Té', ARRAY['té', 'infusión', 'manzanilla', 'cedrón', 'boldo', 'tisana'], 'https://www.smaalacarta.com.ar/assets/defaults/te.svg', 2),
  ('Mate', ARRAY['mate', 'mate cocido', 'yerba'], 'https://www.smaalacarta.com.ar/assets/defaults/mate.svg', 2),
  ('Gaseosa', ARRAY['gaseosa', 'coca', 'coca cola', 'pepsi', 'sprite', 'fanta', '7up', 'seven up', 'soda', 'cola', 'tónica', 'pomelo'], 'https://www.smaalacarta.com.ar/assets/defaults/gaseosa.svg', 1),
  ('Agua', ARRAY['agua', 'agua mineral', 'sin gas', 'con gas', 'sifón', 'villavicencio', 'bidón'], 'https://www.smaalacarta.com.ar/assets/defaults/agua.svg', 1),
  ('Cerveza', ARRAY['cerveza', 'birra', 'ipa', 'lager', 'stout', 'pinta', 'chop', 'quilmes', 'stella', 'brahma', 'heineken', 'corona', 'imperial', 'amber', 'honey'], 'https://www.smaalacarta.com.ar/assets/defaults/cerveza.svg', 2),
  ('Vino', ARRAY['vino', 'malbec', 'cabernet', 'merlot', 'chardonnay', 'torrontés', 'sauvignon', 'rosado'], 'https://www.smaalacarta.com.ar/assets/defaults/vino.svg', 2),
  ('Cóctel', ARRAY['cóctel', 'cocktail', 'trago', 'tragos', 'mojito', 'caipirinha', 'aperol', 'spritz', 'campari', 'daiquiri', 'gin tonic', 'gin'], 'https://www.smaalacarta.com.ar/assets/defaults/coctel.svg', 2),
  ('Destilados', ARRAY['fernet', 'whisky', 'whiskey', 'ron', 'vodka', 'tequila', 'licor', 'aperitivo', 'cognac'], 'https://www.smaalacarta.com.ar/assets/defaults/whisky.svg', 2),
  ('Champagne', ARRAY['champagne', 'champán', 'espumante', 'sidra', 'brut', 'prosecco', 'chandon'], 'https://www.smaalacarta.com.ar/assets/defaults/champagne.svg', 2),
  ('Jugo', ARRAY['jugo', 'naranjada', 'exprimido', 'smoothie'], 'https://www.smaalacarta.com.ar/assets/defaults/jugo.svg', 2),
  ('Licuado', ARRAY['licuado', 'batido', 'shake', 'milkshake', 'malteada', 'frappé', 'chocolatada'], 'https://www.smaalacarta.com.ar/assets/defaults/licuado.svg', 2),
  ('Limonada', ARRAY['limonada', 'limón'], 'https://www.smaalacarta.com.ar/assets/defaults/limon.svg', 2),
  ('Fruta', ARRAY['fruta', 'manzana', 'pera', 'durazno', 'naranja', 'uva', 'sandía', 'melón', 'kiwi'], 'https://www.smaalacarta.com.ar/assets/defaults/fruta.svg', 1),
  ('Banana', ARRAY['banana', 'banano'], 'https://www.smaalacarta.com.ar/assets/defaults/banana.svg', 1),
  ('Frutilla', ARRAY['frutilla', 'fresa', 'berries', 'frutos rojos'], 'https://www.smaalacarta.com.ar/assets/defaults/frutilla.svg', 1),
  ('Ananá', ARRAY['ananá', 'piña'], 'https://www.smaalacarta.com.ar/assets/defaults/anana.svg', 1),
  ('Verduras', ARRAY['verdura', 'brócoli', 'zapallo', 'zanahoria', 'berenjena', 'espinaca', 'acelga', 'vegetales', 'vegetariano', 'vegano'], 'https://www.smaalacarta.com.ar/assets/defaults/verduras.svg', 1),
  ('Tomate', ARRAY['tomate', 'caprese', 'pomodoro'], 'https://www.smaalacarta.com.ar/assets/defaults/tomate.svg', 0),
  ('Choclo', ARRAY['choclo', 'humita', 'maíz'], 'https://www.smaalacarta.com.ar/assets/defaults/choclo.svg', 1),
  ('Pochoclo', ARRAY['pochoclo', 'popcorn'], 'https://www.smaalacarta.com.ar/assets/defaults/pochoclo.svg', 2),
  ('Arroz', ARRAY['arroz', 'risotto'], 'https://www.smaalacarta.com.ar/assets/defaults/arroz.svg', 1),
  ('Tacos', ARRAY['taco', 'nachos', 'quesadilla', 'fajitas'], 'https://www.smaalacarta.com.ar/assets/defaults/taco.svg', 3),
  ('Burritos y wraps', ARRAY['burrito', 'wrap'], 'https://www.smaalacarta.com.ar/assets/defaults/burrito.svg', 3),
  ('Shawarma', ARRAY['shawarma', 'shawerma', 'kebab', 'doner', 'gyros', 'falafel', 'árabe'], 'https://www.smaalacarta.com.ar/assets/defaults/shawarma.svg', 4),
  ('Queso', ARRAY['queso', 'quesos', 'provoleta', 'provolone', 'fondue', 'cheddar', 'roquefort'], 'https://www.smaalacarta.com.ar/assets/defaults/queso.svg', 1);
