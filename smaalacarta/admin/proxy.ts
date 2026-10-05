import { NextResponse, type NextRequest } from "next/server";

import { hasTemporaryPassword, redirectForRoute } from "@/lib/auth/access";
import { RECOVERY_COOKIE, verifyRecovery } from "@/lib/auth/recovery-session";
import { updateSession } from "@/lib/supabase-proxy";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const destination = redirectForRoute(
    request.nextUrl.pathname,
    !!user,
    hasTemporaryPassword(user?.app_metadata),
    // ¿Abrió un link de recuperación y todavía no guardó la contraseña nueva? (ADMIN-AUTH-15)
    !!user &&
      verifyRecovery(
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        request.cookies.get(RECOVERY_COOKIE)?.value,
        user.id,
      ),
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
    // Todo salvo archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
