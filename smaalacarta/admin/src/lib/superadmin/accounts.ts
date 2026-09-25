import { authErrorMessage } from "@/lib/auth/messages";
import { isValidEmail } from "@/lib/auth/validation";

import { superAdminErrorMessage, type DbError } from "./messages";
import {
  normalizeWhatsapp,
  validateMember,
  validateNewBusiness,
} from "./validation";

// Lo que la orquestación necesita del mundo exterior. Se inyecta para poder
// probar las reglas sin Supabase: en especial, que `inviteUser` (que usa la clave
// de servicio, con acceso total) no se llame si quien pide no es superadmin.
export type AccountDeps = {
  isSuperAdmin(): Promise<boolean>;
  findProfileIdByEmail(email: string): Promise<string | null>;
  slugExists(slug: string): Promise<boolean>;
  inviteUser(
    email: string,
    fullName: string,
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
};

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

// Devuelve el id de la cuenta con ese email. Si no existe, la crea invitándola
// por mail (ADMIN-SUPER-6).
async function resolveAccount(
  deps: AccountDeps,
  email: string,
  fullName: string,
): Promise<
  { ok: true; userId: string; invited: boolean } | { ok: false; error: string }
> {
  const existing = await deps.findProfileIdByEmail(email);
  if (existing) {
    return { ok: true, userId: existing, invited: false };
  }

  const invitation = await deps.inviteUser(email, fullName);
  if ("error" in invitation) {
    return { ok: false, error: authErrorMessage(invitation.error) };
  }

  return { ok: true, userId: invitation.id, invited: true };
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
  { ok: true; businessId: string; invited: boolean } | ActionFailure
> {
  // Lo primero: sin permiso no se valida, no se consulta y no se invita.
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

  // Antes de mandar una invitación, se descarta el error más común.
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
      error: owner.invited
        ? `${reason} La invitación ya se envió: volvé a intentar con el mismo email.`
        : reason,
    };
  }

  return { ok: true, businessId: created.id, invited: owner.invited };
}

export async function addMemberByEmail(
  deps: AccountDeps,
  raw: { businessId: string; email: string; role: string },
): Promise<{ ok: true; invited: boolean } | ActionFailure> {
  if (!(await deps.isSuperAdmin())) {
    return { ok: false, error: NO_PERMISSION };
  }

  const email = normalizeEmail(raw.email);

  const validation = validateMember({ email, role: raw.role });
  if (!validation.ok || !isValidEmail(email)) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: validation.ok ? {} : validation.errors,
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

  return { ok: true, invited: account.invited };
}
