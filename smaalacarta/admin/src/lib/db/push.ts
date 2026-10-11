import type { PushSubscriptionInput } from "@/lib/push/subscription";
import { createClient } from "@/lib/supabase-server";

// Suscripciones push de quien tiene la sesión (ADMIN-PWA-1 a 4). El usuario sale de la sesión, nunca del
// navegador: la base filtra por `auth.uid()`, no por un `business_id` (la cuenta repartidor no tiene negocio).

type DbFailure = { error: { code?: string; message?: string } };

// Guarda la suscripción de este aparato en la cuenta actual; si estaba en otra cuenta, pasa a esta.
export async function savePushSubscription(
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    ...(userAgent ? { p_user_agent: userAgent } : {}),
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Borra la suscripción propia de este aparato.
export async function deletePushSubscription(endpoint: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// ¿Este aparato está suscripto a la cuenta actual? El RLS solo deja ver las propias.
export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("endpoint", endpoint)
    .maybeSingle();

  return data !== null;
}
