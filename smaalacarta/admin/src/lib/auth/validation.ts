export const MIN_PASSWORD_LENGTH = 8;

export type ValidationResult<K extends string> =
  | { ok: true }
  | { ok: false; errors: Partial<Record<K, string>> };

// Forma básica (algo@dominio.tld, sin espacios). Supabase valida el resto.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}

export function validateLogin(input: {
  email: string;
  password: string;
}): ValidationResult<"email" | "password"> {
  const errors: Partial<Record<"email" | "password", string>> = {};

  if (!isValidEmail(input.email)) {
    errors.email = "Ingresá un email válido.";
  }

  if (!input.password) {
    errors.password = "Ingresá tu contraseña.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

export function validateNewPassword(
  password: string,
  confirm: string,
): ValidationResult<"password" | "confirm"> {
  const errors: Partial<Record<"password" | "confirm", string>> = {};

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Usá al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  } else if (password !== confirm) {
    errors.confirm = "Las contraseñas no coinciden.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
