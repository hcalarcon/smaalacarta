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
  const startedAt = Date.now();

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

  // Para medir (ENVIO-172): `lagMs` es lo que pasó entre el cambio en la base y la llegada del webhook (incluye
  // el arranque de la función); `handlerMs`, lo que tardó acá en consultar y mandar los avisos.
  const updatedAt = payload.record?.updated_at ? Date.parse(payload.record.updated_at) : NaN;
  const timings = {
    lagMs: Number.isNaN(updatedAt) ? null : startedAt - updatedAt,
    handlerMs: Date.now() - startedAt,
  };
  console.info("push/order", { type: payload.type, ...result, ...timings });

  return NextResponse.json({ ok: true, ...result, ...timings }, { headers: NO_STORE });
}
