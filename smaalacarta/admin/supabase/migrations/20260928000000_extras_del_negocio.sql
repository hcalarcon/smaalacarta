-- Dirección y redes, cierre temporal, imágenes en un bucket y slugs reservados.
-- (ADMIN-CONFIG-5 a 7, ADMIN-SUPER-12 y PUBLICO-8.)

-- Dirección, redes y cierre temporal en la configuración del negocio.
ALTER TABLE public.business_settings
  ADD COLUMN address text,
  ADD COLUMN instagram_url text,
  ADD COLUMN facebook_url text,
  ADD COLUMN temporarily_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN closed_message text,
  -- Día en que reabre. El cierre termina solo al llegar ese día.
  ADD COLUMN reopens_on date;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_address_check
    CHECK (address IS NULL OR char_length(address) <= 200),
  -- Solo direcciones de la propia red social: el menú las usa como enlaces.
  ADD CONSTRAINT business_settings_instagram_check
    CHECK (instagram_url IS NULL OR instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$'),
  ADD CONSTRAINT business_settings_facebook_check
    CHECK (facebook_url IS NULL OR facebook_url ~ '^https://(www\.)?facebook\.com/[A-Za-z0-9._-]{1,80}/?$'),
  ADD CONSTRAINT business_settings_closed_message_check
    CHECK (closed_message IS NULL OR char_length(closed_message) <= 200);

-- Un slug es un subdominio (<slug>.smaalacarta.com.ar): los nombres que ya usa la
-- plataforma no pueden ser de un negocio (ADMIN-SUPER-12). NOT VALID: se exige en
-- todo negocio nuevo o modificado, sin revisar los que ya existían.
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_slug_reserved
  CHECK (slug NOT IN (
    'www', 'app', 'admin', 'api', 'demo', 'demos', 'moderno', 'clasico', 'minimal',
    'mail', 'static', 'assets', 'cdn', 'dev', 'staging', 'panel', 'login', 'landing'
  )) NOT VALID;

-- Guarda la configuración y el WhatsApp con los datos nuevos. Cambia la firma de la
-- función de la migración anterior, así que se reemplaza.
DROP FUNCTION IF EXISTS public.save_business_settings(uuid, boolean, text, text, text, text, text, jsonb, text);

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
  p_reopens_on date
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_settings
    (business_id, published, template, tagline, primary_color, secondary_color,
     header_image_url, schedule, address, instagram_url, facebook_url,
     temporarily_closed, closed_message, reopens_on)
  VALUES
    (p_business_id, p_published, p_template, NULLIF(p_tagline, ''), p_primary_color,
     p_secondary_color, NULLIF(p_header_image_url, ''), p_schedule,
     NULLIF(p_address, ''), NULLIF(p_instagram_url, ''), NULLIF(p_facebook_url, ''),
     p_temporarily_closed, NULLIF(p_closed_message, ''), p_reopens_on)
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
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date
) TO authenticated;

-- Bucket de imágenes: cada negocio escribe solo en su carpeta (`<business_id>/…`).
-- Público para leer (las imágenes se ven en el menú por su dirección), con un
-- máximo de 2 MB y solo JPG, PNG o WebP (ADMIN-CONFIG-7).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-images',
  'business-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- La primera carpeta del nombre tiene que ser un negocio del que sos miembro. El
-- `..` se rechaza para que un nombre no pueda salirse de su carpeta.
DROP POLICY IF EXISTS business_images_select ON storage.objects;
CREATE POLICY business_images_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'business-images'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS business_images_insert ON storage.objects;
CREATE POLICY business_images_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-images'
  AND name !~ '\.\.'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS business_images_update ON storage.objects;
CREATE POLICY business_images_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-images'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'business-images'
  AND name !~ '\.\.'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS business_images_delete ON storage.objects;
CREATE POLICY business_images_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-images'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

-- El menú público, con la dirección, las redes y el cierre temporal (PUBLICO-8).
-- Cambia solo `config`; el resto es igual a la versión anterior.
CREATE OR REPLACE FUNCTION public.public_menu(p_slug text)
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
  -- Hoy en Argentina: el cierre con fecha termina el día de la reapertura.
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  SELECT b.id,
         jsonb_strip_nulls(jsonb_build_object(
           'nombre', b.name,
           'descripcion', s.tagline,
           'template', s.template,
           'tipo', 'cliente',
           'telefono', b.whatsapp,
           'colores', jsonb_build_object(
             'primary', s.primary_color,
             'secondary', s.secondary_color
           ),
           'header', CASE
             WHEN s.header_image_url IS NOT NULL
             THEN jsonb_build_object('imagen', s.header_image_url)
           END,
           -- Sin horarios cargados no se manda la clave: el menú queda siempre abierto.
           'horarios', CASE WHEN s.schedule <> '{}'::jsonb THEN s.schedule END,
           'direccion', s.address,
           'redes', CASE
             WHEN s.instagram_url IS NOT NULL OR s.facebook_url IS NOT NULL
             THEN jsonb_build_object(
               'instagram', s.instagram_url,
               'facebook', s.facebook_url
             )
           END,
           -- Un cierre vigente llega como `cierre` (vacío si no tiene mensaje ni fecha).
           'cierre', CASE
             WHEN s.temporarily_closed
                  AND (s.reopens_on IS NULL OR s.reopens_on > v_today)
             THEN jsonb_build_object(
               'mensaje', s.closed_message,
               'hasta', s.reopens_on
             )
           END
         ))
  INTO v_business_id, v_config
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug AND s.published;

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(offer.item ORDER BY offer.created_at, offer.id)
  INTO v_offers
  FROM (
    SELECT pr.id,
           pr.created_at,
           jsonb_strip_nulls(jsonb_build_object(
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
             bool_and(p.active) AS all_active,
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
             'items', prods.items
           )) AS item,
           row_number() OVER (ORDER BY c.sort_order NULLS LAST, c.created_at, c.id) AS position
    FROM public.categories c
    CROSS JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'nombre', p.name,
                 'descripcion', p.description,
                 'precio', p.price,
                 'imagen', p.image_url,
                 'destacado', coalesce(p.featured, false)
               ))
               ORDER BY p.sort_order NULLS LAST, p.created_at, p.id
             ) AS items
      FROM public.products p
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

REVOKE ALL ON FUNCTION public.public_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_menu(text) TO anon, authenticated;
