import type { AvailableOrder, CourierPanelOrder } from "@/lib/courier/panel";
import { createClient } from "@/lib/supabase-server";

// Datos del panel del repartidor (ENVIO-31 a 38, 57 y 62 a 66). Todo corre con la sesión del repartidor: lo que
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

// Los pedidos que el repartidor puede tomar ahora (ENVIO-62): ya descontados los que rechazó o devolvió
// y los que todavía están en la ventana del favorito de otro. Si la base falla, el error llega a la página.
export async function listAvailableOrders(): Promise<AvailableOrder[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_available_orders");

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as unknown as AvailableOrder[]) : [];
}

export type TakeOrderInput = { note: string | null; fee: number | null; feeReason: string | null };

// Toma el pedido (ENVIO-63 y 64): el primero se lo queda; si ya lo tomó otro, la base da `P0019`.
export async function courierTakeOrder(
  orderId: string,
  input: TakeOrderInput,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_take_order", {
    p_order_id: orderId,
    // La clave se omite cuando no hay valor: la función usa su DEFAULT.
    ...(input.fee !== null ? { p_price: input.fee } : {}),
    ...(input.feeReason ? { p_reason: input.feeReason } : {}),
    ...(input.note ? { p_note: input.note } : {}),
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Rechaza el pedido (ENVIO-65): deja de verlo este repartidor.
export async function courierDeclineOrder(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_decline_order", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Devuelve un pedido que había tomado, con motivo (ENVIO-66).
export async function courierReturnOrder(orderId: string, reason: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_return_order", { p_order_id: orderId, p_reason: reason });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
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

// Una zona de la plataforma con la marca "La llevo" del repartidor (ENVIO-57).
export type CoverageZone = {
  id: string;
  name: string;
  price: number;
  covered: boolean;
};

// Las zonas activas con su precio de referencia y si este repartidor las cubre. Las zonas las lee
// cualquier usuario con sesión y la cobertura propia la deja ver el RLS; el filtro por repartidor es
// doble seguro.
export async function listCoverageZones(courierId: string): Promise<CoverageZone[]> {
  const supabase = await createClient();

  const [zones, coverage] = await Promise.all([
    supabase
      .from("delivery_zones")
      .select("id, name, price")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("courier_zone_coverage").select("zone_id").eq("courier_id", courierId),
  ]);

  if (zones.error) {
    throw new Error(zones.error.message);
  }
  if (coverage.error) {
    throw new Error(coverage.error.message);
  }

  const covered = new Set((coverage.data ?? []).map((row) => row.zone_id));

  return (zones.data ?? []).map((zone) => ({
    id: zone.id,
    name: zone.name,
    price: Number(zone.price),
    covered: covered.has(zone.id),
  }));
}

// Marca o desmarca "La llevo". Es idempotente: marcar dos veces no falla.
export async function setZoneCoverage(
  courierId: string,
  zoneId: string,
  covered: boolean,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = covered
    ? await supabase
        .from("courier_zone_coverage")
        .upsert({ courier_id: courierId, zone_id: zoneId }, { onConflict: "courier_id,zone_id", ignoreDuplicates: true })
    : await supabase.from("courier_zone_coverage").delete().eq("courier_id", courierId).eq("zone_id", zoneId);

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
