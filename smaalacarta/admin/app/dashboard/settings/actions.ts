"use server";

import { revalidatePath } from "next/cache";

import { updateBusinessProfile } from "@/lib/db/business";
import { getDeliveryOptions, saveDeliveryPreferences } from "@/lib/db/delivery-zones";
import { saveSettings } from "@/lib/db/settings";
import { validateDeliveryInput, type DeliveryInput } from "@/lib/courier/preferences";
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
      fieldErrors?: Partial<Record<"favorite" | "minutes", string>>;
    };

// Zonas a las que envía el local, repartidor favorito y minutos (ENVIO-58). El negocio sale de la
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
      minutes: typeof input.minutes === "string" ? input.minutes : "",
    },
    options,
  );

  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const saved = await saveDeliveryPreferences({
    zoneIds: validation.zoneIds,
    favoriteId: validation.favoriteId,
    minutes: validation.minutes,
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
