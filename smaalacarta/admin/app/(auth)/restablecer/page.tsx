import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthHeading from "../components/AuthHeading";
import NewPasswordForm from "../components/NewPasswordForm";
import { hasRecoverySession } from "@/lib/auth/recovery-cookie";
import { createClient } from "@/lib/supabase-server";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPasswordPage() {
  // Se llega desde el link del mail, que ya abrió una sesión en /auth/callback.
  // Sin sesión el link no sirve: se pide uno nuevo.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=link");
  }

  // Solo con una sesión que vino de un link de recuperación (ADMIN-AUTH-14); quien ya tenía una
  // sesión normal cambia su contraseña desde Configuración, con la actual.
  if (!(await hasRecoverySession(user.id))) {
    redirect("/dashboard");
  }

  return (
    <>
      <AuthHeading
        title="Elegí una contraseña nueva"
        subtitle="Con ella vas a ingresar de ahora en más."
      />

      <NewPasswordForm />
    </>
  );
}
