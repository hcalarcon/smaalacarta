import { createClient } from "@/lib/supabase-server";

// Configuración de la plataforma (ENVIO-145). Solo la lee y la cambia el superadmin: lo exige el RLS de
// `platform_settings` y `platform_searching_orders()`.

type DbFailure = { error: { code?: string; message?: string } };

export type DeliveryMode = "fixed" | "offers";

export const DELIVERY_MODES: readonly DeliveryMode[] = ["fixed", "offers"];

export type DeliveryModeStatus = {
  mode: DeliveryMode;
  // Pedidos buscando repartidor ahora: dice si es buen momento para cambiar el modo.
  searching: number;
};

export async function getDeliveryModeStatus(): Promise<DeliveryModeStatus> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("platform_settings").select("delivery_mode").maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const { data: searching } = await supabase.rpc("platform_searching_orders");

  return {
    mode: data?.delivery_mode === "offers" ? "offers" : "fixed",
    searching: typeof searching === "number" ? searching : 0,
  };
}

export async function setDeliveryMode(mode: DeliveryMode): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  // El RLS deja actualizar solo al superadmin; sin filas devueltas, no se cambió nada.
  const { data, error } = await supabase
    .from("platform_settings")
    .update({ delivery_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("delivery_mode");

  if (error) return { error: { code: error.code, message: error.message } };
  if (!data || data.length === 0) return { error: { code: "42501", message: "Sin permiso" } };

  return { ok: true };
}
