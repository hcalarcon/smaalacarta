import { headers } from "next/headers";

import { BASE_PATH } from "./base-path";

// Los links de los mails vuelven a esta app; el origen sale del request.
export async function siteOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;

  const host = requestHeaders.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

// A dónde vuelve el link del mail de recuperar contraseña (ADMIN-AUTH-11): la ruta real lleva el
// basePath. `next` es una ruta del panel, sin basePath: el callback lo suma al redirigir.
export function recoveryRedirectUrl(origin: string) {
  return `${origin}${BASE_PATH}/auth/callback?next=/restablecer`;
}
