import type { OrderRecord, WebhookPayload } from "./events";

// Un pedido con envío, buscando repartidor, para armar los casos de los tests de los avisos.
export const ORDER: OrderRecord = {
  id: "0d0d0d0d-0000-0000-0000-000000000001",
  business_id: "a1a1a1a1-0000-0000-0000-000000000001",
  order_number: "0042",
  status: "pending",
  source: "web",
  courier_status: "searching",
  courier_id: null,
  payment_status: "not_required",
  delivery: "delivery",
  customer_name: "Lucía",
  delivery_zone_id: "e1e1e1e1-0000-0000-0000-000000000001",
  courier_zone_id: null,
  delivery_zone_name: "Cantera",
  delivery_fee_list: 5000,
  delivery_fee: 5000,
  no_offers_alerted_at: null,
  created_at: "2026-10-12T15:00:00.000Z",
  total: 12500,
  new_order_reminders: 0,
  prep_ready_at: null,
  pickup_reminder_sent_at: null,
};

export const insert = (record: Partial<OrderRecord> = {}): WebhookPayload => ({
  type: "INSERT",
  table: "orders",
  record: { ...ORDER, ...record },
  old_record: null,
});

export const update = (before: Partial<OrderRecord>, after: Partial<OrderRecord>): WebhookPayload => ({
  type: "UPDATE",
  table: "orders",
  record: { ...ORDER, ...after },
  old_record: { ...ORDER, ...before },
});
