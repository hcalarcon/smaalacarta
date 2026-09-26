import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthHeading from "../components/AuthHeading";
import ResetPasswordForm from "../components/ResetPasswordForm";
import { signOutAction } from "../actions";
import { hasTemporaryPassword } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase-server";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default async function ChangePasswordPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fcambiar-contrasena");
  }

  const isTemporary = hasTemporaryPassword(user.app_metadata);

  return (
    <>
      <AuthHeading
        title={isTemporary ? "Elegí tu contraseña" : "Cambiar contraseña"}
        subtitle={
          isTemporary
            ? "La que recibiste es temporal. Elegí una propia para continuar."
            : "Elegí una contraseña nueva para tu cuenta."
        }
      />

      <ResetPasswordForm />

      <form action={signOutAction} className="mt-6 text-center">
        <button
          type="submit"
          className="text-sm font-medium text-stone-500 underline-offset-4 hover:text-brand hover:underline"
        >
          Salir
        </button>
      </form>
    </>
  );
}
