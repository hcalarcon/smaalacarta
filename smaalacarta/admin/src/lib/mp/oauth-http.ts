import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentBusiness } from "@/lib/get-current-business";

import { buildOAuthDeps } from "./oauth-deps";
import type { CallbackResult, OAuthActor, OAuthDeps } from "./oauth";
import type { Reply } from "./service";

// Pegamento de los route handlers de `app/api/mp/oauth/`: la sesión, las dependencias reales y la respuesta.
// Las reglas viven en `oauth.ts`; acá no se decide nada. Nada se cachea y ningún error lleva detalles (MP-16).
const NO_STORE = { "Cache-Control": "no-store" };

// Quién pide, con su rol en el negocio (MP-9). Sin sesión o sin negocio: `null`.
export async function currentActor(): Promise<OAuthActor | null> {
  const current = await getCurrentBusiness();
  if (!current?.user || !current.business) return null;

  return { userId: current.user.id, businessId: current.business.id, role: current.role };
}

export function json(reply: Reply) {
  return NextResponse.json(reply.body, { status: reply.status, headers: NO_STORE });
}

// Corre `handler` con la sesión y las dependencias reales. Sin la clave de servicio responde 503; cualquier
// error inesperado, 500 sin detalles.
export async function withOAuth(handler: (deps: OAuthDeps, actor: OAuthActor | null) => Promise<Reply>) {
  let deps: OAuthDeps;
  try {
    deps = buildOAuthDeps();
  } catch {
    return json({ status: 503, body: { error: "not_configured" } });
  }

  try {
    return json(await handler(deps, await currentActor()));
  } catch {
    return json({ status: 500, body: { error: "server_error" } });
  }
}

// El callback es una navegación del navegador: vuelve siempre a Configuración, con un mensaje genérico.
// `to` es relativo a la app: hay que sumarle el basePath a mano (igual que `proxy.ts`).
export async function withOAuthCallback(
  request: NextRequest,
  handler: (deps: OAuthDeps, actor: OAuthActor | null) => Promise<CallbackResult>,
) {
  const back = (to: string) => {
    const response = NextResponse.redirect(new URL(request.nextUrl.basePath + to, request.url));
    response.headers.set("Cache-Control", "no-store");
    // El code y el state ya no están en la URL de destino; que tampoco viajen en el Referer.
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };

  try {
    const result = await handler(buildOAuthDeps(), await currentActor());
    if (result.kind === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    return back(result.to);
  } catch {
    return back("/dashboard/settings?mp=error");
  }
}
