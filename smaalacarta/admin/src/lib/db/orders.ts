import { createClient } from "@/lib/supabase-server";
import type { OrderOffers } from "@/lib/orders/courier";
import type { OrderItemOption } from "@/lib/orders/item-options";
import { parseManualMenu, type ManualMenu } from "@/lib/orders/manual-menu";
import { phoneDigits, toRpcItems, type ManualOrderInput } from "@/lib/orders/manual-order";
import { todayAtIso } from "@/lib/orders/scheduled";

export type OrderItem = {
  name: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
  // Lo que el cliente eligió (grupo, nombre, cantidad y precio del momento); nulo sin opciones.
  options: OrderItemOption[] | null;
  // Lo que el cliente pidió para este producto (ADMIN-PEDIDOS-22); nulo si no dejó nota.
  note?: string | null;
};

export type OrderEvent = {
  kind: string;
  status: string;
  created_at: string;
  note: string | null;
};

// Lo que se sabe del envío con repartidor de un pedido (ENVIO-6); todo nulo si no lleva. El teléfono
// del cliente (`customer_phone`) está en todos los pedidos (ENVIO-70).
export type OrderDelivery = {
  // Cuándo llega al local según el repartidor, y por qué lo devolvió el repartidor (ENVIO-164 y 166).
  courier_eta_pickup_at?: string | null;
  returned_reason_kind?: string | null;
  returned_reason?: string | null;
  // El local pidió auto (ENVIO-176).
  needs_car?: boolean;
  courier_id: string | null;
  delivery_zone_id: string | null;
  delivery_zone_name: string | null;
  delivery_fee_list: number | null;
  delivery_fee: number | null;
  delivery_fee_reason: string | null;
  delivery_fee_changed_at: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  courier_status: string | null;
  courier_note: string | null;
  courier_responded_at: string | null;
  // La búsqueda de repartidor (ENVIO-59 y 95): cuándo se abrió.
  offered_at: string | null;
  delivery_mode: string | null;
  // Rendición del efectivo (ENVIO-39): cuándo la marcó el repartidor y cuándo la confirmó el local.
  settled_at: string | null;
  settlement_received_at: string | null;
};

export type Order = OrderDelivery & OrderPrep & {
  id: string;
  order_number: string;
  status: string;
  total: number;
  notes: string | null;
  customer_name: string | null;
  delivery: string | null;
  payment: string | null;
  payment_status: string;
  source: "web" | "manual";
  scheduled_for: string | null;
  preorder: boolean;
  code: string;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
  order_events: OrderEvent[];
  // Los cambios del envío (`kind = 'delivery'`): quién lo tomó, lo devolvió o lo asignó, y el precio.
  delivery_events: OrderEvent[];
};

// El tiempo estimado que cargó el local (ADMIN-PEDIDOS-34); nulo si no lo cargó.
export type OrderPrep = {
  prep_ready_at: string | null;
  prep_reason: string | null;
  prep_updated_at: string | null;
};

const SELECT =
  "id, order_number, status, total, notes, customer_name, delivery, payment, payment_status, source, scheduled_for, preorder, code, created_at, updated_at, " +
  "courier_id, delivery_zone_id, delivery_zone_name, delivery_fee_list, delivery_fee, delivery_fee_reason, delivery_fee_changed_at, customer_phone, delivery_address, courier_status, courier_note, courier_responded_at, offered_at, delivery_mode, courier_eta_pickup_at, returned_reason_kind, returned_reason, needs_car, settled_at, settlement_received_at, prep_ready_at, prep_reason, prep_updated_at, " +
  "order_items(name, quantity, unit_price, sort_order, options, note), order_events(kind, status, created_at, note)";

