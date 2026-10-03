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
    theme: data.theme,
    tagline: data.tagline ?? "",
    primaryColor: data.primary_color,
    secondaryColor: data.secondary_color,
    headerImageUrl: data.header_image_url ?? "",
    logoUrl: data.logo_url ?? "",
    menuPdfUrl: data.menu_pdf_url ?? "",
    schedule: (data.schedule ?? {}) as Schedule,
    whatsapp: whatsapp ?? "",
    address: data.address ?? "",
    instagram: data.instagram_url ?? "",
    facebook: data.facebook_url ?? "",
    temporarilyClosed: data.temporarily_closed,
    closedMessage: data.closed_message ?? "",
    reopensOn: data.reopens_on ?? "",
    deliveryOptions: data.delivery_options,
    paymentOptions: data.payment_options,
    transferAlias: data.transfer_alias ?? "",
    transferCbu: data.transfer_cbu ?? "",
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
    p_address: input.address,
    p_instagram_url: input.instagram,
    p_facebook_url: input.facebook,
    p_temporarily_closed: input.temporarilyClosed,
    p_closed_message: input.closedMessage,
    // La base espera una fecha o nulo, no un texto vacío.
    p_reopens_on: (input.reopensOn || null) as string,
    p_logo_url: input.logoUrl,
    p_menu_pdf_url: input.menuPdfUrl,
    p_theme: input.theme,
    p_delivery_options: input.deliveryOptions,
    p_payment_options: input.paymentOptions,
    p_transfer_alias: input.transferAlias,
    p_transfer_cbu: input.transferCbu,
  });

  return error ? { error: { code: error.code, message: error.message } } : {};
}
