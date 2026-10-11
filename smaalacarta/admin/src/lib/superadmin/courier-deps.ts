import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

import { buildAccountDeps } from "./deps";
import type { CourierAccountDeps } from "./couriers";

// El cliente con la clave de servicio, o null si el servidor no la tiene.
function adminClientOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

// Las dependencias del alta de repartidores (ENVIO-55): las de `accounts.ts` más cómo se crea el
// repartidor, de quién es la cuenta y para qué se usa una cuenta que ya existe.
export async function buildCourierDeps(): Promise<CourierAccountDeps> {
  const base = await buildAccountDeps();
  const supabase = await createClient();

  return {
    ...base,

    accountUse: async (userId) => {
      // Mirar si es superadmin o miembro de un negocio necesita la clave de servicio. Sin ella se
      // asume lo peor (se rechaza): nunca se reutiliza una cuenta sin poder comprobarla.
      const admin = adminClientOrNull();
      if (!admin) return "super_admin";

      const [superAdmin, courier, business] = await Promise.all([
        admin.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle(),
        admin.from("courier_users").select("user_id").eq("user_id", userId).maybeSingle(),
        admin.from("business_users").select("user_id").eq("user_id", userId).limit(1),
      ]);

      if (superAdmin.data) return "super_admin";
      if (courier.data) return "courier";
      if ((business.data ?? []).length > 0) return "business";
      return "free";
    },

    createCourier: async ({ name, whatsapp, userId }) => {
      const { data, error } = await supabase.rpc("create_courier_with_user", {
        p_name: name,
        p_whatsapp: whatsapp,
        p_user_id: userId,
      });

      if (error) {
        return { error: { code: error.code, message: error.message } };
      }

      return { id: data as string };
    },

    getCourierAccount: async (courierId) => {
      const { data: link } = await supabase
        .from("courier_users")
        .select("user_id")
        .eq("courier_id", courierId)
        .maybeSingle();

      if (!link) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", link.user_id)
        .maybeSingle();

      return profile?.email ? { userId: link.user_id, email: profile.email } : null;
    },
  };
}
