import { authErrorMessage } from "./messages";
import { validateNewPassword } from "./validation";

// Lo que hace falta del exterior, inyectado para probar las reglas sin Supabase.
export type ChangePasswordDeps = {
  // ¿Iniciar sesión con esta contraseña funcionaría hoy? Verifica la actual
  // antes de cambiarla (ADMIN-AUTH-10).
  matchesCurrentPassword(email: string, password: string): Promise<boolean>;
  // Cambio común, con la sesión del usuario.
  updateOwnPassword(password: string): Promise<{ error?: { code?: string } }>;
  // Cambia la contraseña y borra la marca de temporal en una sola llamada, con la
  // clave de servicio (la marca vive en `app_metadata`, que el usuario no edita).
  updateTemporaryPassword(
    userId: string,
    password: string,
  ): Promise<{ error?: { code?: string } }>;
};

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Partial<
        Record<"currentPassword" | "password" | "confirm", string>
      >;
    };

export async function changePassword(
  deps: ChangePasswordDeps,
  input: {
    userId: string;
    email: string;
    isTemporary: boolean;
    currentPassword: string;
    password: string;
    confirm: string;
  },
): Promise<ChangePasswordResult> {
  const validation = validateNewPassword(input.password, input.confirm);
  if (!validation.ok) {
    return { ok: false, fieldErrors: validation.errors };
  }

  const verified = await deps.matchesCurrentPassword(
    input.email,
    input.currentPassword,
  );
  if (!verified) {
    return {
      ok: false,
      fieldErrors: {
        currentPassword: "La contraseña actual no es correcta.",
      },
    };
  }

  if (input.password === input.currentPassword) {
    return {
      ok: false,
      fieldErrors: {
        password: input.isTemporary
          ? "Elegí una contraseña distinta de la temporal."
          : "Elegí una contraseña distinta de la actual.",
      },
    };
  }

  if (!input.isTemporary) {
    const result = await deps.updateOwnPassword(input.password);
    return result.error
      ? { ok: false, error: authErrorMessage(result.error) }
      : { ok: true };
  }

  const result = await deps.updateTemporaryPassword(input.userId, input.password);
  return result.error
    ? { ok: false, error: authErrorMessage(result.error) }
    : { ok: true };
}

// Restablecer desde el link de un mail (ADMIN-AUTH-13): no hay contraseña actual que pedir, la sesión
// de recuperación (ver `recovery-session.ts`) ya probó quién es. Misma validación de la nueva y mismo
// borrado de la marca de temporal que el cambio normal.
export async function resetPassword(
  deps: Pick<ChangePasswordDeps, "updateOwnPassword" | "updateTemporaryPassword">,
  input: { userId: string; isTemporary: boolean; password: string; confirm: string },
): Promise<ChangePasswordResult> {
  const validation = validateNewPassword(input.password, input.confirm);
  if (!validation.ok) {
    return { ok: false, fieldErrors: validation.errors };
  }

  const result = input.isTemporary
    ? await deps.updateTemporaryPassword(input.userId, input.password)
    : await deps.updateOwnPassword(input.password);

  return result.error ? { ok: false, error: authErrorMessage(result.error) } : { ok: true };
}
