-- Imagen y vigencia en las promociones (ADMIN-PROMO-1 a 12, PUBLICO-67 a 72, ESTATICO-12 y 13).
--
-- - `promotions.image_url` (imagen propia) o `promotions.image_product_id` (la imagen de uno de los productos de la
--   promo: una referencia, no una copia). Excluyentes. En el menú: la propia → la del producto elegido (su imagen o
--   la ilustrativa) → la del primer producto de la promo que tenga una → nada.
-- - `promotions.valid_until`: hasta cuándo vale (nulo = sin fin). Pasada esa hora no se entrega ni se puede pedir.
-- - `promotions.stock` y `stock_set_at`: unidades disponibles. Lo que queda es `stock` menos las unidades de esa
--   promoción en pedidos no cancelados creados desde `stock_set_at`; `save_promotion` mueve `stock_set_at` a `now()`
--   cada vez que cambia el valor. No se descuenta ni se restituye nada: un pedido cancelado libera la unidad solo.
-- - `promotion_sold()`, `promotion_remaining()` y `promotion_stock_stats()` son de quien llama (invoker): el RLS de
--   `orders` y `promotions` hace que un miembro solo vea las de su negocio.
-- - Misma `save_promotion` de `20261009000000_opciones_y_extras.sql`, con `p_image_url`, `p_image_product_id`,
--   `p_valid_until` y `p_stock`: se borra la firma anterior.
-- - Misma `build_public_menu` de `20261029000000_notas_por_item.sql`. `public_menu` y `menu_preview` delegan en ella.
-- - Misma `resolve_order_lines` de `20261101000000_pedido_manual_en_el_circuito.sql`: rechaza la promoción vencida o
--   agotada (P0001) y bloquea su fila para que dos pedidos a la vez no vendan de más.
--
-- El RLS de `promotions` no cambia (son columnas nuevas de una tabla que ya filtra por `business_id`) y el trigger
-- `promotions_guard_active` de `20260930000900_bloqueo_por_suspension.sql` es de fila entera: alcanza a las nuevas.

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_product_id uuid,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS stock integer,
  ADD COLUMN IF NOT EXISTS stock_set_at timestamptz;

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_image_exclusive_check;
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_image_exclusive_check
  CHECK (image_url IS NULL OR image_product_id IS NULL);

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_stock_check;
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_stock_check
  CHECK (stock IS NULL OR stock >= 1);

-- Si se borra el producto cuya imagen se usaba, la promoción queda sin referencia (no se borra `business_id`).
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_image_product_fkey;
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_image_product_fkey
  FOREIGN KEY (image_product_id, business_id)
  REFERENCES public.products (id, business_id)
  ON DELETE SET NULL (image_product_id);

-- ---------------------------------------------------------------------------
-- Unidades vendidas y restantes
-- ---------------------------------------------------------------------------

