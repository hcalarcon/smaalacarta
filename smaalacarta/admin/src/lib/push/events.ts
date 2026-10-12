// Qué avisos salen de un cambio en `orders` (ADMIN-PWA-18 a 25). Puro: recibe lo que manda el Database
// Webhook de Supabase y devuelve los eventos; quién los recibe y el texto se resuelven aparte
// (`service.ts`, `messages.ts`).

// Solo las columnas de `orders` que leen los avisos.
export type OrderRecord = {
  id: string;
  business_id: string;
  order_number: string;
  status: string;
  // `web` (el cliente) o `manual` (lo cargó el local).
  source: string;
  courier_status: string | null;
  courier_id: string | null;
  payment_status: string;
  delivery: string | null;
  customer_name: string | null;
  delivery_zone_id: string | null;
  delivery_zone_name: string | null;
  delivery_fee_list: number | null;
  delivery_fee: number | null;
  no_offers_alerted_at: string | null;
  // Para el texto del recordatorio ("sin atender hace X min") y el total del aviso.
  created_at: string;
  total: number | null;
  // Cuántos recordatorios de pedido sin atender mandó `run_order_timers()` (ADMIN-PWA-33).
  new_order_reminders: number;
};

export type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: OrderRecord | null;
  old_record: OrderRecord | null;
};

export type PushEventKind =
  // Al repartidor
  | "offer_new"
  | "courier_chosen"
  | "courier_not_chosen"
  | "order_cancelled"
  // Al local
  | "local_new_order"
  | "local_new_order_reminder"
  | "local_courier_chosen"
  | "local_no_offers";

export type PushEvent = { kind: PushEventKind; order: OrderRecord };

// ¿Los repartidores pueden verlo y ofertar? Es la misma regla que `courier_sees_order` en la base, sin lo
// que depende de cada repartidor (zona que cubre, rechazos): buscando, sin elegido, abierto y, si es de
// Mercado Pago, ya pagado.
function isOfferable(order: OrderRecord | null): boolean {
  return (
    !!order &&
    order.courier_status === "searching" &&
    order.courier_id === null &&
    order.delivery_zone_id !== null &&
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.payment_status !== "awaiting" &&
    order.payment_status !== "failed"
  );
}

export function detectEvents(payload: WebhookPayload): PushEvent[] {
  if (payload.table !== "orders" || !payload.record) return [];

  const order = payload.record;
  const before = payload.old_record;
  const events: PushEvent[] = [];
  const add = (kind: PushEventKind) => events.push({ kind, order });

  if (payload.type === "INSERT") {
    if (isOfferable(order)) add("offer_new");
    // Lo que carga el propio local no se le avisa a sí mismo.
    if (order.source === "web") add("local_new_order");
    return events;
  }

  if (payload.type !== "UPDATE" || !before) return [];

  // Pasa a ser ofertable: lo confirmó el local (anticipado o programado), volvió por una devolución o se
  // pagó. Un cambio que ya lo era (otro estado, una nota) no vuelve a avisar.
  if (isOfferable(order) && !isOfferable(before)) add("offer_new");

  if (before.courier_status === "searching") {
    if (order.courier_status === "accepted" && order.courier_id) {
      add("courier_chosen");
      add("courier_not_chosen");
      add("local_courier_chosen");
    } else if (order.courier_status === "self") {
      // "Lo llevo yo" del local: nadie fue elegido, todos los que ofertaron pierden.
      add("courier_not_chosen");
    }
  }

  if (order.status === "cancelled" && before.status !== "cancelled") add("order_cancelled");

  // El cron suma un recordatorio mientras el pedido por menú sigue sin atender; si ya lo atendieron en el
  // medio, el aviso no tiene sentido.
  if (
    order.new_order_reminders > before.new_order_reminders &&
    order.status === "pending" &&
    order.source === "web"
  ) {
    add("local_new_order_reminder");
  }

  if (
    before.no_offers_alerted_at === null &&
    order.no_offers_alerted_at !== null &&
    order.courier_status === "searching"
  ) {
    add("local_no_offers");
  }

  return events;
}
