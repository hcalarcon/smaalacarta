-- Menú en PDF (Etapa 6e de docs/PLAN.md): un negocio puede tener un PDF con su
-- menú, independiente de si publicó o no el menú digital (`published`) — el plan
-- gratis "QR + PDF" puede no publicar nunca uno y aun así tener el otro andando.

ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS menu_pdf_url text;

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_menu_pdf_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_menu_pdf_check
  CHECK (menu_pdf_url IS NULL OR menu_pdf_url ~ '^https://[^[:space:]"''()<>]+$');

-- `save_business_settings` gana un parámetro (el PDF): se reemplaza la versión anterior.
DROP FUNCTION IF EXISTS public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text
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
  p_menu_pdf_url text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_settings
    (business_id, published, template, tagline, primary_color, secondary_color,
     header_image_url, schedule, address, instagram_url, facebook_url,
     temporarily_closed, closed_message, reopens_on, logo_url, menu_pdf_url)
  VALUES
    (p_business_id, p_published, p_template, NULLIF(p_tagline, ''), p_primary_color,
     p_secondary_color, NULLIF(p_header_image_url, ''), p_schedule,
     NULLIF(p_address, ''), NULLIF(p_instagram_url, ''), NULLIF(p_facebook_url, ''),
     p_temporarily_closed, NULLIF(p_closed_message, ''), p_reopens_on,
     NULLIF(p_logo_url, ''), NULLIF(p_menu_pdf_url, ''))
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
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text
) TO authenticated;

-- Bucket aparte para los PDF: mismo esquema de carpetas y el mismo RLS que
-- `business-images` (cada negocio escribe solo en `<business_id>/…`), pero con
-- `application/pdf` y un límite más grande (un menú escaneado pesa más que un logo).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-pdfs',
  'business-pdfs',
  true,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS business_pdfs_select ON storage.objects;
CREATE POLICY business_pdfs_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'business-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS business_pdfs_insert ON storage.objects;
CREATE POLICY business_pdfs_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-pdfs'
  AND name !~ '\.\.'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS business_pdfs_update ON storage.objects;
CREATE POLICY business_pdfs_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'business-pdfs'
  AND name !~ '\.\.'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS business_pdfs_delete ON storage.objects;
CREATE POLICY business_pdfs_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id::text = (storage.foldername(name))[1]
  )
);

-- El PDF público, sin exigir `published`: un negocio del plan gratis puede no
-- publicar nunca el menú digital y aun así tener su QR con el PDF andando.
-- SECURITY DEFINER para leer `business_settings` sin darle acceso a la tabla;
-- no devuelve nada más que el nombre y la dirección del PDF.
CREATE OR REPLACE FUNCTION public.public_business_pdf(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_pdf_url text;
BEGIN
  SELECT b.name, s.menu_pdf_url
  INTO v_name, v_pdf_url
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug;

  IF v_pdf_url IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('nombre', v_name, 'pdf', v_pdf_url);
END;
$$;

REVOKE ALL ON FUNCTION public.public_business_pdf(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_business_pdf(text) TO anon, authenticated;
