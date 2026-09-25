"use server";

import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  isValidEmail,
  validateLogin,
  validateNewPassword,
} from "@/lib/auth/validation";
import { siteOrigin } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase-server";

export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "confirm", string>>;
  // Se devuelve para no vaciar el campo si el envío falla.
  email?: string;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email").trim();
  const password = text(formData, "password");

  const validation = validateLogin({ email, password });
  if (!validation.ok) {
    return { fieldErrors: validation.errors, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: authErrorMessage(error), email };
  }

  redirect(safeNextPath(text(formData, "next")));
}

const RECOVERY_MESSAGE =
  "Si existe una cuenta con ese email, te enviamos un link para elegir una contraseña nueva.";

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email").trim();

  if (!isValidEmail(email)) {
    return { fieldErrors: { email: "Ingresá un email válido." }, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/restablecer`,
  });

  // Solo se informa el límite de envíos: no revela si la cuenta existe.
  // Cualquier otro resultado muestra el mismo mensaje (ADMIN-AUTH-9).
  if (error?.code === "over_email_send_rate_limit") {
    return { error: authErrorMessage(error), email };
  }

  return { message: RECOVERY_MESSAGE };
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = text(formData, "password");
  const confirm = text(formData, "confirm");

  const validation = validateNewPassword(password, confirm);
  if (!validation.ok) {
    return { fieldErrors: validation.errors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: authErrorMessage(error) };
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login");
}
