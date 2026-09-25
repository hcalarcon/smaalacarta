import { getSuperAdminStatus } from "@/lib/auth/superadmin";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

import type { AccountDeps } from "./accounts";
import { generateTempPassword } from "./password";

const SERVICE_KEY_MISSING = { error: { code: "service_key_missing" } };

// El cliente con la clave de servicio, o null si el servidor no la tiene. Las
// funciones que lo usan devuelven un error claro en vez de romper la página.
function adminClientOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

// Las dependencias reales de `accounts.ts`. Todo pasa por la sesión del usuario
// (y por lo tanto por el RLS), salvo crear cuentas y cambiar contraseñas, que son
// operaciones de administración de Supabase y necesitan la clave de servicio.
export async function buildAccountDeps(): Promise<AccountDeps> {
  const supabase = await createClient();

  return {
    isSuperAdmin: async () => (await getSuperAdminStatus()).isSuperAdmin,

    findProfileIdByEmail: async (email) => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      return data?.id ?? null;
    },

    slugExists: async (slug) => {
      const { count } = await supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("slug", slug);

      return (count ?? 0) > 0;
    },

    createAccount: async (email, fullName, password) => {
      const admin = adminClientOrNull();
      if (!admin) return SERVICE_KEY_MISSING;

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        // Ya confirmada: no se envía ningún mail.
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
        // `app_metadata` solo lo escribe el servidor: el usuario no puede borrar
        // la marca de contraseña temporal (ADMIN-SUPER-10).
        app_metadata: { must_change_password: true },
      });

      if (error || !data.user) {
        return { error: { code: error?.code, message: error?.message } };
      }

      return { id: data.user.id };
    },

    createBusiness: async ({ name, slug, whatsapp, ownerId }) => {
      const { data, error } = await supabase.rpc("create_business_with_owner", {
        p_name: name,
        p_slug: slug,
        p_whatsapp: whatsapp,
        p_owner_id: ownerId,
      });

      if (error) {
        return { error: { code: error.code, message: error.message } };
      }

      return { id: data as string };
    },

    addMember: async ({ businessId, userId, role }) => {
      const { error } = await supabase
        .from("business_users")
        .insert({ business_id: businessId, user_id: userId, role });

      return error
        ? { error: { code: error.code, message: error.message } }
        : {};
    },

    getMemberEmail: async (businessId, userId) => {
      const { data } = await supabase
        .from("business_users")
        .select("profiles(email)")
        .eq("business_id", businessId)
        .eq("user_id", userId)
        .maybeSingle();

      const profile = data?.profiles as unknown as { email: string | null } | null;
      return profile?.email ?? null;
    },

    isSuperAdminUser: async (userId) => {
      // `super_admins` solo deja leer la fila propia: para mirar la de otro hace
      // falta la clave de servicio. Si no está, se asume que sí lo es (se rechaza).
      const admin = adminClientOrNull();
      if (!admin) return true;

      const { data } = await admin
        .from("super_admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      return !!data;
    },

    setTemporaryPassword: async (userId, password) => {
      const admin = adminClientOrNull();
      if (!admin) return SERVICE_KEY_MISSING;

      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        app_metadata: { must_change_password: true },
      });

      return error ? { error: { code: error.code, message: error.message } } : {};
    },

    generatePassword: generateTempPassword,
  };
}
