-- Tiempo de preparación estimado por el local (ADMIN-PEDIDOS-31 a 38, ADMIN-CONFIG-49 y 50, SEGUIMIENTO-37).
--
-- El local indica cuánto tarda al aceptar el pedido y puede demorarlo; el cliente lo ve en el seguimiento solo si
-- el negocio lo activó. Es una estimación: la base entrega una ventana de 10 minutos, nunca una promesa.
--
-- - `business_settings.show_prep_time` (apagado por defecto) y `default_prep_minutes` (20, entre 5 y 180).
-- - `orders.prep_ready_at`, `prep_reason` (busy, weather, supply, other) y `prep_updated_at`.
-- - `order_events.kind` suma `'prep'`: el evento de cada vez que el local carga o demora el tiempo. Los lectores
--   de la línea de tiempo filtran por `kind = 'status'`, así que no es un paso.
-- - `set_order_prep()` con los permisos de quien la llama (un miembro del negocio del pedido; el RLS de `orders`
--   hace el resto). El bloqueo por suspensión de `20260930000900_bloqueo_por_suspension.sql` es un trigger de
--   `orders`, así que alcanza al UPDATE sin tocar la función.
-- - `suggested_prep_minutes()`: la mediana de lo que tardó el negocio entre Confirmado y Listo.
-- - Misma `save_business_settings` de `20261029000000_notas_por_item.sql`, con `p_show_prep_time` y
--   `p_default_prep_minutes`: se reemplaza la versión anterior. Los dos nuevos van en NULL por defecto y, si no
--   llegan, no pisan lo guardado (una app vieja que guarda la configuración no apaga el interruptor).
-- - Misma `public_order_tracking` de `20261029000000_notas_por_item.sql`, con `pedido.prep`.
--
-- El RLS de `business_settings` y de `orders` no cambia: son columnas nuevas de tablas que ya filtran por
-- `business_id`.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS show_prep_time boolean NOT NULL DEFAULT false;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS default_prep_minutes integer NOT NULL DEFAULT 20;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_default_prep_minutes_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_default_prep_minutes_check
  CHECK (default_prep_minutes BETWEEN 5 AND 180);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS prep_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_reason text,
  ADD COLUMN IF NOT EXISTS prep_updated_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_prep_reason_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_prep_reason_check
  CHECK (prep_reason IS NULL OR prep_reason IN ('busy', 'weather', 'supply', 'other'));

ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS order_events_kind_check;
ALTER TABLE public.order_events
  ADD CONSTRAINT order_events_kind_check CHECK (kind IN ('status', 'payment', 'delivery', 'prep'));

