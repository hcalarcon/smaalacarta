import type { CourierPanelOrder } from "@/lib/courier/panel";
import { createClient } from "@/lib/supabase-server";

// Datos del panel del repartidor (ENVIO-31 a 38). Todo corre con la sesión del repartidor: lo que
// ve y toca lo decide el RLS y las funciones de la base, y las acciones nunca reciben su id.

type DbFailure = { error: { code?: string; message?: string } };

// Los pedidos con envío del repartidor, los más nuevos primero (ENVIO-15): los de los últimos
// días y todo lo que sigue abierto. Si la base falla, el error llega a la página.
export async function listCourierOrders(): Promise<CourierPanelOrder[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_orders");

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as unknown as CourierPanelOrder[]) : [];
}

// Pasa un pedido entregado al repartidor a En camino, y de ahí a Entregado (ENVIO-14).
export async function courierSetStatus(
  orderId: string,
  status: "on_the_way" | "delivered",
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_set_status", {
    p_order_id: orderId,
    p_status: status,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// El repartidor marca que ya rindió al local lo cobrado del pedido (ENVIO-39). La base exige que
// sea suyo, en efectivo, entregado y sin marcar.
export async function courierMarkSettled(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_mark_settled", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

export type CourierZone = {
  id: string;
  name: string;
  price: number;
  sort_order: number;
  active: boolean;
};

const ZONE_COLUMNS = "id, name, price, sort_order, active";

// Los barrios del repartidor, en su orden (ENVIO-36). El filtro por repartidor es doble seguro:
// el RLS ya deja ver solo los suyos.
export async function listZones(courierId: string): Promise<CourierZone[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courier_zones")
    .select(ZONE_COLUMNS)
    .eq("courier_id", courierId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((zone) => ({ ...zone, price: Number(zone.price) }));
}

// Alta al final de la lista.
export async function createZone(
  courierId: string,
  input: { name: string; price: number },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("courier_zones")
    .select("sort_order")
    .eq("courier_id", courierId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("courier_zones").insert({
    courier_id: courierId,
    name: input.name,
    price: input.price,
    sort_order: (last?.sort_order ?? 0) + 1,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Cambia nombre, precio o si está activo. Un precio nuevo vale para los pedidos nuevos: los que
// ya se hicieron guardan su precio de lista (ENVIO-6).
export async function updateZone(
  courierId: string,
  zoneId: string,
  changes: { name?: string; price?: number; active?: boolean },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("courier_zones")
    .update(changes)
    .eq("id", zoneId)
    .eq("courier_id", courierId);

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

export async function deleteZone(courierId: string, zoneId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("courier_zones")
    .delete()
    .eq("id", zoneId)
    .eq("courier_id", courierId);

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Guarda la posición de cada barrio, desde 0 (mismo criterio que las categorías). Cada
// actualización filtra por repartidor y por id: un id ajeno no cambia nada.
export async function saveZoneOrder(
  courierId: string,
  orderedIds: string[],
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("courier_zones").update({ sort_order: index }).eq("id", id).eq("courier_id", courierId),
    ),
  );

  const failed = results.find((result) => result.error);
  return failed?.error ? { error: { code: failed.error.code, message: failed.error.message } } : { ok: true };
}
