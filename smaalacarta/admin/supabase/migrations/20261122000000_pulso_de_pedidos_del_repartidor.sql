-- Pulso de pedidos del repartidor (ENVIO-208 y 209).
--
-- El panel del repartidor no se enteraba al instante de un cambio: `orders` solo lo puede leer el negocio (el
-- repartidor ve los pedidos por funciones con SECURITY DEFINER), y Supabase Realtime aplica el RLS de la tabla a
-- cada suscriptor, así que a su cuenta no le llegaba ningún evento de `orders` y le quedaba la consulta periódica.
-- No se abre `orders` a los repartidores (expondría los datos del cliente): se agrega una tabla de pulso, sin datos
-- de nadie, que sube para cada repartidor al que el cambio le importa. Cada uno lee solo su fila.
--
-- - `courier_order_pulse`: una fila por repartidor (`courier_id`), con el último pedido que lo tocó (`order_id`, sin
--   clave foránea: es solo una pista) y la hora. Un upsert por repartidor, así que no crece: nunca hay más filas que
--   repartidores, y no se borra nada (un borrado se emitiría a todos los suscriptores, porque Realtime no le aplica
--   RLS a los DELETE).
-- - El trigger de `orders` pulsa a quien tiene que volver a pedir sus datos: el repartidor asignado (y el anterior, si
--   el pedido se devolvió), los que ven el pedido en Disponibles según `courier_sees_order()` —la misma regla de
--   `courier_available_orders()`— y los que tienen una oferta en él. Cuando un pedido deja de estar en búsqueda, un
--   trigger BEFORE pulsa a quienes lo veían ANTES del cambio (después de la actualización ya no cumplen la regla), para
--   que se les retire de Disponibles.
-- - Escritura solo por los triggers: la tabla no tiene políticas de insert, update ni delete.
--
-- Tabla nueva con RLS por `courier_id`, no por `business_id` (la cuenta repartidor no tiene negocio): mismo criterio
-- que `courier_preferences` y `courier_availability`.

CREATE TABLE IF NOT EXISTS public.courier_order_pulse (
  courier_id uuid PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  pulsed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courier_order_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_order_pulse_select_own ON public.courier_order_pulse;
CREATE POLICY courier_order_pulse_select_own
ON public.courier_order_pulse
FOR SELECT TO authenticated
USING (courier_id = (select public.my_courier_id()));

REVOKE ALL ON public.courier_order_pulse FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.courier_order_pulse FROM authenticated;
GRANT SELECT ON public.courier_order_pulse TO authenticated;

-- Sube el pulso de estos repartidores. Se ordenan para tomar los candados siempre en el mismo orden: dos pedidos que
-- cambian a la vez no se traban entre sí.
CREATE OR REPLACE FUNCTION public.pulse_couriers(p_order_id uuid, p_couriers uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.courier_order_pulse AS p (courier_id, order_id, pulsed_at)
  SELECT c.id, p_order_id, now()
  FROM (SELECT DISTINCT x AS id FROM unnest(p_couriers) AS x WHERE x IS NOT NULL ORDER BY x) c
  ON CONFLICT (courier_id) DO UPDATE SET order_id = EXCLUDED.order_id, pulsed_at = EXCLUDED.pulsed_at;
$$;

REVOKE ALL ON FUNCTION public.pulse_couriers(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- A quién le importa el pedido tal como está ahora: el asignado, los que lo ven en Disponibles (la regla de
-- `courier_available_orders()`) y los que ofertaron.
CREATE OR REPLACE FUNCTION public.order_pulse_audience(p_order_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT a.id), '{}'::uuid[])
  FROM (
    SELECT o.courier_id AS id
    FROM public.orders o
    WHERE o.id = p_order_id AND o.courier_id IS NOT NULL
    UNION
    SELECT cc.courier_id
    FROM public.orders o
    JOIN public.courier_zone_coverage cc ON cc.zone_id = o.delivery_zone_id
    WHERE o.id = p_order_id AND public.courier_sees_order(o.id, cc.courier_id)
    UNION
    SELECT f.courier_id
    FROM public.courier_offers f
    WHERE f.order_id = p_order_id
  ) a
$$;

REVOKE ALL ON FUNCTION public.order_pulse_audience(uuid) FROM PUBLIC, anon, authenticated;

-- Después del cambio: los que ven el pedido ahora, el asignado y, si lo devolvieron, el que lo tenía.
CREATE OR REPLACE FUNCTION public.orders_pulse_couriers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Un pedido sin envío con repartidor no le importa a ninguno.
  IF NEW.delivery_zone_id IS NULL AND NEW.courier_id IS NULL AND OLD.courier_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.pulse_couriers(
    NEW.id,
    public.order_pulse_audience(NEW.id) || ARRAY[OLD.courier_id]
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_pulse_couriers() FROM PUBLIC, anon, authenticated;

-- En un INSERT no hay OLD: es la misma lógica sin el repartidor anterior.
CREATE OR REPLACE FUNCTION public.orders_pulse_couriers_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.delivery_zone_id IS NOT NULL OR NEW.courier_id IS NOT NULL THEN
    PERFORM public.pulse_couriers(NEW.id, public.order_pulse_audience(NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_pulse_couriers_insert() FROM PUBLIC, anon, authenticated;

-- Antes del cambio: si el pedido deja de estar en búsqueda, los que lo veían ahora tienen que retirarlo de
-- Disponibles. La fila todavía es la vieja, así que `courier_sees_order()` contesta como contestaba.
CREATE OR REPLACE FUNCTION public.orders_pulse_couriers_leaving()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.courier_status = 'searching'
     AND (NEW.courier_status IS DISTINCT FROM OLD.courier_status
          OR NEW.courier_id IS DISTINCT FROM OLD.courier_id
          OR NEW.status IN ('delivered', 'cancelled')) THEN
    PERFORM public.pulse_couriers(OLD.id, public.order_pulse_audience(OLD.id));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_pulse_couriers_leaving() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_pulse_couriers_leaving ON public.orders;
CREATE TRIGGER orders_pulse_couriers_leaving
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_pulse_couriers_leaving();

DROP TRIGGER IF EXISTS orders_pulse_couriers_insert ON public.orders;
CREATE TRIGGER orders_pulse_couriers_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_pulse_couriers_insert();

DROP TRIGGER IF EXISTS orders_pulse_couriers ON public.orders;
CREATE TRIGGER orders_pulse_couriers
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_pulse_couriers();

-- Realtime, solo si la publicación existe (en los tests con PGlite no está).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'courier_order_pulse'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_order_pulse;
  END IF;
END;
$$;
