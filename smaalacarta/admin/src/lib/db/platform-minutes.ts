import { createClient } from "@/lib/supabase-server";

import { ASSIGN_MINUTES_DEFAULT } from "@/lib/orders/assign-minutes";

// A los cuántos minutos sin ofertas se destaca "Nadie ofertó todavía" y se avisa al local (ENVIO-241). Lo lee
// cualquier sesión con la función de la base, la misma que usa `run_order_timers()`. Si la consulta falla, el valor
// de fábrica: mejor avisar a los 5 minutos que no avisar.
export async function getManualAssignMinutes(): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("manual_assign_minutes");

  return !error && typeof data === "number" ? data : ASSIGN_MINUTES_DEFAULT;
}