// Los pedidos más recientes del negocio, con su detalle y su línea de tiempo. El RLS
// deja ver solo los del negocio (ADMIN-PEDIDOS-2); el filtro por negocio es doble
// seguro.
export async function listOrders(businessId: string, limit = 150): Promise<Order[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(SELECT)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as Order[]).map((order) => ({
    ...order,
    order_items: [...(order.order_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    // Los eventos de pago (`kind = 'payment'`) no son pasos de la línea de tiempo.
    order_events: (order.order_events ?? [])
      .filter((event) => event.kind === "status")
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    delivery_events: (order.order_events ?? [])
      .filter((event) => event.kind === "delivery")
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

type DbFailure = { error: { code?: string; message?: string } };

// Las ofertas abiertas de los pedidos que buscan repartidor en el negocio de quien llama (ENVIO-111). La
// función resuelve antes lo que ya venció (ENVIO-106): se llama ANTES de leer los pedidos, así lo que
// se lee ya está resuelto. Si falla, el tablero sigue sin ofertas.
export async function listOrderOffers(): Promise<OrderOffers[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("business_order_offers");

  if (error || !Array.isArray(data)) return [];

  return data as unknown as OrderOffers[];
}

export async function setOrderStatus(
  orderId: string,
  status: string,
  note?: string,
  from?: string,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_note: note ?? null,
    p_from: from ?? null,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Lo que hace falta saber de un pedido para decidir si se le carga tiempo (ADMIN-PEDIDOS-33). `order` es
// nulo si el pedido no es del negocio: el filtro y el RLS lo dejan afuera.
export type OrderPrepState = Pick<Order, "status" | "scheduled_for" | "preorder" | "prep_ready_at" | "courier_status">;

export async function getOrderPrepState(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; order: OrderPrepState | null } | DbFailure> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select("status, scheduled_for, preorder, prep_ready_at, courier_status")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return { error: { code: error.code, message: error.message } };

  return { ok: true, order: (data as OrderPrepState | null) ?? null };
}

// Carga o demora el tiempo estimado: en `minutes` minutos desde ahora (ADMIN-PEDIDOS-37). La base valida el
// rango, el motivo, el estado y que el pedido sea del negocio de quien llama.
export async function setOrderPrep(
  orderId: string,
  minutes: number,
  reason: string | null,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_order_prep", {
    p_order_id: orderId,
    p_ready_in_minutes: minutes,
    // La clave se omite sin motivo: la función usa su DEFAULT.
    ...(reason ? { p_reason: reason } : {}),
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// La sugerencia de la base para el selector de Aceptar (ADMIN-PEDIDOS-32): nulo si no hay suficientes
// pedidos o la llamada falla (el selector usa entonces el tiempo por defecto).
export async function getSuggestedPrepMinutes(businessId: string): Promise<number | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("suggested_prep_minutes", { p_business_id: businessId });

  return !error && typeof data === "number" ? data : null;
}

// Asigna a mano un repartidor a un pedido que está buscando (ENVIO-67). La base comprueba que quien
// llama es del negocio del pedido y que el repartidor está activo y cubre la zona.
export async function assignCourier(
  orderId: string,
  courierId: string,
  note: string | null,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("business_assign_courier", {
    p_order_id: orderId,
    p_courier_id: courierId,
    // La clave se omite cuando no hay valor: la función usa su DEFAULT.
    ...(note ? { p_note: note } : {}),
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// "Lo llevo yo" (ENVIO-68): el local resuelve el envío él mismo.
export async function selfDelivery(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("business_self_delivery", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// El local confirma que recibió lo que el repartidor marcó como rendido (ENVIO-39). La base exige
// que sea del negocio del pedido, que el repartidor ya lo haya marcado y que no esté confirmado.
export async function confirmSettlement(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("business_confirm_settlement", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

export type CreatedManualOrder = { ok: true; id: string; code: string; number: number; total: number };

export async function createManualOrder(
  businessId: string,
  input: ManualOrderInput,
  courier: boolean,
): Promise<CreatedManualOrder | DbFailure> {
  const supabase = await createClient();

  // El barrio, la dirección y el modo solo viajan con envío con repartidor: así la base no los rechaza
  // (P0016) cuando el diálogo los dejó cargados y el pedido pasó a retiro.
  const withCourier = courier && input.delivery.trim() === "delivery";
  const address = (input.address ?? "").trim();

  const { data, error } = await supabase.rpc("create_manual_order", {
    p_business_id: businessId,
    p_customer_name: input.customerName.trim(),
    p_delivery: input.delivery.trim(),
    p_payment: input.payment.trim(),
    p_notes: input.notes.trim(),
    p_scheduled_for: (input.scheduledFor ? todayAtIso(input.scheduledFor) : null) as string,
    p_items: toRpcItems(input.items),
    // Las funciones aceptan nulo; los tipos generados no lo reflejan.
    p_customer_phone: (phoneDigits(input.phone) || null) as string,
    p_delivery_zone: (withCourier ? input.zoneId?.trim() || null : null) as string,
    p_delivery_address: (input.delivery.trim() === "delivery" && address ? address : null) as string,
    p_courier_mode: (withCourier ? input.courierMode?.trim() || null : null) as string,
  });

  if (error) {
    return { error: { code: error.code, message: error.message } };
  }

  const result = data as unknown as { id: string; code: string; number: number; total: number };
  return { ok: true, id: result.id, code: result.code, number: result.number, total: Number(result.total) };
}

// El menú del negocio con las opciones de cada producto, para cargar un pedido a mano (ADMIN-PEDIDOS-47):
// el mismo formato que el menú público, de `menu_preview`. Nunca lanza: sin menú, el diálogo queda vacío y
// el local puede cargar productos libres.
export async function getManualOrderMenu(businessId: string): Promise<ManualMenu> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("menu_preview", { p_business_id: businessId });
  if (error) return parseManualMenu(null);

  return parseManualMenu(data);
}

// "Necesita auto" (ENVIO-176): el local lo prende o lo apaga mientras el pedido no tiene repartidor. La base
// exige que sea del negocio y que siga buscando (`P0004` si no).
export async function setOrderNeedsCar(orderId: string, needsCar: boolean): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_order_needs_car", { p_order_id: orderId, p_needs_car: needsCar });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
