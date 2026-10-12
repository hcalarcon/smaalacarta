import type { NextRequest } from "next/server";

import { completeOAuth } from "@/lib/mp/oauth";
import { withOAuthCallback } from "@/lib/mp/oauth-http";

// GET /admin/api/mp/oauth/callback (MP-10, MP-11, MP-13, MP-15): a acá vuelve Mercado Pago con `code` y
// `state`. Ningún valor de la conexión sale en la respuesta: siempre se redirige a Configuración.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  return withOAuthCallback((deps, actor) =>
    completeOAuth(deps, actor, {
      code: params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
    }),
  );
}
