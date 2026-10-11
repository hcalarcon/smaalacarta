// La suscripción que manda el navegador (`subscription.toJSON()`), validada antes de llegar a la base
// (ADMIN-PWA-3). La base vuelve a comprobarla: esto es solo para dar un error claro y no tocar la red.
export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function parseSubscription(input: unknown): { ok: true; value: PushSubscriptionInput } | { ok: false } {
  if (typeof input !== "object" || input === null) return { ok: false };

  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;

  if (
    typeof endpoint !== "string" ||
    !/^https:\/\/.+/.test(endpoint) ||
    endpoint.length > 2048 ||
    typeof p256dh !== "string" ||
    p256dh.trim() === "" ||
    p256dh.length > 512 ||
    typeof auth !== "string" ||
    auth.trim() === "" ||
    auth.length > 512
  ) {
    return { ok: false };
  }

  return { ok: true, value: { endpoint, p256dh, auth } };
}
