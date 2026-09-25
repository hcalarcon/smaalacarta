import "server-only";

import { createClient } from "@supabase/supabase-js";

// Cliente con la clave de servicio (`service_role`): saltea el RLS y tiene
// acceso total a la base y a las cuentas. Reglas:
// - `server-only` hace fallar el build si algo de esto llega al navegador.
// - La variable NO lleva el prefijo NEXT_PUBLIC_, así que Next no la expone.
// - Se usa solo para invitar cuentas (`auth.admin`), y solo después de comprobar
//   que quien pide la acción es superadmin (ADMIN-SUPER-8).
// Se lee al llamar, no al cargar el módulo, para que el build no la necesite.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Project Settings → API Keys → secret key).",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
