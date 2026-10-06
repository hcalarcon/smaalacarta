"use server";

import { redirect } from "next/navigation";

import { hasTemporaryPassword } from "@/lib/auth/access";
import { changePassword } from "@/lib/auth/change-password";
import { authErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirect";
import { validateLogin } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Partial<
    Record<"email" | "currentPassword" | "password" | "confirm", string>
  >;
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

// Cómo se guarda una contraseña nueva: la común, o la que además borra la marca de temporal.
function passwordWriters(supabase: Awaited<ReturnType<typeof createClient>>) {
  return {
    updateOwnPassword: async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error ?? undefined };
    },
    updateTemporaryPassword: async (userId: string, password: string) => {
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
  };
}

// Cambiar la contraseña pidiendo la actual: desde Configuración o, con una contraseña
// temporal, en /cambiar-contrasena (en ese caso se borra la marca de temporal,
// ADMIN-SUPER-10). Restablecer la de otro lo hace solo el superadmin (ADMIN-AUTH-16).
export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
      ...passwordWriters(supabase),
    },
    {
      userId: user.id,
      email: user.email ?? "",
      isTemporary: hasTemporaryPassword(user.app_metadata),
      currentPassword: text(formData, "currentPassword"),
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
