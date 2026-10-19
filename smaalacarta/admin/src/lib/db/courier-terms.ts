import { cache } from "react";

import { statusFromRow, type TermsStatus } from "@/lib/courier/terms";
import { createClient } from "@/lib/supabase-server";

// Términos para repartidores (ENVIO-180 a 184). Corre con la sesión del repartidor: de quién es la aceptación lo
// decide la base (`my_courier_id()`), nunca el navegador.

type DbFailure = { error: { code?: string; message?: string } };

// El estado del propio repartidor. Con `cache`, el layout y la página comparten una sola consulta. Si la base
// falla, el error llega a la página: no se asume que aceptó ni que no hace falta.
export const getCourierTermsStatus = cache(async (): Promise<TermsStatus> => {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_terms_status");

  if (error) {
    throw new Error(error.message);
  }

  return statusFromRow(data);
});

// Acepta la versión que el repartidor leyó. Si ya no es la vigente, la base da `22023`.
export async function acceptCourierTerms(version: number): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_accept_terms", { p_version: version });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
