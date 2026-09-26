import { createClient } from "@/lib/supabase-server";
import type { ManualOrderInput } from "@/lib/orders/manual-order";

export type OrderItem = {
  name: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
};

export type OrderEvent = {
  status: string;
  created_at: string;
};

export type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  notes: string | null;
  customer_name: string | null;
  delivery: string | null;
  payment: string | null;
  source: "web" | "manual";
  code: string;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
  order_events: OrderEvent[];
};

const SELECT =
  "id, order_number, status, total, notes, customer_name, delivery, payment, source, code, created_at, updated_at, " +
  "order_items(name, quantity, unit_price, sort_order), order_events(status, created_at)";

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
    order_events: [...(order.order_events ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
  }));
}

type DbFailure = { error: { code?: string; message?: string } };

export async function setOrderStatus(
  orderId: string,
  status: string,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_order_status", {
    p_order_id: orderId,
    p_status: status,
  });

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
