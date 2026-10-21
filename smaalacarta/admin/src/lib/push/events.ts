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
  // La hora de listo que cargó el local y la marca del aviso previo para retirar (ENVIO-158 y 159).
  prep_ready_at: string | null;
  pickup_reminder_sent_at: string | null;
  // Cuándo cambió por última vez: solo para medir cuánto tarda el webhook en llegar (ENVIO-172).
  updated_at?: string;
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
  | "courier_pickup_soon"
  | "courier_order_ready"
  | "courier_prep_changed"
  // Al local
  | "local_new_order"
  | "local_new_order_reminder"
  | "local_courier_chosen"
  | "local_no_offers";

export type PushEvent = { kind: PushEventKind; order: OrderRecord };

// Lo que manda el Database Webhook sobre `courier_availability_events` (ENVIO-194): un registro por cada
// prendida o apagada del repartidor.
export type AvailabilityEventRecord = {
  id: string;
  courier_id: string;
  available: boolean;
  reason: string;
};

// El repartidor al que se le apagó la disponibilidad por falta de actividad, o nulo si el cambio no es ese. Solo
// el apagado automático avisa: el que apaga a mano ya sabe lo que hizo.
export function detectAutoOff(payload: { type: string; table: string; record: unknown }): string | null {
  if (payload.table !== "courier_availability_events" || payload.type !== "INSERT") return null;

  const record = payload.record as Partial<AvailabilityEventRecord> | null;
  if (!record || record.reason !== "auto_off" || record.available !== false) return null;

  return typeof record.courier_id === "string" && record.courier_id ? record.courier_id : null;
}

// Dos horas son la misma si son el mismo instante, aunque vengan escritas distinto (`+00:00` o `Z`, con o
// sin milisegundos, otra zona horaria): comparar el texto avisaría de un cambio que no existe (ENVIO-167).
function isDifferentInstant(a: string, b: string | null): boolean {
  if (b === null) return true;

  // Postgres puede escribir la zona como `+00`, que `Date` no entiende: se completa a `+00:00`.
  const instant = (value: string) => new Date(value.replace(/([T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?[+-]\d\d)$/, "$1:00")).getTime();
  const left = instant(a);
  const right = instant(b);

  if (Number.isNaN(left) || Number.isNaN(right)) return a !== b;
  return left !== right;
}

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
    // El pedido manual que el local asigna a su favorito al cargarlo nace con repartidor (ENVIO-142).
    if (order.courier_status === "accepted" && order.courier_id) add("courier_chosen");
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

  // Avisos al repartidor que ya tiene el pedido (ENVIO-158 a 160). Un pedido cerrado no avisa más.
  const withCourier =
    order.courier_id !== null &&
    order.courier_status === "accepted" &&
    order.status !== "cancelled" &&
    order.status !== "delivered";

  if (withCourier) {
    // El cron suma la marca 10 minutos antes de la hora de listo; que se borre (se rearma) no avisa.
    if (
      order.pickup_reminder_sent_at !== null &&
      before.pickup_reminder_sent_at === null &&
      (order.status === "confirmed" || order.status === "preparing")
    ) {
      add("courier_pickup_soon");
    }

    if (order.status === "ready" && before.status !== "ready") add("courier_order_ready");

    if (
      order.prep_ready_at !== null &&
      isDifferentInstant(order.prep_ready_at, before.prep_ready_at) &&
      order.status !== "ready" &&
      order.status !== "handed_to_courier" &&
      order.status !== "on_the_way"
    ) {
      add("courier_prep_changed");
    }
  }

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