-- Unidades de la promoción en pedidos no cancelados creados desde que se fijó el stock.
CREATE OR REPLACE FUNCTION public.promotion_sold(p_promotion_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(sum(i.quantity), 0)::integer
  FROM public.promotions p
  JOIN public.order_items i ON i.promotion_id = p.id AND i.business_id = p.business_id
  JOIN public.orders o ON o.id = i.order_id AND o.business_id = i.business_id
  WHERE p.id = p_promotion_id
    AND o.status <> 'cancelled'
    AND (p.stock_set_at IS NULL OR o.created_at >= p.stock_set_at);
$$;

-- Lo que queda: nulo si la promoción no tiene stock cargado (o no es visible para quien llama).
CREATE OR REPLACE FUNCTION public.promotion_remaining(p_promotion_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN p.stock IS NULL THEN NULL
           ELSE greatest(0, p.stock - public.promotion_sold(p.id))
         END
  FROM public.promotions p
  WHERE p.id = p_promotion_id;
$$;

-- Vendidas y restantes de todas las promociones de un negocio, para el panel.
CREATE OR REPLACE FUNCTION public.promotion_stock_stats(p_business_id uuid)
RETURNS TABLE (promotion_id uuid, sold integer, remaining integer)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p.id, public.promotion_sold(p.id), public.promotion_remaining(p.id)
  FROM public.promotions p
  WHERE p.business_id = p_business_id;
$$;

REVOKE ALL ON FUNCTION public.promotion_sold(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.promotion_remaining(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.promotion_stock_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_sold(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_remaining(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_stock_stats(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- save_promotion
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.save_promotion(uuid, uuid, text, text, text, numeric, numeric, boolean, uuid[]);

CREATE OR REPLACE FUNCTION public.save_promotion(
  p_id uuid,
  p_business_id uuid,
  p_name text,
  p_description text,
  p_type text,
  p_discount_percent numeric,
  p_price numeric,
  p_active boolean,
  p_product_ids uuid[],
  p_image_url text DEFAULT NULL,
  p_image_product_id uuid DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL,
  p_stock integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_blocked text;
  v_image_url text := NULLIF(btrim(coalesce(p_image_url, '')), '');
  v_old_valid_until timestamptz;
BEGIN
  IF coalesce(array_length(p_product_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Una promoción necesita al menos un producto'
      USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(p.name, ', ' ORDER BY p.name)
  INTO v_blocked
  FROM public.products p
  WHERE p.business_id = p_business_id
    AND p.id = ANY (p_product_ids)
    AND public.product_has_required_group(p.id);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'Estos productos tienen opciones obligatorias y no pueden estar en una promoción: %', v_blocked
      USING ERRCODE = 'P0014';
  END IF;

  -- Imagen propia o la de un producto de la promo, no las dos (ADMIN-PROMO-2).
  IF v_image_url IS NOT NULL AND p_image_product_id IS NOT NULL THEN
    RAISE EXCEPTION 'Elegí una imagen propia o la de un producto, no las dos'
      USING ERRCODE = '22023';
  END IF;

  IF p_image_product_id IS NOT NULL AND NOT (p_image_product_id = ANY (p_product_ids)) THEN
    RAISE EXCEPTION 'La imagen tiene que ser de un producto de la promoción'
      USING ERRCODE = '22023';
  END IF;

  IF p_stock IS NOT NULL AND p_stock < 1 THEN
    RAISE EXCEPTION 'Las unidades disponibles tienen que ser 1 o más'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT pr.valid_until INTO v_old_valid_until
    FROM public.promotions pr
    WHERE pr.id = p_id AND pr.business_id = p_business_id;
  END IF;

  -- Una fecha de fin nueva tiene que ser futura; guardar otra cosa de una promo ya vencida no la toca.
  IF p_valid_until IS NOT NULL
     AND p_valid_until IS DISTINCT FROM v_old_valid_until
     AND p_valid_until <= now() THEN
    RAISE EXCEPTION 'La fecha de fin tiene que ser futura'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions
      (business_id, name, description, type, discount_percent, price, active,
       image_url, image_product_id, valid_until, stock, stock_set_at)
    VALUES
      (p_business_id, p_name, p_description, p_type, p_discount_percent, p_price, p_active,
       v_image_url, p_image_product_id, p_valid_until, p_stock,
       CASE WHEN p_stock IS NOT NULL THEN now() END)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions
    SET name = p_name,
        description = p_description,
        type = p_type,
        discount_percent = p_discount_percent,
        price = p_price,
        active = p_active,
        image_url = v_image_url,
        image_product_id = p_image_product_id,
        valid_until = p_valid_until,
        -- Cada cambio del valor reinicia el conteo (ADMIN-PROMO-9): se cuenta desde ahora.
        stock_set_at = CASE
          WHEN p_stock IS NULL THEN NULL
          WHEN stock IS DISTINCT FROM p_stock THEN now()
          ELSE stock_set_at
        END,
        stock = p_stock,
        updated_at = now()
    WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'La promoción no existe' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.promotion_items WHERE promotion_id = v_id;
  END IF;

  INSERT INTO public.promotion_items (promotion_id, product_id, business_id, sort_order)
  SELECT v_id, t.product_id, p_business_id, t.position - 1
  FROM unnest(p_product_ids) WITH ORDINALITY AS t(product_id, position);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_promotion(
  uuid, uuid, text, text, text, numeric, numeric, boolean, uuid[], text, uuid, timestamptz, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_promotion(
  uuid, uuid, text, text, text, numeric, numeric, boolean, uuid[], text, uuid, timestamptz, integer
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Menú y pedido
-- ---------------------------------------------------------------------------

-- Misma `build_public_menu` de `20261029000000_notas_por_item.sql`: cada promoción lleva su imagen, hasta
-- cuándo vale y cuántas quedan, y una vencida o agotada no se entrega.
CREATE OR REPLACE FUNCTION public.build_public_menu(p_business_id uuid)
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
           -- Mercado Pago solo se ofrece si el negocio tiene con qué cobrar: credenciales manuales
           -- habilitadas o una conexión OAuth conectada (MP-1, MP-23). De ahí no sale nada más que este dato.
           'pagos', to_jsonb(CASE
             WHEN public.business_has_mp(b.id) THEN s.payment_options
             ELSE array_remove(s.payment_options, 'mercadopago')
           END),
           'transferencia', CASE
             WHEN 'transferencia' = ANY (s.payment_options)
                  AND (s.transfer_alias IS NOT NULL OR s.transfer_cbu IS NOT NULL)
             THEN jsonb_build_object('alias', s.transfer_alias, 'cbu', s.transfer_cbu)
           END,
           'programados', s.allow_scheduled_orders,
           -- El menú ofrece el campo de nota por producto solo si el negocio lo permite (PUBLICO-64).
           'notasPorItem', s.allow_item_notes,
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
  WHERE b.id = p_business_id;

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
             END,
             -- Imagen de la promoción (ADMIN-PROMO-1 a 3): la propia, la del producto elegido o la del
             -- primer producto que tenga una. Es ilustrativa solo si no es una foto del negocio.
             'imagen', CASE
               WHEN NULLIF(btrim(pr.image_url), '') IS NOT NULL THEN btrim(pr.image_url)
               WHEN chosen.url IS NOT NULL THEN chosen.url
               ELSE firstp.url
             END,
             'imagenIlustrativa', CASE
               WHEN NULLIF(btrim(pr.image_url), '') IS NULL
                    AND (CASE WHEN chosen.url IS NOT NULL THEN chosen.illustrative ELSE firstp.illustrative END)
               THEN true
             END,
             -- Vigencia (ADMIN-PROMO-6 y 7): hasta cuándo vale y, cuando quedan pocas, cuántas.
             'validaHasta', CASE
               WHEN pr.valid_until IS NOT NULL
               THEN to_char(pr.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             END,
             'quedan', CASE WHEN rem.n IS NOT NULL AND rem.n <= 5 THEN rem.n END
           )) AS item
    FROM public.promotions pr
    CROSS JOIN LATERAL (SELECT public.promotion_remaining(pr.id) AS n) rem
    LEFT JOIN LATERAL (
      SELECT coalesce(NULLIF(btrim(pp.image_url), ''), di.image_url) AS url,
             NULLIF(btrim(pp.image_url), '') IS NULL AS illustrative
      FROM public.products pp
      JOIN public.categories pc ON pc.id = pp.category_id AND pc.business_id = pp.business_id
      LEFT JOIN LATERAL (
        SELECT d.image_url
        FROM public.suggest_default_image(pp.name, pc.name) d
        WHERE v_show_default AND NULLIF(btrim(pp.image_url), '') IS NULL
      ) di ON true
      WHERE pp.id = pr.image_product_id
        AND pp.business_id = pr.business_id
        AND EXISTS (
          SELECT 1 FROM public.promotion_items pi
          WHERE pi.promotion_id = pr.id AND pi.product_id = pp.id
        )
    ) chosen ON chosen.url IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT coalesce(NULLIF(btrim(pp.image_url), ''), di.image_url) AS url,
             NULLIF(btrim(pp.image_url), '') IS NULL AS illustrative
      FROM public.promotion_items pi
      JOIN public.products pp ON pp.id = pi.product_id AND pp.business_id = pi.business_id
      JOIN public.categories pc ON pc.id = pp.category_id AND pc.business_id = pp.business_id
      LEFT JOIN LATERAL (
        SELECT d.image_url
        FROM public.suggest_default_image(pp.name, pc.name) d
        WHERE v_show_default AND NULLIF(btrim(pp.image_url), '') IS NULL
      ) di ON true
      WHERE pi.promotion_id = pr.id
        AND coalesce(NULLIF(btrim(pp.image_url), ''), di.image_url) IS NOT NULL
      ORDER BY (NULLIF(btrim(pp.image_url), '') IS NULL), pi.sort_order, pi.product_id
      LIMIT 1
    ) firstp ON true
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
      -- Una promoción vencida o agotada no se ofrece (ADMIN-PROMO-6 y 7).
      AND (pr.valid_until IS NULL OR now() <= pr.valid_until)
      AND (rem.n IS NULL OR rem.n > 0)
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

REVOKE ALL ON FUNCTION public.build_public_menu(uuid) FROM PUBLIC, anon, authenticated;

-- Misma `resolve_order_lines` de `20261101000000_pedido_manual_en_el_circuito.sql`, con dos reglas nuevas para
-- las promociones: vencida y agotada se rechazan con `P0001` (el motivo de siempre: "ya no está disponible").
CREATE OR REPLACE FUNCTION public.resolve_order_lines(
  p_business_id uuid,
  p_items jsonb,
  p_allow_notes boolean,
  p_allow_free boolean,
  p_max_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_kind text;
  v_id uuid;
  v_quantity integer;
  v_line_name text;
  v_line_price numeric;
  v_line_sold_out boolean;
  v_options jsonb;
  v_note text;
  v_signature text;
  v_resolved jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_total numeric := 0;
  v_position integer := 0;
  -- Unidades de cada promoción dentro de este mismo pedido (ADMIN-PROMO-8).
  v_promo_units jsonb := '{}'::jsonb;
  v_units integer;
  v_remaining integer;
BEGIN
  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
    -- Ítem libre (solo el pedido manual): nombre y precio a mano, sin producto detrás.
    IF p_allow_free
       AND jsonb_typeof(v_item) = 'object'
       AND (v_item -> 'id') IS NULL
       AND (v_item -> 'name') IS NOT NULL THEN
      IF jsonb_typeof(v_item -> 'name') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_item -> 'unit_price') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
         OR (v_item ->> 'quantity') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
      END IF;

      v_line_name := btrim(v_item ->> 'name');
      v_line_price := (v_item ->> 'unit_price')::numeric;
      v_quantity := (v_item ->> 'quantity')::integer;

      IF char_length(v_line_name) NOT BETWEEN 1 AND 100
         OR v_line_price < 0 OR v_line_price > 9999999.99
         OR v_quantity NOT BETWEEN 1 AND p_max_quantity THEN
        RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
      END IF;

      -- La nota la escribe el propio local: no depende del interruptor del negocio.
      v_note := NULL;
      IF jsonb_typeof(v_item -> 'note') = 'string' THEN
        v_note := public.clean_item_note(v_item ->> 'note');
      END IF;

      v_position := v_position + 1;
      v_total := v_total + round(v_line_price, 2) * v_quantity;
      v_lines := v_lines || jsonb_build_object(
        'kind', 'free',
        'name', v_line_name,
        'price', round(v_line_price, 2),
        'quantity', v_quantity,
        'position', v_position,
        'note', v_note
      );

      CONTINUE;
    END IF;

    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item -> 'id') IS DISTINCT FROM 'string'
       OR (v_item ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
       OR (v_item ->> 'quantity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
    END IF;

    v_kind := v_item ->> 'kind';
    v_id := (v_item ->> 'id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    IF v_kind NOT IN ('product', 'promo') OR v_quantity NOT BETWEEN 1 AND p_max_quantity THEN
      RAISE EXCEPTION 'Un producto del pedido no es válido' USING ERRCODE = '22023';
    END IF;

    -- Opciones elegidas (PUBLICO-40): una lista de `{id, quantity}` o nada. Su forma se valida
    -- en `resolve_order_options`; acá solo hace falta que sea una lista para firmar la línea.
    v_options := v_item -> 'options';
    IF v_options IS NULL OR jsonb_typeof(v_options) = 'null' THEN
      v_options := '[]'::jsonb;
    ELSIF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Las opciones de un producto no son válidas' USING ERRCODE = 'P0014';
    END IF;

    -- Un mismo producto puede ir en dos líneas con distinta elección (PUBLICO-43): la línea se
    -- identifica por producto y opciones, sin importar el orden en que vinieron.
    v_signature := coalesce((
      SELECT string_agg(
               lower(coalesce(e ->> 'id', '')) || 'x' || coalesce(e ->> 'quantity', ''),
               ',' ORDER BY lower(coalesce(e ->> 'id', ''))
             )
      FROM jsonb_array_elements(v_options) AS e
    ), '');

    -- Nota del cliente para este producto (PUBLICO-62 a 64): texto libre, se limpia y se recorta a 140. Si el
    -- negocio desactivó las notas, se ignora sin error. Dos líneas con el mismo producto y distinta nota
    -- son líneas distintas, así que la nota entra en la firma.
    v_note := NULL;
    IF p_allow_notes AND jsonb_typeof(v_item -> 'note') = 'string' THEN
      v_note := public.clean_item_note(v_item ->> 'note');
    END IF;
    v_signature := v_signature || '|' || coalesce(v_note, '');

    IF v_kind || ':' || v_id::text || ':' || v_signature = ANY (v_seen) THEN
      RAISE EXCEPTION 'Un producto está repetido en el pedido' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || (v_kind || ':' || v_id::text || ':' || v_signature);

    -- Una promoción o un combo no lleva opciones.
    IF v_kind = 'promo' AND jsonb_array_length(v_options) > 0 THEN
      RAISE EXCEPTION 'Una promoción no lleva opciones' USING ERRCODE = 'P0014';
    END IF;

    v_line_name := NULL;
    v_line_price := NULL;
    v_line_sold_out := NULL;

    IF v_kind = 'product' THEN
      -- Mismo criterio que el menú público: producto activo en una categoría activa.
      SELECT p.name, p.price, p.sold_out
      INTO v_line_name, v_line_price, v_line_sold_out
      FROM public.products p
      JOIN public.categories c
        ON c.id = p.category_id AND c.business_id = p.business_id
      WHERE p.id = v_id
        AND p.business_id = p_business_id
        AND p.active
        AND c.active;
    ELSE
      -- Se bloquea la fila de la promoción hasta el final de la transacción: dos pedidos a la vez no
      -- venden más de lo que queda (ADMIN-PROMO-8). El restante se lee después del bloqueo.
      PERFORM 1
      FROM public.promotions lp
      WHERE lp.id = v_id AND lp.business_id = p_business_id
      FOR UPDATE;

      -- Promoción activa con todos sus productos activos; mismo precio que el menú
      -- público (descuento sobre la suma, o precio fijo del combo).
      SELECT pr.name,
             CASE
               WHEN pr.type = 'combo' THEN pr.price
               ELSE round(t.total * (1 - pr.discount_percent / 100), 2)
             END,
             t.any_sold_out
      INTO v_line_name, v_line_price, v_line_sold_out
      FROM public.promotions pr
      CROSS JOIN LATERAL (
        SELECT count(*) AS n,
               bool_and(p.active) AS all_active,
               bool_or(p.sold_out) AS any_sold_out,
               sum(p.price) AS total
        FROM public.promotion_items i
        JOIN public.products p
          ON p.id = i.product_id AND p.business_id = i.business_id
        WHERE i.promotion_id = pr.id
      ) t
      WHERE pr.id = v_id
        AND pr.business_id = p_business_id
        AND pr.active
        AND t.n > 0
        AND t.all_active
        -- Vencida: pasó su hora de fin (ADMIN-PROMO-6).
        AND (pr.valid_until IS NULL OR now() <= pr.valid_until);

      -- Agotada: lo que queda no alcanza para este pedido, contando las unidades de sus propias líneas
      -- (ADMIN-PROMO-7 y 8). Sin stock cargado, no hay tope.
      IF v_line_name IS NOT NULL THEN
        v_remaining := public.promotion_remaining(v_id);
        v_units := coalesce((v_promo_units ->> v_id::text)::integer, 0);

        IF v_remaining IS NOT NULL AND v_remaining < v_units + v_quantity THEN
          v_line_name := NULL;
        END IF;

        v_promo_units := v_promo_units || jsonb_build_object(v_id::text, v_units + v_quantity);
      END IF;
    END IF;

    IF v_line_name IS NULL OR v_line_price IS NULL THEN
      RAISE EXCEPTION 'Un producto ya no está disponible' USING ERRCODE = 'P0001';
    END IF;

    -- Sin stock: se ve en el menú pero no se puede pedir, solo o dentro de una promoción.
    IF v_line_sold_out THEN
      RAISE EXCEPTION 'Un producto está sin stock' USING ERRCODE = 'P0009';
    END IF;

    -- Opciones y extras (PUBLICO-40 a 42): se validan contra los grupos de ESTE producto y el
    -- precio de cada extra sale de la base, nunca del navegador.
    v_resolved := NULL;
    IF v_kind = 'product' THEN
      v_resolved := public.resolve_order_options(p_business_id, v_id, v_options);
      v_line_price := v_line_price + (v_resolved ->> 'extra')::numeric;
    END IF;

    v_position := v_position + 1;
    v_total := v_total + v_line_price * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'kind', v_kind,
      'id', v_id,
      'name', v_line_name,
      'price', v_line_price,
      'quantity', v_quantity,
      'position', v_position,
      'options', v_resolved -> 'snapshot',
      'note', v_note
    );
  END LOOP;

  RETURN jsonb_build_object('lines', v_lines, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_lines(uuid, jsonb, boolean, boolean, integer)
  FROM PUBLIC, anon, authenticated;
