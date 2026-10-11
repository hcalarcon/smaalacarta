"use server";

import { headers } from "next/headers";

import { deletePushSubscription, hasPushSubscription, savePushSubscription } from "@/lib/db/push";
import { parseSubscription } from "@/lib/push/subscription";

export type PushActionResult = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos activar los avisos. Probá de nuevo.";

// Guarda la suscripción push de este aparato en la cuenta actual (ADMIN-PWA-2). La cuenta sale de la
// sesión: la acción no recibe ningún id.
export async function savePushSubscriptionAction(subscription: unknown): Promise<PushActionResult> {
  const parsed = parseSubscription(subscription);
  if (!parsed.ok) return { ok: false, error: GENERIC };

  const userAgent = (await headers()).get("user-agent");
  const result = await savePushSubscription(parsed.value, userAgent);

  return "error" in result ? { ok: false, error: GENERIC } : { ok: true };
}

// Saca este aparato de la cuenta actual (ADMIN-PWA-4).
export async function deletePushSubscriptionAction(endpoint: string): Promise<PushActionResult> {
  if (typeof endpoint !== "string" || endpoint === "") return { ok: false, error: GENERIC };

  const result = await deletePushSubscription(endpoint);

  return "error" in result ? { ok: false, error: "No pudimos desactivar los avisos. Probá de nuevo." } : { ok: true };
}

// ¿La cuenta actual tiene este aparato suscripto? El navegador puede seguir suscripto de otra cuenta que
// usó el mismo aparato (ADMIN-PWA-28).
export async function hasPushSubscriptionAction(endpoint: string): Promise<boolean> {
  if (typeof endpoint !== "string" || endpoint === "") return false;

  return hasPushSubscription(endpoint);
}
