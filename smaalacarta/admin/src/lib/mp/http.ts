import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { corsHeaders } from "./cors";
import { buildMpDeps } from "./deps";
import type { MpDeps, Reply } from "./service";

const production = () => process.env.NODE_ENV === "production";

// Pegamento de los route handlers (`app/api/mp/*`): CORS, armado de dependencias y respuesta JSON.
// Las reglas viven en `service.ts`; acá no se decide nada.
export function cors(request: NextRequest) {
  return corsHeaders(request.headers.get("origin"), production());
}

export function preflight(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export function json(request: NextRequest, reply: Reply) {
  return NextResponse.json(reply.body, {
    status: reply.status,
    headers: { ...cors(request), "Cache-Control": "no-store" },
  });
}

// Corre `handler` con las dependencias reales. Sin la clave de servicio responde 503; cualquier error
// inesperado, 500 sin detalles (el token y el motivo nunca salen: MP-7).
export async function withDeps(request: NextRequest, handler: (deps: MpDeps) => Promise<Reply>) {
  let deps: MpDeps;
  try {
    deps = buildMpDeps();
  } catch {
    return json(request, { status: 503, body: { error: "not_configured" } });
  }

  try {
    return json(request, await handler(deps));
  } catch {
    return json(request, { status: 500, body: { error: "server_error" } });
  }
}
