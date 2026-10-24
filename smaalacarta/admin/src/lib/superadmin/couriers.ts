import { authErrorMessage } from "@/lib/auth/messages";
import { isValidEmail, type ValidationResult } from "@/lib/auth/validation";

import type { AccountDeps, ActionFailure, Credentials } from "./accounts";
import { superAdminErrorMessage, type DbError } from "./messages";
import { normalizeWhatsapp } from "./validation";

// Altas y contraseñas de las cuentas de repartidor (ENVIO-55). Mismo patrón que `accounts.ts`: las
// dependencias se inyectan para probar, en especial que las operaciones con la clave de servicio no
// se llamen si quien pide no es superadmin.

export const COURIER_NAME_MAX = 80;

// Para qué se usa una cuenta que ya existe. Solo una cuenta `free` (sin negocio, sin repartidor y sin
// ser superadmin) se puede reutilizar: es la que quedó huérfana si el alta falló a mitad de camino.
export type AccountUse = "free" | "business" | "courier" | "super_admin";

export type CourierAccountDeps = AccountDeps & {
  accountUse(userId: string): Promise<AccountUse>;
  // Crea el repartidor y su usuario en una sola transacción (`create_courier_with_user`).
  createCourier(input: {
    name: string;
    whatsapp: string;
    userId: string;
  }): Promise<{ id: string } | { error: DbError }>;
  // La cuenta de un repartidor, o null si no tiene.
  getCourierAccount(courierId: string): Promise<{ userId: string; email: string } | null>;
};

const NO_PERMISSION = "No tenés permiso para hacer esto.";

// Nombre y WhatsApp, que son los datos del repartidor que se editan después del alta.
export function validateCourierProfile(input: {
  name: string;
  whatsapp: string;
}): ValidationResult<"name" | "whatsapp"> {
  const errors: Partial<Record<"name" | "whatsapp", string>> = {};

  const name = input.name.trim();
  if (name.length < 1 || name.length > COURIER_NAME_MAX) {
    errors.name = `Ingresá el nombre del repartidor (hasta ${COURIER_NAME_MAX} caracteres).`;
  }

  // El WhatsApp es público (ENVIO-44): obligatorio y con entre 8 y 15 dígitos, como la base.
  const digits = normalizeWhatsapp(input.whatsapp);
  if (/[a-z]/i.test(input.whatsapp) || digits.length < 8 || digits.length > 15) {
    errors.whatsapp = "Ingresá el número con código de área, por ejemplo 3510000000.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Libre (por defecto) o propio de un negocio (ENVIO-246 y 258). Un repartidor propio necesita su negocio; uno libre
// no lo tiene. Lo demás lo exige la base (un solo propio activo por negocio).
export type CourierTypeValue = { courierType: "free" | "own"; ownBusinessId: string | null };

export function parseCourierType(input: {
  courierType: string;
  ownBusinessId: string;
}): { ok: true; value: CourierTypeValue } | { ok: false; error: string } {
  const type = input.courierType.trim() || "free";

  if (type === "free") return { ok: true, value: { courierType: "free", ownBusinessId: null } };

  if (type !== "own") return { ok: false, error: "Elegí si el repartidor es libre o propio de un negocio." };

  const business = input.ownBusinessId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(business)) return { ok: false, error: "Elegí el negocio del repartidor propio." };

  return { ok: true, value: { courierType: "own", ownBusinessId: business } };
}

export function validateNewCourier(input: {
  name: string;
  whatsapp: string;
  email: string;
}): ValidationResult<"name" | "whatsapp" | "email"> {
  const profile = validateCourierProfile(input);
  const errors: Partial<Record<"name" | "whatsapp" | "email", string>> = profile.ok ? {} : { ...profile.errors };

  if (!isValidEmail(input.email)) {
    errors.email = "Ingresá un email válido.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Crea la cuenta (con contraseña temporal), el repartidor y su usuario. Las credenciales se muestran
// una sola vez.
export async function createCourierWithAccount(
  deps: CourierAccountDeps,
  raw: { name: string; whatsapp: string; email: string },
): Promise<{ ok: true; courierId: string; credentials: Credentials } | ActionFailure> {
  // Lo primero: sin permiso no se valida, no se consulta y no se crea nada.
  if (!(await deps.isSuperAdmin())) {
    return { ok: false, error: NO_PERMISSION };
  }

  const input = {
    name: raw.name.trim(),
    whatsapp: raw.whatsapp,
    email: raw.email.trim().toLowerCase(),
  };

  const validation = validateNewCourier(input);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const password = deps.generatePassword();
  const existing = await deps.findProfileIdByEmail(input.email);

  let userId: string;

  if (existing) {
    // Una cuenta en uso no se toca: la contraseña de un dueño o de un superadmin no se cambia desde
    // acá. Solo se reutiliza una huérfana (el alta anterior falló después de crear la cuenta).
    if ((await deps.accountUse(existing)) !== "free") {
      return {
        ok: false,
        error: "Revisá los datos marcados.",
        fieldErrors: { email: "Ese email ya tiene una cuenta en uso. Usá otro." },
      };
    }

    const reset = await deps.setTemporaryPassword(existing, password);
    if (reset.error) {
      return { ok: false, error: authErrorMessage(reset.error) };
    }
    userId = existing;
  } else {
    const created = await deps.createAccount(input.email, input.name, password);
    if ("error" in created) {
      return { ok: false, error: authErrorMessage(created.error) };
    }
    userId = created.id;
  }

  const courier = await deps.createCourier({
    name: input.name,
    whatsapp: normalizeWhatsapp(input.whatsapp),
    userId,
  });

  if ("error" in courier) {
    return {
      ok: false,
      error: `${superAdminErrorMessage(courier.error)} La cuenta ya se creó: volvé a intentar con el mismo email.`,
    };
  }

  return { ok: true, courierId: courier.id, credentials: { email: input.email, password } };
}

// Restablece la contraseña de la cuenta del repartidor: una temporal nueva, que se muestra una vez.
export async function resetCourierPassword(
  deps: CourierAccountDeps,
  raw: { courierId: string },
): Promise<{ ok: true; credentials: Credentials } | ActionFailure> {
  if (!(await deps.isSuperAdmin())) {
    return { ok: false, error: NO_PERMISSION };
  }

  // Solo la cuenta de un repartidor: no es una llave para cualquier cuenta.
  const account = await deps.getCourierAccount(raw.courierId);
  if (!account) {
    return { ok: false, error: "Ese repartidor no tiene una cuenta." };
  }

  if (await deps.isSuperAdminUser(account.userId)) {
    return { ok: false, error: "No se puede restablecer la contraseña de otro superadmin." };
  }

  const password = deps.generatePassword();
  const updated = await deps.setTemporaryPassword(account.userId, password);

  if (updated.error) {
    return { ok: false, error: authErrorMessage(updated.error) };
  }

  return { ok: true, credentials: { email: account.email, password } };
}
