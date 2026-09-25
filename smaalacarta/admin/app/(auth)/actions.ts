"use server";

import { redirect } from "next/navigation";

import { hasTemporaryPassword } from "@/lib/auth/access";
import { changePassword } from "@/lib/auth/change-password";
import { authErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirect";
import { isValidEmail, validateLogin } from "@/lib/auth/validation";
import { siteOrigin } from "@/lib/site-origin";
import { createAdminClient } from "@/lib/supabase-admin";
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

// Elegir una contraseña propia: al restablecer con el link de un mail o, con una
// contraseña temporal, en /cambiar-contrasena. En el segundo caso se borra la marca
// de temporal (ADMIN-SUPER-10).
export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=link");
  }

  const result = await changePassword(
    {
      matchesCurrentPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return !error;
      },
      updateOwnPassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error ?? undefined };
      },
      updateTemporaryPassword: async (userId, password) => {
        let admin;
        try {
          admin = createAdminClient();
        } catch {
          return { error: { code: "service_key_missing" } };
        }

        const { error } = await admin.auth.admin.updateUserById(userId, {
          password,
          app_metadata: { must_change_password: false },
        });
        return { error: error ?? undefined };
      },
    },
    {
      userId: user.id,
      email: user.email ?? "",
      isTemporary: hasTemporaryPassword(user.app_metadata),
      password: text(formData, "password"),
      confirm: text(formData, "confirm"),
    },
  );

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login");
}
