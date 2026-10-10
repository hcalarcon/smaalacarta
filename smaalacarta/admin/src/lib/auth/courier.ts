import { cache } from "react";
import { redirect } from "next/navigation";

import { courierAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase-server";

// ¿La sesión actual es la del usuario repartidor? Lo decide la base: `my_courier_id()` solo
// devuelve el repartidor de quien llama, o nulo (ENVIO-3). `cache` evita repetir la consulta
// dentro del mismo request.
export const getCourierStatus = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, courierId: null as string | null, isCourier: false };
  }

  const { data } = await supabase.rpc("my_courier_id");
  const courierId = typeof data === "string" ? data : null;

  return { user, courierId, isCourier: courierId !== null };
});

// Para las páginas de /repartidor. Sin sesión va a /login; quien no es repartidor, a su panel
// (ENVIO-30). Devuelve el usuario y su repartidor: las acciones nunca reciben el id del navegador.
export async function requireCourier() {
  const status = await getCourierStatus();

  const access = courierAccess({ user: status.user, isCourier: status.isCourier });

  if (access === "login") redirect("/login");
  if (access === "panel") redirect("/dashboard");

  return { user: status.user!, courierId: status.courierId! };
}
