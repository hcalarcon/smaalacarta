import { cache } from "react";

import { statusFromRow, type TutorialStatus } from "@/lib/courier/tutorial";
import { createClient } from "@/lib/supabase-server";

// Tutorial del repartidor (ENVIO-212). Corre con la sesión del repartidor: de quién es el tutorial lo decide la
// base (`my_courier_id()`), nunca el navegador.

type DbFailure = { error: { code?: string; message?: string } };

// Si ya lo vio, el modo de envíos y un precio de zona para el pedido de práctica. Con `cache`, el layout y la
// página comparten una sola consulta. Si falla, quien llama decide: sin dato no se abre el tutorial.
export const getTutorialStatus = cache(async (): Promise<TutorialStatus> => {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_tutorial_status");

  if (error) {
    throw new Error(error.message);
  }

  return statusFromRow(data);
});

export async function markTutorialSeen(): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_mark_tutorial_seen");

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
