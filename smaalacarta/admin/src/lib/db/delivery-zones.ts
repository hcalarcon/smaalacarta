import type { DeliveryOptions } from "@/lib/courier/preferences";
import { createClient } from "@/lib/supabase-server";

// Zonas de la plataforma (ENVIO-46 y 56) y preferencias de envío del local (ENVIO-52 y 53). Todo
// corre con la sesión de quien llama: lo que puede hacer lo deciden el RLS y las funciones de la base.

type DbFailure = { error: { code?: string; message?: string } };

export type DeliveryZone = {
  id: string;
  name: string;
  price: number;
  sort_order: number;
  active: boolean;
};

const ZONE_COLUMNS = "id, name, price, sort_order, active";

// Todas las zonas, activas o no, en su orden (superadmin).
export async function listDeliveryZones(): Promise<DeliveryZone[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("delivery_zones")
    .select(ZONE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((zone) => ({ ...zone, price: Number(zone.price) }));
}

// Alta al final de la lista.
export async function createDeliveryZone(input: {
  name: string;
  price: number;
}): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("delivery_zones")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("delivery_zones").insert({
    name: input.name,
    price: input.price,
    sort_order: (last?.sort_order ?? 0) + 1,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Cambia nombre, precio o si está activa. Un precio nuevo vale para los pedidos nuevos: los que ya
// se hicieron guardan su precio de lista (ENVIO-6).
export async function updateDeliveryZone(
  zoneId: string,
  changes: { name?: string; price?: number; active?: boolean },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.from("delivery_zones").update(changes).eq("id", zoneId);

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Borra la zona; si ya la usan pedidos, la base la desactiva en vez de borrarla (ENVIO-56).
export async function deleteDeliveryZone(
  zoneId: string,
): Promise<{ ok: true; result: "deleted" | "deactivated" } | DbFailure> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("delete_delivery_zone", { p_zone_id: zoneId });

  if (error) {
    return { error: { code: error.code, message: error.message } };
  }

  return { ok: true, result: data === "deactivated" ? "deactivated" : "deleted" };
}

// Guarda la posición de cada zona, desde 0 (mismo criterio que las categorías).
export async function saveDeliveryZoneOrder(orderedIds: string[]): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("delivery_zones").update({ sort_order: index }).eq("id", id),
    ),
  );

  const failed = results.find((result) => result.error);
  return failed?.error ? { error: { code: failed.error.code, message: failed.error.message } } : { ok: true };
}

// Lo que necesita la pantalla "Envíos" de Configuración (ENVIO-53). `null` si el negocio no tiene el
// envío habilitado.
export async function getDeliveryOptions(): Promise<DeliveryOptions | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("business_delivery_options");

  if (error || !data) {
    return null;
  }

  return data as unknown as DeliveryOptions;
}

// Zonas y favorito en una sola transacción (ENVIO-53).
export async function saveDeliveryPreferences(input: {
  zoneIds: string[];
  favoriteId: string | null;
}): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_delivery_preferences", {
    p_zone_ids: input.zoneIds,
    // La función admite nulo ("sin favorito"); los tipos generados no lo reflejan.
    p_favorite: input.favoriteId as string,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
