import { NextResponse, type NextRequest } from "next/server";

import { buildPushDeps } from "@/lib/push/deps";
import type { WebhookPayload } from "@/lib/push/events";
import { secretMatches } from "@/lib/push/secret";
import { handlePushWebhook } from "@/lib/push/service";

const NO_STORE = { "cache-control": "no-store" };

// POST /admin/api/push/order (ADMIN-PWA-17). Lo llama el Database Webhook de Supabase sobre `orders`, no un
// navegador: no hay sesión ni CORS, y el secreto del encabezado es lo único que lo autentica (el proxy no
// toca esta ruta). La lógica está en `src/lib/push/`; esto es solo el conector.
export async function POST(request: NextRequest) {
  // Primero el secreto: sin él no se lee el cuerpo ni se abre la base.
  if (!secretMatches(request.headers.get("x-webhook-secret"), process.env.PUSH_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  }

  let deps;
  try {
    deps = buildPushDeps();
  } catch {
    // Falta la clave de servicio o las VAPID: se ve en el registro del webhook.
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  // 200 aunque algún aparato falle: el webhook no tiene que reintentar por eso (ADMIN-PWA-26).
  const result = await handlePushWebhook(deps, payload);

  return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
}
