-- `explorar.smaalacarta.com.ar` es el directorio público de locales (proyecto propio
-- en Vercel): ningún negocio puede tener ese slug (ADMIN-SUPER-12). Se agrega a la
-- lista de la migración 20260928000000, que ya está en main y no se edita.
-- NOT VALID: se exige en todo negocio nuevo o modificado, sin revisar los existentes.
ALTER TABLE public.businesses DROP CONSTRAINT businesses_slug_reserved;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_slug_reserved
  CHECK (slug NOT IN (
    'www', 'app', 'admin', 'api', 'demo', 'demos', 'moderno', 'clasico', 'minimal',
    'mail', 'static', 'assets', 'cdn', 'dev', 'staging', 'panel', 'login', 'landing',
    'explorar'
  )) NOT VALID;
