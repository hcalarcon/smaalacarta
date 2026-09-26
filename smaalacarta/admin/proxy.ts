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

  const redirect = NextResponse.redirect(new URL(destination, request.url));

  // Conserva las cookies de sesión renovadas en el redirect.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));

  return redirect;
}

export const config = {
  matcher: [
    // Todo salvo archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
