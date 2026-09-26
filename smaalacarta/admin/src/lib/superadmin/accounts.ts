import { authErrorMessage } from "@/lib/auth/messages";

import { superAdminErrorMessage, type DbError } from "./messages";
import {
  normalizeWhatsapp,
  validateMember,
  validateNewBusiness,
} from "./validation";

// Lo que la orquestación necesita del mundo exterior. Se inyecta para poder
// probar las reglas sin Supabase: en especial, que las operaciones con la clave de
// servicio (`createAccount`, `setTemporaryPassword`), que tienen acceso total, no
// se llamen si quien pide no es superadmin.
export type AccountDeps = {
  isSuperAdmin(): Promise<boolean>;
  findProfileIdByEmail(email: string): Promise<string | null>;
  slugExists(slug: string): Promise<boolean>;
  // Crea la cuenta ya confirmada, con esa contraseña, marcada como temporal.
  createAccount(
    email: string,
    fullName: string,
    password: string,
  ): Promise<{ id: string } | { error: DbError }>;
  createBusiness(input: {
    name: string;
    slug: string;
    whatsapp: string;
    ownerId: string;
  }): Promise<{ id: string } | { error: DbError }>;
  addMember(input: {
    businessId: string;
    userId: string;
    role: string;
  }): Promise<{ error?: DbError }>;
  // Email del miembro, o null si no es miembro de ese negocio.
  getMemberEmail(businessId: string, userId: string): Promise<string | null>;
  isSuperAdminUser(userId: string): Promise<boolean>;
  setTemporaryPassword(
    userId: string,
    password: string,
  ): Promise<{ error?: DbError }>;
  generatePassword(): string;
};

// Se muestra una sola vez al superadmin, que se la pasa a la persona.
export type Credentials = { email: string; password: string };

export type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: Partial<Record<string, string>>;
};

const NO_PERMISSION = "No tenés permiso para hacer esto.";
const SLUG_TAKEN = "Ya hay un negocio con ese slug. Elegí otro.";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// Devuelve el id de la cuenta con ese email. Si no existe, la crea con una
// contraseña temporal (ADMIN-SUPER-6); si existe, la reutiliza sin tocarla.
async function resolveAccount(
  deps: AccountDeps,
  email: string,
  fullName: string,
): Promise<
  | { ok: true; userId: string; credentials: Credentials | null }
  | { ok: false; error: string }
> {
  const existing = await deps.findProfileIdByEmail(email);
  if (existing) {
    return { ok: true, userId: existing, credentials: null };
  }

  const password = deps.generatePassword();
  const created = await deps.createAccount(email, fullName, password);

  if ("error" in created) {
    return { ok: false, error: authErrorMessage(created.error) };
  }

  return {
    ok: true,
    userId: created.id,
    credentials: { email, password },
  };
}

export async function createBusinessWithOwner(
  deps: AccountDeps,
  raw: {
    name: string;
    slug: string;
    whatsapp: string;
    ownerEmail: string;
    ownerName: string;
  },
): Promise<
  | { ok: true; businessId: string; credentials: Credentials | null }
  | ActionFailure
> {
  // Lo primero: sin permiso no se valida, no se consulta y no se crea nada.
  if (!(await deps.isSuperAdmin())) {
    return { ok: false, error: NO_PERMISSION };
  }

  const input = {
    name: raw.name.trim(),
    slug: raw.slug.trim(),
    whatsapp: raw.whatsapp,
    ownerEmail: normalizeEmail(raw.ownerEmail),
    ownerName: raw.ownerName.trim(),
  };

  const validation = validateNewBusiness(input);
  if (!validation.ok) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: validation.errors,
    };
  }

  // Antes de crear una cuenta, se descarta el error más común.
  if (await deps.slugExists(input.slug)) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: { slug: SLUG_TAKEN },
    };
  }

  const owner = await resolveAccount(deps, input.ownerEmail, input.ownerName);
  if (!owner.ok) {
    return { ok: false, error: owner.error };
  }

  const created = await deps.createBusiness({
    name: input.name,
    slug: input.slug,
    whatsapp: normalizeWhatsapp(input.whatsapp),
    ownerId: owner.userId,
  });

  if ("error" in created) {
    const reason = superAdminErrorMessage(created.error);
    return {
      ok: false,
      error: owner.credentials
        ? `${reason} La cuenta ya se creó: volvé a intentar con el mismo email.`
        : reason,
    };
  }

  return {
    ok: true,
    businessId: created.id,
    credentials: owner.credentials,
  };
}

export async function addMemberByEmail(
  deps: AccountDeps,
  raw: { businessId: string; email: string; role: string },
): Promise<{ ok: true; credentials: Credentials | null } | ActionFailure> {
  if (!(await deps.isSuperAdmin())) {
    return { ok: false, error: NO_PERMISSION };
  }

  const email = normalizeEmail(raw.email);

  const validation = validateMember({ email, role: raw.role });
  if (!validation.ok) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: validation.errors,
    };
  }

  const account = await resolveAccount(deps, email, "");
  if (!account.ok) {
    return { ok: false, error: account.error };
  }

  const added = await deps.addMember({
    businessId: raw.businessId,
    userId: account.userId,
    role: raw.role,
  });

  if (added.error) {
    return { ok: false, error: superAdminErrorMessage(added.error) };
  }

  return { ok: true, credentials: account.credentials };
}

// Restablece la contraseña de un miembro: una temporal nueva, que se muestra una
// vez, y la persona vuelve a quedar obligada a cambiarla (ADMIN-SUPER-11).
export async function resetMemberPassword(
  deps: AccountDeps,
  raw: { businessId: string; userId: string },
): Promise<{ ok: true; credentials: Credentials } | ActionFailure> {
  if (!(await deps.isSuperAdmin())) {
    return { ok: false, error: NO_PERMISSION };
  }

  // Solo miembros de ese negocio: no es una llave para cualquier cuenta.
  const email = await deps.getMemberEmail(raw.businessId, raw.userId);
  if (!email) {
    return { ok: false, error: "Esa cuenta no es miembro de este negocio." };
  }

  if (await deps.isSuperAdminUser(raw.userId)) {
    return {
      ok: false,
      error: "No se puede restablecer la contraseña de otro superadmin.",
    };
  }

  const password = deps.generatePassword();
  const updated = await deps.setTemporaryPassword(raw.userId, password);

  if (updated.error) {
    return { ok: false, error: authErrorMessage(updated.error) };
  }

  return { ok: true, credentials: { email, password } };
}
