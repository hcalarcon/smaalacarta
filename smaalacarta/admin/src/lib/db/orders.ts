import { createClient } from "@/lib/supabase-server";
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

// Lo que se sabe del envío con repartidor de un pedido (ENVIO-6); todo nulo si no lleva.
export type OrderDelivery = {
  courier_id: string | null;
  delivery_zone_name: string | null;
  delivery_fee_list: number | null;
  delivery_fee: number | null;
  delivery_fee_reason: string | null;
  delivery_fee_changed_at: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  courier_status: string | null;
  courier_note: string | null;
  courier_requested_at: string | null;
  courier_responded_at: string | null;
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
  // Los cambios del envío (`kind = 'delivery'`): consultas y respuestas del repartidor, precio.
  delivery_events: OrderEvent[];
};

const SELECT =
  "id, order_number, status, total, notes, customer_name, delivery, payment, payment_status, source, scheduled_for, preorder, code, created_at, updated_at, " +
  "courier_id, delivery_zone_name, delivery_fee_list, delivery_fee, delivery_fee_reason, delivery_fee_changed_at, customer_phone, delivery_address, courier_status, courier_note, courier_requested_at, courier_responded_at, settled_at, settlement_received_at, " +
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

export type CourierActionInput = {
  action: "request" | "accept" | "reject";
  note: string | null;
  fee: number | null;
  feeReason: string | null;
};

// Registra una consulta o una respuesta del repartidor, con precio final y motivo si cambió
// (ENVIO-11 y 12). La base comprueba que quien llama es del negocio del pedido.
export async function setOrderCourier(
  orderId: string,
  input: CourierActionInput,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_order_courier", {
    p_order_id: orderId,
    p_action: input.action,
    // La clave se omite cuando no hay valor: la función usa su DEFAULT.
    ...(input.note ? { p_note: input.note } : {}),
    ...(input.fee !== null ? { p_fee: input.fee } : {}),
    ...(input.feeReason ? { p_fee_reason: input.feeReason } : {}),
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// El local confirma que recibió lo que el repartidor marcó como rendido (ENVIO-39). La base exige
// que sea del negocio del pedido, que el repartidor ya lo haya marcado y que no esté confirmado.
export async function confirmSettlement(orderId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("business_confirm_settlement", { p_order_id: orderId });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

export type ActiveCourier = { name: string; whatsapp: string | null };

// El repartidor activo (nombre y WhatsApp), para armar el mensaje de "Pedir envío". Solo lo leen
// los miembros de un negocio con `courier_delivery` (RLS); sin permiso o sin repartidor, null.
export async function getActiveCourier(): Promise<ActiveCourier | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("couriers")
    .select("name, whatsapp")
    .eq("active", true)
    .maybeSingle();

  return data ? { name: data.name, whatsapp: data.whatsapp } : null;
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
