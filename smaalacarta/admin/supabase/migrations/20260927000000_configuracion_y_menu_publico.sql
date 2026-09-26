-- Configuración de cada negocio (lo que hoy vive en config.json del menú web) y la
-- función que entrega el menú público. (ADMIN-CONFIG-1 a 4 y PUBLICO-1 a 5.)

-- ¿Un horario tiene el formato del menú web? Un objeto con días de `lunes` a
-- `domingo` (sin tildes), cada uno con una lista de rangos "HH:MM-HH:MM"; un rango
-- puede cruzar la medianoche ("20:00-02:00"). Una lista vacía es un día cerrado.
CREATE OR REPLACE FUNCTION public.is_valid_schedule(p_schedule jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_day text;
  v_ranges jsonb;
  v_range text;
BEGIN
  IF jsonb_typeof(p_schedule) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;

  FOR v_day, v_ranges IN SELECT key, value FROM jsonb_each(p_schedule) LOOP
    IF v_day NOT IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo') THEN
      RETURN false;
    END IF;

    IF jsonb_typeof(v_ranges) IS DISTINCT FROM 'array' THEN
      RETURN false;
    END IF;

    FOR v_range IN SELECT jsonb_array_elements_text(v_ranges) LOOP
      IF v_range !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN true;
END;
$$;

-- Una fila por negocio. Los valores por defecto son los de la marca (paleta de la
-- landing). `published` arranca en false: un negocio nuevo no es público hasta que
-- su dueño lo publica (ADMIN-CONFIG-4). `schedule` vacío significa "sin horarios
-- cargados": el menú se muestra siempre abierto.
CREATE TABLE IF NOT EXISTS public.business_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  published boolean NOT NULL DEFAULT false,
  template text NOT NULL DEFAULT 'moderno',
  tagline text,
  primary_color text NOT NULL DEFAULT '#5a4a3a',
  secondary_color text NOT NULL DEFAULT '#d97706',
  header_image_url text,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_settings_template_check
    CHECK (template IN ('moderno', 'clasico', 'minimal')),
  CONSTRAINT business_settings_primary_color_check
    CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT business_settings_secondary_color_check
    CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  -- Solo https: el menú la usa en un estilo CSS y en un <img>.
  CONSTRAINT business_settings_header_image_check
    CHECK (header_image_url IS NULL OR header_image_url ~ '^https://[^[:space:]"''()<>]+$'),
  CONSTRAINT business_settings_tagline_check
    CHECK (tagline IS NULL OR char_length(tagline) <= 200),
  CONSTRAINT business_settings_schedule_check
    CHECK (public.is_valid_schedule(schedule))
);

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Solo los miembros del negocio leen y escriben su configuración. No hay política
-- de DELETE: se borra en cascada con el negocio. `anon` no lee nada: el menú
-- público pasa por `public_menu`.
DROP POLICY IF EXISTS business_settings_select ON public.business_settings;
CREATE POLICY business_settings_select
ON public.business_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = business_settings.business_id
  )
);

DROP POLICY IF EXISTS business_settings_insert ON public.business_settings;
CREATE POLICY business_settings_insert
ON public.business_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = business_settings.business_id
  )
);

DROP POLICY IF EXISTS business_settings_update ON public.business_settings;
CREATE POLICY business_settings_update
ON public.business_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = business_settings.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = business_settings.business_id
  )
);

-- Guarda la configuración y el WhatsApp del negocio en un solo paso
-- (ADMIN-CONFIG-3). Corre con los permisos de quien la llama (SECURITY INVOKER):
-- el RLS decide qué negocio puede tocar.
CREATE OR REPLACE FUNCTION public.save_business_settings(
  p_business_id uuid,
  p_published boolean,
  p_template text,
  p_tagline text,
  p_primary_color text,
  p_secondary_color text,
  p_header_image_url text,
  p_schedule jsonb,
  p_whatsapp text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_settings
    (business_id, published, template, tagline, primary_color, secondary_color,
     header_image_url, schedule)
  VALUES
    (p_business_id, p_published, p_template, NULLIF(p_tagline, ''), p_primary_color,
     p_secondary_color, NULLIF(p_header_image_url, ''), p_schedule)
  ON CONFLICT (business_id) DO UPDATE
  SET published = EXCLUDED.published,
      template = EXCLUDED.template,
      tagline = EXCLUDED.tagline,
      primary_color = EXCLUDED.primary_color,
      secondary_color = EXCLUDED.secondary_color,
      header_image_url = EXCLUDED.header_image_url,
      schedule = EXCLUDED.schedule,
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(uuid, boolean, text, text, text, text, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(uuid, boolean, text, text, text, text, text, jsonb, text)
  TO authenticated;

-- El menú público de un negocio, con el formato de `config.json` y `menu.json` del
-- menú web. Lo puede llamar cualquiera, sin sesión: es SECURITY DEFINER para leer
-- las tablas sin darle acceso a ellas, y solo entrega lo que el negocio publicó
-- (PUBLICO-1 a 5). Nada de lo que devuelve permite escribir.
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
           'horarios', CASE WHEN s.schedule <> '{}'::jsonb THEN s.schedule END
         ))
  INTO v_business_id, v_config
  FROM public.businesses b
  JOIN public.business_settings s ON s.business_id = b.id
  WHERE b.slug = p_slug AND s.published;

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Promociones activas cuyos productos están todos activos, con su precio final
  -- (mismo cálculo que `promotionPricing`: descuento sobre la suma, o precio fijo).
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

  -- Categorías activas con al menos un producto activo, en el orden del negocio;
  -- los que no tienen orden van al final, del más viejo al más nuevo (ADMIN-MENU-3).
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
