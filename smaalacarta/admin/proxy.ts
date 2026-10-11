import { NextResponse, type NextRequest } from "next/server";

import { hasTemporaryPassword, redirectForRoute } from "@/lib/auth/access";
import { updateSession } from "@/lib/supabase-proxy";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const destination = redirectForRoute(
    request.nextUrl.pathname,
    !!user,
    hasTemporaryPassword(user?.app_metadata),
  );

  if (!destination) {
    return response;
  }

  // `destination` es relativo a la app (sin basePath, igual que `pathname`
  // más abajo): hay que agregarlo a mano, `new URL` no lo hace sola.
  const redirect = NextResponse.redirect(
    new URL(request.nextUrl.basePath + destination, request.url),
  );

  // Conserva las cookies de sesión renovadas en el redirect.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));

  return redirect;
}

export const config = {
  matcher: [
    // Todo salvo archivos estáticos, imágenes y los endpoints sin sesión: el menú y Mercado Pago llaman a
    // api/mp/, y el Database Webhook de Supabase a api/push/; se autentican solos. El service worker, el
    // manifest y los íconos de la app instalada tampoco pueden pasar por la redirección a /login.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|api/mp/|api/push/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
