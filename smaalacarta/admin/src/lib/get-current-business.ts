import { cache } from "react";
import { redirect } from "next/navigation";

import { accessState } from "@/lib/auth/access";
import { getSuperAdminStatus } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase-server";

// `cache` evita repetir las tres consultas cuando el layout y la página del
// panel piden el negocio en el mismo request.
export const getCurrentBusiness = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: businessUser } = await supabase
    .from("business_users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: business } = businessUser
    ? await supabase
        .from("businesses")
        .select("*")
        .eq("id", businessUser.business_id)
        .maybeSingle()
    : { data: null };

  return {
    user,
    role: businessUser?.role ?? null,
    business,
  };
});

// A dónde va la sesión actual: el negocio, /superadmin, /sin-negocio o /login.
// Solo consulta si es superadmin cuando no hay negocio, que es cuando importa.
export const resolveAccess = cache(async () => {
  const current = await getCurrentBusiness();

  const isSuperAdmin =
    current?.user && !current.business
      ? (await getSuperAdminStatus()).isSuperAdmin
      : false;

  return {
    current,
    isSuperAdmin,
    state: accessState({
      user: current?.user ?? null,
      business: current?.business ?? null,
      isSuperAdmin,
    }),
  };
});

// Para las páginas del panel: devuelve el negocio o redirige. Sin sesión va a
// /login; un superadmin sin negocio, a /superadmin; el resto sin negocio, a
// /sin-negocio (no a /login, que mandaría de vuelta al panel y armaría un bucle).
export async function requireBusiness() {
  const { current, state } = await resolveAccess();

  if (state === "login") redirect("/login");
  if (state === "superadmin") redirect("/superadmin");
  if (state === "sin-negocio") redirect("/sin-negocio");

  return { ...current!, business: current!.business! };
}
