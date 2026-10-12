import "server-only";

import { NextResponse } from "next/server";

import { BASE_PATH } from "@/lib/base-path";
import { getCurrentBusiness } from "@/lib/get-current-business";

import { buildOAuthDeps } from "./oauth-deps";
import { SITE_ORIGIN, type CallbackResult, type OAuthActor, type OAuthDeps } from "./oauth";
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
// `to` es relativo a la app. La vuelta se arma con el origen público fijo y el basePath de la configuración
// (MP-17), nunca con `request.url` ni `request.nextUrl`: detrás del rewrite de landing/ la request llega con el
// host del deploy directo de admin/ y con el basePath vacío, y volver ahí da un 404.
export async function withOAuthCallback(
  handler: (deps: OAuthDeps, actor: OAuthActor | null) => Promise<CallbackResult>,
) {
  const back = (to: string) => {
    const response = NextResponse.redirect(new URL(`${SITE_ORIGIN}${BASE_PATH}${to}`));
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
