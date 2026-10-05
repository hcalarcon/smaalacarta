import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { callbackDestination } from "@/lib/auth/redirect";
import {
  RECOVERY_COOKIE,
  RECOVERY_MAX_AGE_SECONDS,
  signRecovery,
} from "@/lib/auth/recovery-session";
import { createClient } from "@/lib/supabase-server";

// Redirect RELATIVO: el navegador conserva el dominio con el que entró (www.smaalacarta.com.ar,
// no el host interno del deploy). `NextResponse.redirect` exige una URL absoluta; las cookies de
// la sesión que se setean con `cookies()` se suman igual a esta respuesta.
function redirectTo(location: string) {
  return new NextResponse(null, { status: 307, headers: { Location: location } });
}

// Destino de los links de mail de Supabase (confirmar cuenta, recuperar
// contraseña): cambia el `code` de la URL por una sesión y sigue al destino. Los redirects
// suman el basePath (/admin) a mano, como `proxy.ts`.
export async function GET(request: NextRequest) {
  const { searchParams, basePath } = request.nextUrl;
  const code = searchParams.get("code");
  const failed = redirectTo(`${basePath}/login?error=link`);

  if (!code) {
    console.error("auth/callback: el link no trae code");
    return failed;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Para diagnosticar un link que falla: el motivo, nunca el `code`.
    console.error("auth/callback: no se pudo canjear el code por una sesión:", error.code, error.message);
    return failed;
  }

  const destination = callbackDestination(searchParams.get("next"));

  // Link de recuperación: deja la marca que habilita /restablecer sin pedir la contraseña actual.
  if (destination === "/restablecer") {
    const userId = data?.user?.id;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!userId || !secret) {
      console.error("auth/callback: no se pudo marcar la sesión de recuperación (falta usuario o clave)");
      return failed;
    }

    (await cookies()).set(RECOVERY_COOKIE, signRecovery(secret, userId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: basePath,
      maxAge: RECOVERY_MAX_AGE_SECONDS,
    });
  }

  return redirectTo(basePath + destination);
}
