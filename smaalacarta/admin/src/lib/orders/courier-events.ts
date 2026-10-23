import type { OrderEvent } from "@/lib/db/orders";

// Avisos de Pedidos cuando un repartidor toma o devuelve un pedido (ADMIN-PEDIDOS-61). Compara la lista
// anterior con la nueva: lo que ya pasaba al abrir la pantalla no avisa.

// Lo que se mira de un pedido (un subconjunto de `Order`).
export type CourierWatched = {
  id: string;
  order_number: string;
  status: string;
  courier_id: string | null;
  courier_status: string | null;
  returned_reason_kind?: string | null;
  returned_reason?: string | null;
  delivery_events: OrderEvent[];
};

export type CourierEvent = {
  kind: "taken" | "returned";
  orderId: string;
  orderNumber: string;
  courierName: string | null;
  reason: string | null;
};

// Así empieza la nota que deja `business_assign_courier` cuando el local asigna a mano.
const ASSIGNED_BY_LOCAL = "Envío asignado";

function returnReason(order: CourierWatched): string | null {
  switch (order.returned_reason_kind) {
    case "delay_changed":
      return "Cambió la demora";
    case "vehicle":
      return "Problema con el vehículo";
    case "other":
      return order.returned_reason?.trim() || null;
    default:
      return null;
  }
}

// ¿Llegó una asignación a mano que el pedido no tenía antes? La hizo el local: no se le avisa.
function assignedByLocal(before: CourierWatched, after: CourierWatched): boolean {
  return after.delivery_events
    .slice(before.delivery_events.length)
    .some((event) => event.note?.startsWith(ASSIGNED_BY_LOCAL));
}

export function detectCourierEvents(
  previous: CourierWatched[],
  next: CourierWatched[],
  courierName: (courierId: string | null) => string | null,
): CourierEvent[] {
  const before = new Map(previous.map((order) => [order.id, order]));
  const events: CourierEvent[] = [];

  for (const order of next) {
    const old = before.get(order.id);
    if (!old || order.status === "cancelled" || order.status === "delivered") continue;

    if (old.courier_status === "searching" && order.courier_status === "accepted" && order.courier_id) {
      if (assignedByLocal(old, order)) continue;

      events.push({
        kind: "taken",
        orderId: order.id,
        orderNumber: order.order_number,
        courierName: courierName(order.courier_id),
        reason: null,
      });
    } else if (old.courier_status === "accepted" && old.courier_id && order.courier_status === "searching") {
      events.push({
        kind: "returned",
        orderId: order.id,
        orderNumber: order.order_number,
        courierName: courierName(old.courier_id),
        reason: returnReason(order),
      });
    }
  }

  return events;
}
