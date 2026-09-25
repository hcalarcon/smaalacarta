import { cache } from "react";
import { redirect } from "next/navigation";

import { superAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase-server";

// ¿La sesión actual es de un superadmin? Lo decide la base: `super_admins` solo
// deja leer a cada uno su propia fila, así que si aparece es porque lo es.
// `cache` evita repetir la consulta dentro del mismo request.
export const getSuperAdminStatus = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isSuperAdmin: false };
  }

  const { data } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, isSuperAdmin: !!data };
});

// Para las páginas de /superadmin. Sin sesión va a /login; un usuario común, a
// su panel, sin ver nada de lo que hay acá (ADMIN-SUPER-7).
export async function requireSuperAdmin() {
  const status = await getSuperAdminStatus();

  const access = superAdminAccess({
    user: status.user,
    isSuperAdmin: status.isSuperAdmin,
  });

  if (access === "login") redirect("/login");
  if (access === "panel") redirect("/dashboard");

  return status.user!;
}
