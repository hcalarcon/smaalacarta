import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthHeading from "../components/AuthHeading";
import ResetPasswordForm from "../components/ResetPasswordForm";
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

  return (
    <>
      <AuthHeading
        title="Elegí una contraseña nueva"
        subtitle="Con ella vas a ingresar de ahora en más."
      />

      <ResetPasswordForm />
    </>
  );
}
