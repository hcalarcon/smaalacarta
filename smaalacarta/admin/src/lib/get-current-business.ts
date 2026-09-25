import { cache } from "react";
import { redirect } from "next/navigation";

import { accessState } from "@/lib/auth/access";
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

// Para las páginas del panel: devuelve el negocio o redirige. Sin sesión va a
// /login; con sesión pero sin negocio va a /sin-negocio (no a /login, que
// mandaría de vuelta al panel y armaría un bucle).
export async function requireBusiness() {
  const current = await getCurrentBusiness();

  const state = accessState({
    user: current?.user ?? null,
    business: current?.business ?? null,
  });

  if (state === "login") redirect("/login");
  if (state === "sin-negocio") redirect("/sin-negocio");

  return { ...current!, business: current!.business! };
}
