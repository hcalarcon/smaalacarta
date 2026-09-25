import { NextResponse, type NextRequest } from "next/server";

import { callbackDestination } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase-server";

// Destino de los links de mail de Supabase (confirmar cuenta, recuperar
// contraseña): cambia el `code` de la URL por una sesión y sigue al destino.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(
        new URL(callbackDestination(searchParams.get("next")), origin),
      );
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
