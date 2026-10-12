import "server-only";

import { createAdminClient } from "@/lib/supabase-admin";

export type MpConnectionStatus = "connected" | "needs_reconnect" | "none";

// Si el negocio tiene la cuenta de Mercado Pago conectada, para pintar Configuración. Lee con la clave de
// servicio porque `payment_connections` no tiene políticas (MP-12), y solo el estado: ningún token ni id sale
// de acá (MP-16). Se llama después de `requireBusiness()`, con el negocio de la sesión.
export async function getMpConnectionStatus(businessId: string): Promise<MpConnectionStatus> {
  const { data, error } = await createAdminClient()
    .from("payment_connections")
    .select("status")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.status === "connected") return "connected";
  if (data?.status === "needs_reconnect") return "needs_reconnect";
  return "none";
}

// La sección solo se muestra con los dos interruptores prendidos (MP-15).
export const mpOauthAvailable = (business: { mp_oauth_enabled: boolean }) =>
  process.env.MP_OAUTH_ENABLED === "true" && business.mp_oauth_enabled;
