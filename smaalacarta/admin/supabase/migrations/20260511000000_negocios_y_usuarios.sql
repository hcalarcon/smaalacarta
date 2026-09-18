-- Base: perfiles, negocios y quién pertenece a cada negocio.
--
-- Estas tablas existían en el proyecto original pero nunca estuvieron en una
-- migración, y todas las demás dependen de ellas (FK a businesses, políticas
-- que leen business_users). Reconstruidas desde src/types/database.ts; va
-- fechada antes que las demás para que un proyecto vacío se arme en orden.

-- Perfiles: uno por usuario de auth, creado solo al registrarse (ADMIN-AUTH-1).
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Negocios: cada cliente de SMA a la Carta.
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  whatsapp text,
  logo_url text,
  created_at timestamptz DEFAULT now()
);

-- Miembros: qué usuario administra qué negocio. Es la tabla que consultan
-- todas las políticas de RLS de las tablas del negocio.
CREATE TABLE IF NOT EXISTS public.business_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS business_users_user_id_idx ON public.business_users(user_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve y edita solo su perfil.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Cada usuario ve solo sus propias membresías. Sin esta política las
-- subconsultas de las demás tablas no encontrarían ninguna fila.
DROP POLICY IF EXISTS business_users_select_own ON public.business_users;
CREATE POLICY business_users_select_own
ON public.business_users
FOR SELECT
USING (user_id = auth.uid());

-- Un miembro ve y edita los datos de su negocio (ADMIN-AUTH-3). Crear
-- negocios y asignar miembros queda fuera del admin por ahora: se hace desde
-- el panel de Supabase o con la service role.
DROP POLICY IF EXISTS businesses_select_member ON public.businesses;
CREATE POLICY businesses_select_member
ON public.businesses
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = businesses.id
  )
);

DROP POLICY IF EXISTS businesses_update_member ON public.businesses;
CREATE POLICY businesses_update_member
ON public.businesses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = businesses.id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = businesses.id
  )
);
