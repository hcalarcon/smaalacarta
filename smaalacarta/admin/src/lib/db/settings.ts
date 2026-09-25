import { createClient } from "@/lib/supabase-server";
import {
  DEFAULT_SETTINGS,
  type SettingsInput,
} from "@/lib/settings/validation";
import type { Schedule } from "@/lib/settings/schedule";

// La configuración del negocio, con los valores por defecto si todavía no la
// guardó. El WhatsApp vive en `businesses` y se pasa desde afuera.
export async function getSettings(
  businessId: string,
  whatsapp: string | null,
): Promise<SettingsInput> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_settings")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return { ...DEFAULT_SETTINGS, whatsapp: whatsapp ?? "" };
  }

  return {
    published: data.published,
    template: data.template,
    tagline: data.tagline ?? "",
    primaryColor: data.primary_color,
    secondaryColor: data.secondary_color,
    headerImageUrl: data.header_image_url ?? "",
    schedule: (data.schedule ?? {}) as Schedule,
    whatsapp: whatsapp ?? "",
  };
}

// Guarda la configuración y el WhatsApp en un solo paso (ADMIN-CONFIG-3).
export async function saveSettings(
  businessId: string,
  input: SettingsInput,
): Promise<{ error?: { code?: string; message?: string } }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_business_settings", {
    p_business_id: businessId,
    p_published: input.published,
    p_template: input.template,
    p_tagline: input.tagline,
    p_primary_color: input.primaryColor,
    p_secondary_color: input.secondaryColor,
    p_header_image_url: input.headerImageUrl,
    p_schedule: input.schedule,
    p_whatsapp: input.whatsapp,
  });

  return error ? { error: { code: error.code, message: error.message } } : {};
}
