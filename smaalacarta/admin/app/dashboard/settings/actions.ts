"use server";

import { revalidatePath } from "next/cache";

import { updateBusinessProfile } from "@/lib/db/business";
import { saveSettings } from "@/lib/db/settings";
import { requireBusiness } from "@/lib/get-current-business";
import { normalizeSchedule } from "@/lib/settings/schedule";
import { settingsErrorMessage } from "@/lib/settings/messages";
import {
  normalizeSettingsText,
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

  const settings: SettingsInput = normalizeSettingsText({
    ...input,
    tagline: input.tagline.trim(),
    headerImageUrl: input.headerImageUrl.trim(),
    logoUrl: input.logoUrl.trim(),
    schedule: normalizeSchedule(input.schedule),
    whatsapp: input.whatsapp.trim(),
  });

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
