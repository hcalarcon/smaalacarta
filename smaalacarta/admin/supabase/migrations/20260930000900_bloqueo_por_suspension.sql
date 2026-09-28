-- Negocio suspendido (`active = false`): además de desaparecer de los tres
-- servicios públicos (Etapa 6g), deja de poder editarse desde el panel. Un
-- trigger por tabla, no un cambio en cada función: así cubre tanto lo que pasa
-- por RLS (categorías, productos, promociones, configuración) como lo que usan
-- funciones `SECURITY DEFINER` (pedidos manuales, cambios de estado), que un
-- trigger de tabla intercepta igual, sin tocarlas.
--
-- No se toca `businesses` (ahí ya manda `businesses_guard_admin_columns`, para
-- que el superadmin siga pudiendo reactivar) ni las tablas de solo lectura
-- pública (`public_menu`, `public_business_pdf`, `create_public_order` ya
-- exigen `active` por su cuenta). Solo bloquea alta y edición (no borrado: un
-- negocio suspendido puede seguir ordenando su catálogo).

CREATE OR REPLACE FUNCTION public.guard_business_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid := coalesce(new.business_id, old.business_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = v_business_id AND active
  ) THEN
    RAISE EXCEPTION 'Tu cuenta está suspendida: no se pueden hacer cambios'
      USING ERRCODE = 'P0010';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS categories_guard_active ON public.categories;
CREATE TRIGGER categories_guard_active
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

DROP TRIGGER IF EXISTS products_guard_active ON public.products;
CREATE TRIGGER products_guard_active
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

DROP TRIGGER IF EXISTS promotions_guard_active ON public.promotions;
CREATE TRIGGER promotions_guard_active
  BEFORE INSERT OR UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

DROP TRIGGER IF EXISTS promotion_items_guard_active ON public.promotion_items;
CREATE TRIGGER promotion_items_guard_active
  BEFORE INSERT OR UPDATE ON public.promotion_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

DROP TRIGGER IF EXISTS business_settings_guard_active ON public.business_settings;
CREATE TRIGGER business_settings_guard_active
  BEFORE INSERT OR UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();

DROP TRIGGER IF EXISTS orders_guard_active ON public.orders;
CREATE TRIGGER orders_guard_active
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_active();
