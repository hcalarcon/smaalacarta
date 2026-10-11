import { createClient } from "@/lib/supabase-server";
import type { OrderOffers } from "@/lib/orders/courier";
import type { OrderItemOption } from "@/lib/orders/item-options";
import type { ManualOrderInput } from "@/lib/orders/manual-order";
import { todayAtIso } from "@/lib/orders/scheduled";

export type OrderItem = {
  name: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
  // Lo que el cliente eligió (grupo, nombre, cantidad y precio del momento); nulo sin opciones.
  options: OrderItemOption[] | null;
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
  // Rendición del efectivo (ENVIO-39): cuándo la marcó el repartidor y cuándo la confirmó el local.
  settled_at: string | null;
  settlement_received_at: string | null;
};

export type Order = OrderDelivery & {
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

const SELECT =
  "id, order_number, status, total, notes, customer_name, delivery, payment, payment_status, source, scheduled_for, preorder, code, created_at, updated_at, " +
  "courier_id, delivery_zone_id, delivery_zone_name, delivery_fee_list, delivery_fee, delivery_fee_reason, delivery_fee_changed_at, customer_phone, delivery_address, courier_status, courier_note, courier_responded_at, offered_at, settled_at, settlement_received_at, " +
  "order_items(name, quantity, unit_price, sort_order, options), order_events(kind, status, created_at, note)";

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
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_note: note ?? null,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
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

export async function createManualOrder(
  businessId: string,
  input: ManualOrderInput,
): Promise<{ ok: true; code: string; number: number } | DbFailure> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_manual_order", {
    p_business_id: businessId,
    p_customer_name: input.customerName.trim(),
    p_delivery: input.delivery.trim(),
    p_payment: input.payment.trim(),
    p_notes: input.notes.trim(),
    p_scheduled_for: (input.scheduledFor ? todayAtIso(input.scheduledFor) : null) as string,
    p_items: input.items.map((item) => ({
      name: item.name.trim(),
      unit_price: item.unitPrice,
      quantity: item.quantity,
    })),
  });

  if (error) {
    return { error: { code: error.code, message: error.message } };
  }

  const result = data as unknown as { code: string; number: number };
  return { ok: true, code: result.code, number: result.number };
}
