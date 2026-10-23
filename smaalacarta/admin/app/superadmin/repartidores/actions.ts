"use server";

import { revalidatePath } from "next/cache";

import type { SuperAdminFormState } from "../actions";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import {
  createOwnZoneFor,
  deleteOwnZoneFor,
  reorderOwnZonesFor,
  setOwnZoneActiveFor,
  updateOwnZoneFor,
  type OwnZoneResult,
} from "@/lib/courier/own-zones";
import { setCanEditZones } from "@/lib/db/courier-own-zones";
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

// Zonas y precios propios de un repartidor (ENVIO-221 y 227). El superadmin las edita siempre; el id del
// repartidor viene de la pantalla del detalle, que ya lo comprobó.
const COURIER_ID = /^[0-9a-f-]{36}$/i;

function refreshOwnZones(courierId: string) {
  revalidatePath(`/superadmin/repartidores/${courierId}`);
  revalidatePath("/repartidor/zonas");
}

async function asSuperAdmin(courierId: string, run: () => Promise<OwnZoneResult>): Promise<OwnZoneResult> {
  await requireSuperAdmin();

  if (!COURIER_ID.test(courierId)) return { ok: false, error: "No pudimos guardar el cambio. Probá de nuevo." };

  const result = await run();
  if (result.ok) refreshOwnZones(courierId);
  return result;
}

export async function createOwnZoneAction(
  courierId: string,
  input: { name: string; price: string },
): Promise<OwnZoneResult> {
  return asSuperAdmin(courierId, () => createOwnZoneFor(courierId, input));
}

export async function updateOwnZoneAction(
  courierId: string,
  zoneId: string,
  input: { name: string; price: string },
): Promise<OwnZoneResult> {
  return asSuperAdmin(courierId, () => updateOwnZoneFor(courierId, zoneId, input));
}

export async function setOwnZoneActiveAction(
  courierId: string,
  zoneId: string,
  active: boolean,
): Promise<OwnZoneResult> {
  return asSuperAdmin(courierId, () => setOwnZoneActiveFor(courierId, zoneId, active));
}

export async function deleteOwnZoneAction(courierId: string, zoneId: string): Promise<OwnZoneResult> {
  return asSuperAdmin(courierId, () => deleteOwnZoneFor(courierId, zoneId));
}

export async function reorderOwnZonesAction(courierId: string, orderedIds: string[]): Promise<OwnZoneResult> {
  return asSuperAdmin(courierId, () => reorderOwnZonesFor(courierId, orderedIds));
}

// "Puede editar sus zonas y precios": lo da solo el superadmin (ENVIO-221).
export async function setCanEditZonesAction(courierId: string, canEdit: boolean): Promise<OwnZoneResult> {
  return asSuperAdmin(courierId, async () => {
    const result = await setCanEditZones(courierId, Boolean(canEdit));
    return "error" in result ? { ok: false, error: "No pudimos guardar el cambio. Probá de nuevo." } : { ok: true };
  });
}
