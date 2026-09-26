import { authErrorMessage } from "./messages";
import { validateNewPassword } from "./validation";

// Lo que hace falta del exterior, inyectado para probar las reglas sin Supabase.
export type ChangePasswordDeps = {
  // ¿Iniciar sesión con esta contraseña funcionaría hoy? Sirve para detectar que
  // la "nueva" contraseña es, en realidad, la temporal.
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
      fieldErrors?: Partial<Record<"password" | "confirm", string>>;
    };

export async function changePassword(
  deps: ChangePasswordDeps,
  input: {
    userId: string;
    email: string;
    isTemporary: boolean;
    password: string;
    confirm: string;
  },
): Promise<ChangePasswordResult> {
  const validation = validateNewPassword(input.password, input.confirm);
  if (!validation.ok) {
    return { ok: false, fieldErrors: validation.errors };
  }

  if (!input.isTemporary) {
    const result = await deps.updateOwnPassword(input.password);
    return result.error
      ? { ok: false, error: authErrorMessage(result.error) }
      : { ok: true };
  }

  // Con la temporal, la contraseña propia tiene que ser otra: la temporal la
  // conoce quien creó la cuenta.
  if (await deps.matchesCurrentPassword(input.email, input.password)) {
    return {
      ok: false,
      fieldErrors: {
        password: "Elegí una contraseña distinta de la temporal.",
      },
    };
  }

  const result = await deps.updateTemporaryPassword(input.userId, input.password);
  return result.error
    ? { ok: false, error: authErrorMessage(result.error) }
    : { ok: true };
}
