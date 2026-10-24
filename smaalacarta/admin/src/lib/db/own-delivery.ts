import { createClient } from "@/lib/supabase-server";

// Lo que ven los paneles del envío propio (ENVIO-257): `business_own_delivery` y `courier_own_business`.

export type DeliveryType = "free" | "own";

export type OwnDelivery = {
  delivery_type: DeliveryType;
  // El repartidor propio del negocio (el activo; si no hay, el último inactivo). Nulo si no tiene.
  courier: { id: string; name: string; active: boolean } | null;
  zones_with_price: number;
  zones_total: number;
};

export function parseDeliveryType(value: unknown): DeliveryType | null {
  return value === "free" || value === "own" ? value : null;
}

// Para Configuración → Envíos y el detalle del negocio. La base comprueba que quien llama es del negocio o superadmin.
export async function getOwnDelivery(businessId: string): Promise<OwnDelivery> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("business_own_delivery", { p_business_id: businessId });

  if (error || !data) throw new Error(error?.message ?? "No se pudo leer el envío del negocio");

  return data as unknown as OwnDelivery;
}

export type CourierOwnBusiness = {
  business: { id: string; name: string };
  zones: { id: string; name: string; price: number | null; active: boolean }[];
};

// Para el panel del repartidor: su negocio y sus zonas en solo lectura. Nulo si no es repartidor propio.
export async function getCourierOwnBusiness(): Promise<CourierOwnBusiness | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_own_business");

  if (error) throw new Error(error.message);

  return (data as unknown as CourierOwnBusiness | null) ?? null;
}

// Solo el superadmin: el trigger `businesses_guard_admin_columns` lo exige.
export async function updateDeliveryType(
  businessId: string,
  type: DeliveryType,
): Promise<{ ok: true } | { error: { code?: string; message?: string } }> {
  const supabase = await createClient();

  const { error } = await supabase.from("businesses").update({ delivery_type: type }).eq("id", businessId);

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
