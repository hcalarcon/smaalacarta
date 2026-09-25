-- Superadmin: el equipo de SMA a la Carta, que crea los negocios y las cuentas
-- (ADMIN-SUPER). No hay registro público.
--
-- Cómo se cargó el primer superadmin (paso manual, en el SQL Editor de Supabase,
-- después de crear su usuario en Authentication → Users):
--
--   insert into public.super_admins (user_id)
--   select id from public.profiles where email = 'tu@email.com';

-- Quiénes son superadmin. Sin políticas de escritura a propósito: nadie se agrega
-- ni se quita desde la app, ni siquiera un superadmin (ADMIN-SUPER-1). Solo se
-- modifica con SQL o con la clave de servicio.
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admins_select_own ON public.super_admins;
CREATE POLICY super_admins_select_own
ON public.super_admins
FOR SELECT
USING (user_id = (select auth.uid()));

-- ¿El usuario de la sesión es superadmin? SECURITY DEFINER para poder leer
-- `super_admins` desde las políticas de otras tablas sin recursión ni exponer la
-- lista. `search_path` vacío: nada se resuelve por el camino de búsqueda.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins
    WHERE user_id = (select auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Las políticas son solo para `authenticated`: así `anon` no las evalúa (no tiene
-- permiso sobre la función) y sigue viendo listas vacías en lugar de un error.
--
-- Un superadmin ve todos los negocios, todas las membresías y todos los perfiles
-- (ADMIN-SUPER-2), edita cualquier negocio, y asigna y quita miembros
-- (ADMIN-SUPER-4). No tiene acceso a las categorías, productos ni pedidos de los
-- negocios: solo a lo que necesita para administrar cuentas.
DROP POLICY IF EXISTS businesses_select_super_admin ON public.businesses;
CREATE POLICY businesses_select_super_admin
ON public.businesses
FOR SELECT
TO authenticated
USING ((select public.is_super_admin()));

DROP POLICY IF EXISTS businesses_update_super_admin ON public.businesses;
CREATE POLICY businesses_update_super_admin
ON public.businesses
FOR UPDATE
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS business_users_select_super_admin ON public.business_users;
CREATE POLICY business_users_select_super_admin
ON public.business_users
FOR SELECT
TO authenticated
USING ((select public.is_super_admin()));

DROP POLICY IF EXISTS business_users_insert_super_admin ON public.business_users;
CREATE POLICY business_users_insert_super_admin
ON public.business_users
FOR INSERT
TO authenticated
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS business_users_update_super_admin ON public.business_users;
CREATE POLICY business_users_update_super_admin
ON public.business_users
FOR UPDATE
TO authenticated
USING ((select public.is_super_admin()))
WITH CHECK ((select public.is_super_admin()));

DROP POLICY IF EXISTS business_users_delete_super_admin ON public.business_users;
CREATE POLICY business_users_delete_super_admin
ON public.business_users
FOR DELETE
TO authenticated
USING ((select public.is_super_admin()));

DROP POLICY IF EXISTS profiles_select_super_admin ON public.profiles;
CREATE POLICY profiles_select_super_admin
ON public.profiles
FOR SELECT
TO authenticated
USING ((select public.is_super_admin()));

-- El slug del negocio va en URLs: minúsculas, números y guiones (ADMIN-SUPER-5).
-- NOT VALID: se exige en toda fila nueva o modificada sin revisar las que ya
-- existían, para que la migración no falle sobre datos cargados a mano.
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_slug_format
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') NOT VALID;

-- Crear un negocio junto con su primer miembro, dueño, en un solo paso: si algo
-- falla (slug repetido, dueño inexistente) no queda un negocio sin dueño
-- (ADMIN-SUPER-3). Es la única forma de crear negocios: no hay política de INSERT
-- sobre `businesses`. Comprueba el permiso adentro, porque SECURITY DEFINER
-- saltea el RLS de quien la llama.
CREATE OR REPLACE FUNCTION public.create_business_with_owner(
  p_name text,
  p_slug text,
  p_whatsapp text,
  p_owner_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo un superadmin puede crear negocios'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.businesses (name, slug, whatsapp)
  VALUES (p_name, p_slug, NULLIF(p_whatsapp, ''))
  RETURNING id INTO v_business_id;

  INSERT INTO public.business_users (business_id, user_id, role)
  VALUES (v_business_id, p_owner_id, 'owner');

  RETURN v_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_with_owner(text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_with_owner(text, text, text, uuid)
  TO authenticated;
