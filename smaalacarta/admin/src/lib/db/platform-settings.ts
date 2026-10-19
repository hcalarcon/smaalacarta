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

// El interruptor "Vehículo del repartidor (moto/auto)" (ENVIO-175). Arranca apagado. Lo lee y lo cambia solo el
// superadmin con la tabla; el resto del servidor lo pregunta con `vehicle_enabled()` (ver `db/vehicle.ts`).
export async function getVehicleSwitch(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("platform_settings").select("vehicle_enabled").maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.vehicle_enabled === true;
}

export async function setVehicleSwitch(enabled: boolean): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  // El RLS deja actualizar solo al superadmin; sin filas devueltas, no se cambió nada.
  const { data, error } = await supabase
    .from("platform_settings")
    .update({ vehicle_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("vehicle_enabled");

  if (error) return { error: { code: error.code, message: error.message } };
  if (!data || data.length === 0) return { error: { code: "42501", message: "Sin permiso" } };

  return { ok: true };
}

// El interruptor "Exigir términos a repartidores" (ENVIO-181). Arranca prendido. Lo lee y lo cambia solo el
// superadmin con la tabla; el resto del servidor lo pregunta con `courier_terms_required()`.
export async function getCourierTermsSwitch(): Promise<{ required: boolean; version: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("platform_settings")
    .select("courier_terms_required, courier_terms_version")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return { required: data?.courier_terms_required !== false, version: data?.courier_terms_version ?? 1 };
}

export async function setCourierTermsSwitch(required: boolean): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  // El RLS deja actualizar solo al superadmin; sin filas devueltas, no se cambió nada.
  const { data, error } = await supabase
    .from("platform_settings")
    .update({ courier_terms_required: required, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("courier_terms_required");

  if (error) return { error: { code: error.code, message: error.message } };
  if (!data || data.length === 0) return { error: { code: "42501", message: "Sin permiso" } };

  return { ok: true };
}

// El interruptor "Disponibilidad de repartidores" (ENVIO-193). Arranca prendido. Lo lee y lo cambia solo el
// superadmin con la tabla; el resto del servidor lo pregunta con `courier_availability_enabled()`.
export async function getCourierAvailabilitySwitch(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("platform_settings")
    .select("courier_availability_enabled")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.courier_availability_enabled !== false;
}

export async function setCourierAvailabilitySwitch(enabled: boolean): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  // El RLS deja actualizar solo al superadmin; sin filas devueltas, no se cambió nada.
  const { data, error } = await supabase
    .from("platform_settings")
    .update({ courier_availability_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("courier_availability_enabled");

  if (error) return { error: { code: error.code, message: error.message } };
  if (!data || data.length === 0) return { error: { code: "42501", message: "Sin permiso" } };

  return { ok: true };
}
