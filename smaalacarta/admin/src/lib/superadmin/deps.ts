import { getSuperAdminStatus } from "@/lib/auth/superadmin";
import { siteOrigin } from "@/lib/site-origin";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

import type { AccountDeps } from "./accounts";

// Las dependencias reales de `accounts.ts`. Todo pasa por la sesión del usuario
// (y por lo tanto por el RLS), salvo `inviteUser`, que necesita la clave de
// servicio porque crear cuentas es una operación de administración de Supabase.
export async function buildAccountDeps(): Promise<AccountDeps> {
  const supabase = await createClient();
  const origin = await siteOrigin();

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

    inviteUser: async (email, fullName) => {
      let admin;
      try {
        admin = createAdminClient();
      } catch {
        return { error: { code: "service_key_missing" } };
      }

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: fullName ? { full_name: fullName } : undefined,
        // Si la plantilla del mail no usa /auth/confirm (ver docs/PLAN.md), el
        // link por defecto termina acá y desde el login se puede pedir uno nuevo.
        redirectTo: `${origin}/login?error=link`,
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
  };
}
