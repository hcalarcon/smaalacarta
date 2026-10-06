import type { NextRequest } from "next/server";

import { withDeps } from "@/lib/mp/http";
import { handleWebhook } from "@/lib/mp/service";

// POST /admin/api/mp/webhook?b=<business_id> (MP-4). Lo llama Mercado Pago, no un navegador: sin CORS.
// El id del pago sale de `data.id` en la URL (lo que Mercado Pago firma) o, si falta, del cuerpo.
export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  let bodyId: string | null = null;
  let bodyType: string | null = null;
  try {
    const body = (await request.json()) as { data?: { id?: unknown }; type?: unknown };
    bodyId = body?.data?.id != null ? String(body.data.id) : null;
    bodyType = typeof body?.type === "string" ? body.type : null;
  } catch {
    // Sin cuerpo JSON: vale lo que venga en la URL.
  }

  return withDeps(request, (deps) =>
    handleWebhook(deps, {
      businessId: params.get("b"),
      dataId: params.get("data.id") ?? bodyId,
      type: params.get("type") ?? bodyType,
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
    }),
  );
}
