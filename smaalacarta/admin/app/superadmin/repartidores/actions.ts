"use server";

import { revalidatePath } from "next/cache";

import type { SuperAdminFormState } from "../actions";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { updateCourier } from "@/lib/db/couriers";
import { buildCourierDeps } from "@/lib/superadmin/courier-deps";
import {
  createCourierWithAccount,
  resetCourierPassword,
  validateCourierProfile,
} from "@/lib/superadmin/couriers";
import { normalizeWhatsapp } from "@/lib/superadmin/validation";

// Repartidores (ENVIO-55). Las reglas de alta y de restablecimiento están en
// `src/lib/superadmin/couriers.ts`: ahí se comprueba superadmin antes de usar la clave de servicio.

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createCourierAction(
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const values = {
    name: text(formData, "name"),
    whatsapp: text(formData, "whatsapp"),
    email: text(formData, "email"),
  };

  const result = await createCourierWithAccount(await buildCourierDeps(), values);

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors, values };
  }

  revalidatePath("/superadmin/repartidores");

  return { courierId: result.courierId, credentials: result.credentials };
}

export async function updateCourierAction(
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  await requireSuperAdmin();

  const courierId = text(formData, "courierId");
  const values = {
    name: text(formData, "name").trim(),
    whatsapp: text(formData, "whatsapp"),
  };

  const validation = validateCourierProfile(values);
  if (!validation.ok) {
    return { error: "Revisá los datos marcados.", fieldErrors: validation.errors, values };
  }

  const result = await updateCourier(courierId, {
    name: values.name,
    whatsapp: normalizeWhatsapp(values.whatsapp),
    active: formData.get("active") === "on",
  });

  if (!result.ok) {
    return { error: "No pudimos guardar los cambios. Probá de nuevo.", values };
  }

  revalidatePath("/superadmin/repartidores");
  revalidatePath(`/superadmin/repartidores/${courierId}`);

  return { message: "Repartidor actualizado." };
}

export async function resetCourierPasswordAction(
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const result = await resetCourierPassword(await buildCourierDeps(), {
    courierId: text(formData, "courierId"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: "Contraseña restablecida. Pasale estos datos a la persona:",
    credentials: result.credentials,
  };
}
