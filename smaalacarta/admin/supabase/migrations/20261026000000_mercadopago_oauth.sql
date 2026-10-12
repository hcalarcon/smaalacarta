-- Mercado Pago con OAuth, parte 1: conectar y desconectar la cuenta de un negocio (MP-9 a MP-16).
--
-- - `payment_connections`: la cuenta de Mercado Pago de un negocio. Los tokens van cifrados (AES-256-GCM, lo
--   hace el servidor: la base nunca ve un token en claro) con la versión de la clave. Un negocio tiene una
--   sola conexión y una cuenta de Mercado Pago (`mp_user_id`) está en un solo negocio mientras no esté
--   revocada.
-- - `mp_oauth_states`: un intento de conexión. Solo se guarda el hash del `state` y el `code_verifier` de PKCE
--   cifrado; vence a los 10 minutos y se usa una sola vez (`used_at`).
-- - Las dos tablas tienen RLS activo y SIN políticas, y no se les da ningún permiso a `anon` ni a
--   `authenticated` (igual que `payment_credentials`): solo la clave de servicio las toca. Ni siquiera el dueño
--   del negocio ve su propia fila: el estado "conectado" lo lee el servidor.
-- - `businesses.mp_oauth_enabled`: lista permitida por negocio. Va en `businesses` y no en
--   `business_settings` porque la decide la plataforma (como `courier_delivery`): `business_settings` la edita
--   el dueño con `save_business_settings`. La protege el mismo trigger que el plan y el envío.

CREATE TABLE IF NOT EXISTS public.payment_connections (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  mp_user_id bigint NOT NULL,
  -- Nulos solo al desconectar (`revoked`): los tokens se borran, la fila queda como constancia.
  access_token_enc text,
  refresh_token_enc text,
  key_version smallint NOT NULL,
  expires_at timestamptz,
  scope text,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'needs_reconnect', 'revoked')),
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_connections_tokens_check CHECK (
    status = 'revoked' OR (access_token_enc IS NOT NULL AND refresh_token_enc IS NOT NULL)
  )
);

-- Una cuenta de Mercado Pago en un solo negocio (MP-13). Una conexión revocada no la retiene: la cuenta
-- queda libre para conectarse en otro negocio.
CREATE UNIQUE INDEX IF NOT EXISTS payment_connections_mp_user_idx
  ON public.payment_connections (mp_user_id)
  WHERE status <> 'revoked';

CREATE TABLE IF NOT EXISTS public.mp_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 del `state` en hexadecimal: el valor que viaja por el navegador nunca queda en la base.
  state_hash text NOT NULL UNIQUE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier_enc text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mp_oauth_states_business_idx
  ON public.mp_oauth_states (business_id, created_at DESC);

ALTER TABLE public.payment_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mp_oauth_states FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- El interruptor por negocio (MP-15)
-- ---------------------------------------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS mp_oauth_enabled boolean NOT NULL DEFAULT false;

-- Misma función que `20261018000000_envio_repartos_al_toque.sql`, con dos cambios:
-- - `mp_oauth_enabled` agregada a las columnas que solo mueve un superadmin.
-- - Solo se frena a quien llega por la API (`anon` o `authenticated`): la clave de servicio y una sesión
--   directa de la base (el SQL editor) no tienen `auth.uid()`, así que antes no podían ni prender un plan.
--   `current_setting('role')` es el rol con el que PostgREST corre la consulta; un usuario no puede
--   cambiarlo a otro del que no es miembro.
CREATE OR REPLACE FUNCTION public.guard_business_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated')
     AND NOT public.is_super_admin()
     AND (
       new.plan_pdf IS DISTINCT FROM old.plan_pdf
       OR new.plan_web IS DISTINCT FROM old.plan_web
       OR new.plan_completo IS DISTINCT FROM old.plan_completo
       OR new.active IS DISTINCT FROM old.active
       OR new.courier_delivery IS DISTINCT FROM old.courier_delivery
       OR new.mp_oauth_enabled IS DISTINCT FROM old.mp_oauth_enabled
     )
  THEN
    RAISE EXCEPTION 'Solo un superadmin puede cambiar el plan o el estado del negocio'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;
