import { cache } from "react";

import type { AvailableOrder, CourierPanelOrder } from "@/lib/courier/panel";
import { fromRow, type CourierPreferences } from "@/lib/courier/profile";
import { fromRow as fromVehicleRow, type CourierVehicles } from "@/lib/courier/vehicle";
import { createClient } from "@/lib/supabase-server";

// Datos del panel del repartidor (ENVIO-31 a 38, 57 y 62 a 66). Todo corre con la sesión del repartidor: lo que
// ve y toca lo decide el RLS y las funciones de la base, y las acciones nunca reciben su id.

type DbFailure = { error: { code?: string; message?: string } };

// Los pedidos con envío del repartidor, los más nuevos primero (ENVIO-15): los de los últimos
// días y todo lo que sigue abierto. Si la base falla, el error llega a la página.
// Con `cache`, el layout (contador de la barra) y la página comparten una sola consulta por pedido.
export const listCourierOrders = cache(async (): Promise<CourierPanelOrder[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_orders");

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as unknown as CourierPanelOrder[]) : [];
});

// Los pedidos por los que el repartidor puede ofertar ahora (ENVIO-101), más los que cerró hace un rato.
// La base resuelve antes lo vencido (ENVIO-106). Si falla, el error llega a la página.
export async function listAvailableOrders(): Promise<AvailableOrder[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_available_orders");

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as unknown as AvailableOrder[]) : [];
}

// Oferta por el pedido, o cambia la propia (ENVIO-98): con el precio de lista o con otro y su motivo. Si el
// pedido ya no recibe ofertas, la base da `P0020`.
export async function courierMakeOffer(
  orderId: string,
  input: { price: number; reason: string | null },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_make_offer", {
    p_order_id: orderId,
    p_price: input.price,
    // La clave se omite cuando no hay motivo: la función usa su DEFAULT.
    ...(input.reason ? { p_reason: input.reason } : {}),
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Toma el pedido al precio de lista, en el modo de precio fijo (ENVIO-147): gana el primero que llega y
// al otro la base le da `P0019`.
export async function courierTakeOrder(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_take_order", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Retira la propia oferta mientras el cliente no eligió (ENVIO-100).
export async function courierWithdrawOffer(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_withdraw_offer", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Rechaza el pedido (ENVIO-102): deja de verlo este repartidor y retira su oferta.
export async function courierDeclineOrder(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_decline_order", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Devuelve un pedido que había tomado, con motivo (ENVIO-66).
export async function courierReturnOrder(
  orderId: string,
  kind: "delay_changed" | "vehicle" | "other",
  reason: string | null,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_return_order", {
    p_order_id: orderId,
    p_kind: kind,
    ...(reason === null ? {} : { p_reason: reason }),
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Pasa un pedido entregado al repartidor a En camino, y de ahí a Entregado (ENVIO-14).
export async function courierSetStatus(
  orderId: string,
  status: "on_the_way" | "delivered",
  from?: string,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_set_status", {
    p_order_id: orderId,
    p_status: status,
    p_from: from ?? null,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Carga "llego al local en X" o "llego al cliente en X" (ENVIO-157). La base exige que el pedido sea suyo, el
// rango de 1 a 120 y el estado que corresponde.
export async function courierSetEta(
  orderId: string,
  kind: "pickup" | "dropoff",
  minutes: number,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_set_eta", { p_order_id: orderId, p_kind: kind, p_minutes: minutes });

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

// Las preferencias del repartidor (ADMIN-REPARTIDOR-1): las lee con su sesión; el RLS solo le deja las suyas.
export async function getCourierPreferences(): Promise<CourierPreferences> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courier_preferences")
    .select("shops_on_the_way, seeks_orders, note")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return fromRow(data);
}

// Se guardan con la función de la base, que toma al repartidor de la sesión (no hay escritura directa).
export async function saveCourierPreferences(value: CourierPreferences): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_save_preferences", {
    p_shops_on_the_way: value.shopsOnTheWay,
    p_seeks_orders: value.seeksOrders,
    p_note: value.note,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// El vehículo del repartidor (ENVIO-174): moto, auto o los dos. Lo lee con su sesión; el RLS solo le deja el suyo.
export async function getCourierVehicles(): Promise<CourierVehicles> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("couriers").select("moto, auto").maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return fromVehicleRow(data);
}

// Se guarda con la función de la base, que toma al repartidor de la sesión y exige al menos un vehículo.
export async function saveCourierVehicles(value: CourierVehicles): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_save_vehicles", { p_moto: value.moto, p_auto: value.auto });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
