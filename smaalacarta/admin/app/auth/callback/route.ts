import { NextResponse, type NextRequest } from "next/server";

import { callbackDestination } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase-server";

// Destino de los links de mail de Supabase (confirmar cuenta, recuperar
// contraseña): cambia el `code` de la URL por una sesión y sigue al destino. Los redirects
// suman el basePath (/admin) a mano, como `proxy.ts`.
export async function GET(request: NextRequest) {
  const { searchParams, origin, basePath } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(
        new URL(basePath + callbackDestination(searchParams.get("next")), origin),
      );
    }

    // Para diagnosticar un link que falla: el motivo, nunca el `code`.
    console.error("auth/callback: no se pudo canjear el code por una sesión:", error.code, error.message);
  } else {
    console.error("auth/callback: el link no trae code");
  }

  return NextResponse.redirect(new URL(`${basePath}/login?error=link`, origin));
}