-- ---------------------------------------------------------------------------
-- set_order_prep: el local carga o demora el tiempo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_order_prep(
  p_order_id uuid,
  p_ready_in_minutes integer,
  p_reason text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_order record;
  v_ready timestamptz;
BEGIN
  IF p_ready_in_minutes IS NULL OR p_ready_in_minutes NOT BETWEEN 5 AND 180 THEN
    RAISE EXCEPTION 'El tiempo tiene que estar entre 5 y 180 minutos' USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NOT NULL AND v_reason NOT IN ('busy', 'weather', 'supply', 'other') THEN
    RAISE EXCEPTION 'Motivo desconocido' USING ERRCODE = '22023';
  END IF;

  -- Con los permisos de quien llama: un pedido de otro negocio no se ve, y es como si no existiera.
  SELECT o.id, o.business_id, o.status, o.scheduled_for, o.preorder
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status NOT IN ('confirmed', 'preparing') THEN
    RAISE EXCEPTION 'El tiempo se carga con el pedido confirmado o en preparación' USING ERRCODE = 'P0004';
  END IF;

  -- Un pedido programado o anticipado ya tiene su hora.
  IF v_order.scheduled_for IS NOT NULL OR v_order.preorder THEN
    RAISE EXCEPTION 'Un pedido programado o anticipado ya tiene su hora' USING ERRCODE = 'P0004';
  END IF;

  v_ready := now() + make_interval(mins => p_ready_in_minutes);

  UPDATE public.orders
  SET prep_ready_at = v_ready,
      prep_reason = v_reason,
      prep_updated_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, business_id, status, kind, changed_by, note)
  VALUES (
    p_order_id,
    v_order.business_id,
    v_order.status,
    'prep',
    (select auth.uid()),
    'Tiempo estimado: ' || p_ready_in_minutes || ' min' || coalesce(' · ' || v_reason, '')
  );

  RETURN v_ready;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_prep(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_prep(uuid, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- suggested_prep_minutes: la mediana de lo que tarda el negocio
-- ---------------------------------------------------------------------------

-- Mediana de los minutos entre Confirmado y Listo de los últimos 20 pedidos del negocio que llegaron a Listo
-- (sin los cancelados). No cuenta los de más de 3 horas ni los que no pasaron tiempo. Con menos de 5 muestras,
-- nulo: el panel usa el tiempo por defecto. SECURITY DEFINER para leer los eventos sin depender de su RLS,
-- pero solo responde a un miembro del negocio.
CREATE OR REPLACE FUNCTION public.suggested_prep_minutes(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_samples integer;
  v_median numeric;
BEGIN
  IF (select auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.business_id = p_business_id AND bu.user_id = (select auth.uid())
  ) THEN
    RETURN NULL;
  END IF;

  WITH recent_orders AS (
    SELECT o.id
    FROM public.orders o
    WHERE o.business_id = p_business_id AND o.status <> 'cancelled'
    ORDER BY o.created_at DESC
    LIMIT 100
  ),
  finished AS (
    SELECT min(e.created_at) FILTER (WHERE e.status = 'confirmed') AS confirmed_at,
           max(e.created_at) FILTER (WHERE e.status = 'ready') AS ready_at
    FROM public.order_events e
    JOIN recent_orders r ON r.id = e.order_id
    WHERE e.kind = 'status' AND e.status IN ('confirmed', 'ready')
    GROUP BY e.order_id
  ),
  last_twenty AS (
    SELECT extract(epoch FROM f.ready_at - f.confirmed_at) / 60 AS minutes
    FROM finished f
    WHERE f.confirmed_at IS NOT NULL AND f.ready_at IS NOT NULL
    ORDER BY f.ready_at DESC
    LIMIT 20
  )
  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
  INTO v_samples, v_median
  FROM last_twenty
  WHERE minutes > 0 AND minutes <= 180;

  IF v_samples < 5 THEN
    RETURN NULL;
  END IF;

  RETURN greatest(5, least(180, round(v_median)::integer));
END;
$$;

REVOKE ALL ON FUNCTION public.suggested_prep_minutes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggested_prep_minutes(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- save_business_settings: con el interruptor y el tiempo por defecto
-- ---------------------------------------------------------------------------

-- `save_business_settings` gana dos parámetros: se reemplaza la versión anterior.
DROP FUNCTION IF EXISTS public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer, boolean, boolean
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
  p_show_default_images boolean DEFAULT true,
  p_allow_item_notes boolean DEFAULT true,
  p_show_prep_time boolean DEFAULT NULL,
  p_default_prep_minutes integer DEFAULT NULL
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
     header_image_x, header_image_y, show_default_images, allow_item_notes,
     show_prep_time, default_prep_minutes)
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
     p_header_image_x, p_header_image_y, p_show_default_images, p_allow_item_notes,
     coalesce(p_show_prep_time, false), coalesce(p_default_prep_minutes, 20))
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
      allow_item_notes = EXCLUDED.allow_item_notes,
      -- Una llamada que no manda los dos parámetros nuevos no pisa lo que el negocio ya guardó.
      show_prep_time = coalesce(p_show_prep_time, public.business_settings.show_prep_time),
      default_prep_minutes = coalesce(p_default_prep_minutes, public.business_settings.default_prep_minutes),
      updated_at = now();

  UPDATE public.businesses
  SET whatsapp = NULLIF(p_whatsapp, '')
  WHERE id = p_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer, boolean, boolean, boolean, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_settings(
  uuid, boolean, text, text, text, text, text, jsonb, text, text, text, text, boolean, text, date, text, text, text,
  text[], text[], text, text, boolean, integer, boolean, jsonb, integer, integer, boolean, boolean, boolean, integer
) TO authenticated;

-- ---------------------------------------------------------------------------
-- public_order_tracking: con el tiempo estimado
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.public_order_tracking(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_prep jsonb;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN
    RETURN NULL;
  END IF;

  SELECT o.id, o.order_number, o.status, o.total, o.created_at, o.updated_at, o.scheduled_for,
         o.preorder, o.payment, o.payment_status, o.delivery,
         o.prep_ready_at, o.prep_reason, o.prep_updated_at,
         b.name AS business_name, b.whatsapp, b.slug,
         s.template, s.primary_color, s.secondary_color, s.header_image_url,
         s.header_image_x, s.header_image_y, s.show_prep_time
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.business_settings s ON s.business_id = b.id
  WHERE o.code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- El tiempo estimado (SEGUIMIENTO-37): solo si el negocio lo muestra, el pedido está en Confirmado o En
  -- preparación y no tiene ya su hora (programado o anticipado). La ventana de 10 minutos es
  -- PREP_WINDOW_MINUTES (admin/src/lib/orders/prep.ts y web/apps/tracker/lib/prep.js).
  IF coalesce(v_order.show_prep_time, false)
     AND v_order.status IN ('confirmed', 'preparing')
     AND v_order.scheduled_for IS NULL
     AND NOT v_order.preorder
     AND v_order.prep_ready_at IS NOT NULL THEN
    v_prep := jsonb_build_object(
      'desde', v_order.prep_ready_at,
      'hasta', v_order.prep_ready_at + interval '10 minutes',
      'actualizado', v_order.prep_updated_at,
      'motivo', v_order.prep_reason
    );
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'negocio', jsonb_build_object(
      'nombre', v_order.business_name,
      'telefono', v_order.whatsapp,
      'slug', v_order.slug,
      'plantilla', v_order.template,
      'colores', jsonb_build_object(
        'primary', v_order.primary_color,
        'secondary', v_order.secondary_color
      ),
      'imagen', v_order.header_image_url,
      'posicion', CASE
        WHEN v_order.header_image_x IS NOT NULL
        THEN jsonb_build_object('x', v_order.header_image_x, 'y', v_order.header_image_y)
      END
    ),
    'pedido', jsonb_build_object(
      'numero', v_order.order_number,
      'estado', v_order.status,
      'total', v_order.total,
      'creado', v_order.created_at,
      'actualizado', v_order.updated_at,
      'programado', v_order.scheduled_for,
      -- Solo los pedidos con Mercado Pago llevan estado de pago; nunca el id del pago (SEGUIMIENTO-21).
      'pago', CASE WHEN v_order.payment = 'mercadopago' THEN v_order.payment_status END,
      'anticipado', CASE WHEN v_order.preorder THEN true END,
      'entrega', v_order.delivery,
      'prep', v_prep
    ),
    'items', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'nombre', i.name,
                 'cantidad', i.quantity,
                 'precio', i.unit_price,
                 -- Foto de lo elegido (SEGUIMIENTO-22): grupo, nombre, cantidad y precio, sin ids.
                 'opciones', i.options,
                 -- Lo que el cliente pidió para este producto (SEGUIMIENTO-36).
                 'nota', i.note
               )
               ORDER BY i.sort_order, i.id
             )
      FROM public.order_items i
      WHERE i.order_id = v_order.id
    ), '[]'::jsonb),
    'eventos', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object('estado', e.status, 'fecha', e.created_at, 'nota', e.note)
               ORDER BY e.created_at, e.id
             )
      FROM public.order_events e
      WHERE e.order_id = v_order.id AND e.kind = 'status'
    ), '[]'::jsonb)
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.public_order_tracking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_tracking(text) TO anon, authenticated;
