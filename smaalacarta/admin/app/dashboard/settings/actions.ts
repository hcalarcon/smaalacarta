"use server";

import { revalidatePath } from "next/cache";

import { updateBusinessProfile } from "@/lib/db/business";
import { getDeliveryOptions, saveDeliveryPreferences } from "@/lib/db/delivery-zones";
import { saveSettings } from "@/lib/db/settings";
import { validateDeliveryInput, type DeliveryInput } from "@/lib/courier/preferences";
import {
  createZoneFor,
  deleteZoneFor,
  reorderZonesFor,
  setZoneActiveFor,
  updateZoneFor,
  type ZoneResult,
} from "@/lib/delivery/business-zones";
import { requireBusiness } from "@/lib/get-current-business";
import { prepareSettings } from "@/lib/settings/save-flow";
import { settingsErrorMessage } from "@/lib/settings/messages";
import {
  validateSettings,
  type SettingsInput,
} from "@/lib/settings/validation";
import {
  normalizeWhatsapp,
  validateBusinessProfile,
} from "@/lib/superadmin/validation";

export type SaveSettingsResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

// Toma el negocio de la sesión (`requireBusiness`), no del navegador; el RLS de la
// base lo respalda.
export async function saveSettingsAction(
  input: SettingsInput,
): Promise<SaveSettingsResult> {
  const { business } = await requireBusiness();

  const settings = prepareSettings(input);

  const validation = validateSettings(settings);
  if (!validation.ok) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: validation.errors,
    };
  }

  const saved = await saveSettings(business.id, {
    ...settings,
    whatsapp: normalizeWhatsapp(settings.whatsapp),
  });

  if (saved.error) {
    return { ok: false, error: settingsErrorMessage(saved.error) };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export type SaveBusinessProfileResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"name" | "slug", string>>;
    };

// Nombre y URL (slug) del negocio, separados de `saveSettingsAction` porque
// viven en `businesses`, no en `business_settings`.
export async function saveBusinessProfileAction(input: {
  name: string;
  slug: string;
}): Promise<SaveBusinessProfileResult> {
  const { business } = await requireBusiness();

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  const validation = validateBusinessProfile({ name, slug });
  if (!validation.ok) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: validation.errors,
    };
  }

  const { error } = await updateBusinessProfile(business.id, { name, slug });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Revisá los datos marcados.",
        fieldErrors: { slug: "Esa URL ya la usa otro negocio. Elegí otra." },
      };
    }

    return { ok: false, error: "No pudimos guardar los cambios. Probá de nuevo." };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export type SaveDeliveryResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"favorite" | "vehicles", string>>;
    };

// Zonas a las que envía el local y repartidor favorito (ENVIO-58 y 112). El negocio sale de la
// sesión; la base guarda las zonas y el favorito en una sola transacción y vuelve a validar todo.
export async function saveDeliveryAction(input: DeliveryInput): Promise<SaveDeliveryResult> {
  const { business } = await requireBusiness();

  if (!business.courier_delivery) {
    return { ok: false, error: "Tu negocio no tiene el envío con repartidor habilitado." };
  }

  const options = await getDeliveryOptions();
  if (!options) {
    return { ok: false, error: "No pudimos guardar los cambios. Probá de nuevo." };
  }

  const validation = validateDeliveryInput(
    {
      zoneIds: Array.isArray(input.zoneIds) ? input.zoneIds.filter((id) => typeof id === "string") : [],
      favoriteId: typeof input.favoriteId === "string" ? input.favoriteId : null,
    },
    options,
  );

  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const saved = await saveDeliveryPreferences({
    zoneIds: validation.zoneIds,
    favoriteId: validation.favoriteId,
    vehicles: validation.vehicles,
  });

  if ("error" in saved) {
    // P0017: otro cambio dejó al favorito sin cubrir ninguna zona del local.
    if (saved.error.code === "P0017") {
      return {
        ok: false,
        error: "Revisá los datos marcados.",
        fieldErrors: { favorite: "Ese repartidor ya no cubre ninguna de tus zonas. Elegí otro." },
      };
    }

    return { ok: false, error: "No pudimos guardar los cambios. Probá de nuevo." };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

// Zonas y precios propios del negocio (ENVIO-247 y 260). El negocio sale de la sesión, nunca del navegador, y la base
// vuelve a exigir con el RLS que quien llama sea miembro. Solo con envío propio: con envío libre no hay zonas propias.
async function ownZonesBusiness(): Promise<string | null> {
  const { business } = await requireBusiness();
  return business.courier_delivery && business.delivery_type === "own" ? business.id : null;
}

const NOT_OWN: ZoneResult = { ok: false, error: "Tu negocio no tiene el envío propio habilitado." };

async function zoneAction(run: (businessId: string) => Promise<ZoneResult>): Promise<ZoneResult> {
  const businessId = await ownZonesBusiness();
  if (!businessId) return NOT_OWN;

  const result = await run(businessId);
  if (result.ok) revalidatePath("/dashboard/settings");
  return result;
}

export async function createZoneAction(input: { name: string; price: string }): Promise<ZoneResult> {
  return zoneAction((businessId) => createZoneFor(businessId, input));
}

export async function updateZoneAction(zoneId: string, input: { name: string; price: string }): Promise<ZoneResult> {
  return zoneAction((businessId) => updateZoneFor(businessId, zoneId, input));
}

export async function setZoneActiveAction(zoneId: string, active: boolean): Promise<ZoneResult> {
  return zoneAction((businessId) => setZoneActiveFor(businessId, zoneId, active));
}

export async function deleteZoneAction(zoneId: string): Promise<ZoneResult> {
  return zoneAction((businessId) => deleteZoneFor(businessId, zoneId));
}

export async function reorderZonesAction(orderedIds: string[]): Promise<ZoneResult> {
  return zoneAction((businessId) => reorderZonesFor(businessId, orderedIds));
}
