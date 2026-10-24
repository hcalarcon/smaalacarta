"use server";

import { revalidatePath } from "next/cache";

import type { SuperAdminFormState } from "../actions";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { listBusinessChoices, setCourierType, updateCourier } from "@/lib/db/couriers";
import { buildCourierDeps } from "@/lib/superadmin/courier-deps";
import {
  createCourierWithAccount,
  parseCourierType,
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

const OWN_CONFLICT = "Ese negocio ya tiene un repartidor propio activo. Desactivalo o elegí otro negocio.";

// El negocio elegido ya tiene su repartidor propio activo (otro distinto de `exceptCourierId`).
async function ownCourierTaken(businessId: string, exceptCourierId?: string) {
  const choices = await listBusinessChoices();
  const taken = choices.find((choice) => choice.id === businessId)?.ownCourier;
  return Boolean(taken && taken.id !== exceptCourierId);
}

export async function createCourierAction(
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const values = {
    name: text(formData, "name"),
    whatsapp: text(formData, "whatsapp"),
    email: text(formData, "email"),
    courierType: text(formData, "courierType") || "free",
    ownBusinessId: text(formData, "ownBusinessId"),
  };

  const type = parseCourierType(values);
  if (!type.ok) {
    return { error: "Revisá los datos marcados.", fieldErrors: { ownBusinessId: type.error }, values };
  }

  if (type.value.ownBusinessId && (await ownCourierTaken(type.value.ownBusinessId))) {
    return { error: "Revisá los datos marcados.", fieldErrors: { ownBusinessId: OWN_CONFLICT }, values };
  }

  const result = await createCourierWithAccount(await buildCourierDeps(), {
    name: values.name,
    whatsapp: values.whatsapp,
    email: values.email,
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors, values };
  }

  // Si el tipo no se pudo guardar, el repartidor y su cuenta ya existen: se avisa y se arregla desde su detalle.
  let message: string | undefined;
  if (type.value.courierType === "own") {
    const saved = await setCourierType(result.courierId, type.value);
    if (!saved.ok) {
      message = "El repartidor se creó como libre: no pudimos dejarlo como propio. Cambialo desde su detalle.";
    }
  }

  revalidatePath("/superadmin/repartidores");

  return { courierId: result.courierId, credentials: result.credentials, message };
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

  const type = parseCourierType({
    courierType: text(formData, "courierType") || "free",
    ownBusinessId: text(formData, "ownBusinessId"),
  });
  if (!type.ok) {
    return { error: "Revisá los datos marcados.", fieldErrors: { ownBusinessId: type.error }, values };
  }

  const active = formData.get("active") === "on";

  if (active && type.value.ownBusinessId && (await ownCourierTaken(type.value.ownBusinessId, courierId))) {
    return { error: "Revisá los datos marcados.", fieldErrors: { ownBusinessId: OWN_CONFLICT }, values };
  }

  const result = await updateCourier(courierId, {
    name: values.name,
    whatsapp: normalizeWhatsapp(values.whatsapp),
    active,
    ...type.value,
  });

  if (!result.ok) {
    return {
      error: result.conflict ? OWN_CONFLICT : "No pudimos guardar los cambios. Probá de nuevo.",
      values,
    };
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
