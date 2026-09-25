import { NextResponse, type NextRequest } from "next/server";

import { parseConfirmType } from "@/lib/auth/confirm";
import { callbackDestination } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase-server";

// Destino de los links de mail que traen `token_hash`: la invitación de un
// superadmin y la recuperación de contraseña. A diferencia de /auth/callback, no
// usa PKCE (una invitación se crea en el servidor, sin navegador que guarde el
// verificador), así que cambia el token por una sesión con `verifyOtp`.
//
// La plantilla del mail en Supabase tiene que apuntar acá:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/restablecer
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = parseConfirmType(searchParams.get("type"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      return NextResponse.redirect(
        new URL(callbackDestination(searchParams.get("next")), origin),
      );
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
