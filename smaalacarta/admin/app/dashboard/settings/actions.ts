"use server";

import { revalidatePath } from "next/cache";

import { saveSettings } from "@/lib/db/settings";
import { requireBusiness } from "@/lib/get-current-business";
import { normalizeSchedule } from "@/lib/settings/schedule";
import { settingsErrorMessage } from "@/lib/settings/messages";
import {
  normalizeSettingsText,
  validateSettings,
  type SettingsInput,
} from "@/lib/settings/validation";
import { normalizeWhatsapp } from "@/lib/superadmin/validation";

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
