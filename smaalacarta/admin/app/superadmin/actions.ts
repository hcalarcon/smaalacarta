"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { removeMember } from "@/lib/db/superadmin";
import {
  addMemberByEmail,
  createBusinessWithOwner,
  resetMemberPassword,
  type Credentials,
} from "@/lib/superadmin/accounts";
import { buildAccountDeps } from "@/lib/superadmin/deps";

export type SuperAdminFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  // Para no vaciar el formulario si el envío falla.
  values?: Record<string, string>;
  // Contraseña temporal recién generada. Se muestra una sola vez: no se guarda en
  // ningún lado, solo viaja en esta respuesta.
  credentials?: Credentials | null;
  // Negocio recién creado.
  businessId?: string;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createBusinessAction(
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const values = {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    whatsapp: text(formData, "whatsapp"),
    ownerName: text(formData, "ownerName"),
    ownerEmail: text(formData, "ownerEmail"),
  };

  const result = await createBusinessWithOwner(await buildAccountDeps(), values);

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors, values };
  }

  return { businessId: result.businessId, credentials: result.credentials };
}

export async function addMemberAction(
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const businessId = text(formData, "businessId");
  const values = { email: text(formData, "email"), role: text(formData, "role") };

  const result = await addMemberByEmail(await buildAccountDeps(), {
    businessId,
    ...values,
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors, values };
  }

  revalidatePath(`/superadmin/negocios/${businessId}`);

  return {
    message: result.credentials
      ? "Cuenta creada y asignada al negocio. Pasale estos datos a la persona:"
      : "La cuenta ya existía y quedó asignada al negocio.",
    credentials: result.credentials,
  };
}

export async function resetPasswordAction(
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const result = await resetMemberPassword(await buildAccountDeps(), {
    businessId: text(formData, "businessId"),
    userId: text(formData, "userId"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: "Contraseña restablecida. Pasale estos datos a la persona:",
    credentials: result.credentials,
  };
}

export async function removeMemberAction(formData: FormData) {
  // Además del RLS (que ignora el borrado si no sos superadmin), se comprueba acá.
  await requireSuperAdmin();

  const businessId = text(formData, "businessId");
  const userId = text(formData, "userId");

  if (businessId && userId) {
    await removeMember(businessId, userId);
    revalidatePath(`/superadmin/negocios/${businessId}`);
  }
}
