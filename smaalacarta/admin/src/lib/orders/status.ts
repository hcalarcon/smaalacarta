import { isPaymentPending } from "./payment";

// Estados de un pedido (ADMIN-PEDIDOS-1, ENVIO-9). La misma regla está en la base de datos
// (`set_order_status` y `courier_set_status`); los tests comparan la matriz completa.
// `handed_to_courier` y `on_the_way` solo existen en los pedidos con envío.
export const STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "handed_to_courier",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo",
  handed_to_courier: "Entregado al repartidor",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

// El camino normal; Cancelado queda aparte.
const FLOW: readonly OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "delivered"];

// El camino de un pedido con envío (ENVIO-9).
const COURIER_FLOW: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "handed_to_courier",
  "on_the_way",
  "delivered",
];

// Un pedido con envío: si ya lo aceptó el repartidor (ENVIO-8) y quién mueve el estado. El local
// llega hasta `handed_to_courier`; de ahí en adelante es del repartidor (ENVIO-9).
export type DeliveryContext = {
  courier: boolean;
  courierStatus?: string | null;
  actor?: "business" | "courier";
};

function isStatus(value: string): value is OrderStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export function isFinal(status: string) {
  return status === "delivered" || status === "cancelled";
}

// Desde un estado se puede pasar a uno posterior o cancelar; Entregado y Cancelado no cambian.
// Con el pago de Mercado Pago pendiente o fallido solo se puede cancelar (ADMIN-PEDIDOS-18).
// Con envío (`delivery.courier`): el pedido pendiente solo se cancela hasta que el repartidor
// acepta (ENVIO-8), el local no pasa a En camino ni a Entregado (ENVIO-9) y el repartidor
// (`actor: "courier"`) solo avanza de a un paso desde Entregado al repartidor, sin cancelar.
// Sin envío, los estados del repartidor no se ofrecen (ENVIO-10).
export function nextStatuses(
  from: string,
  paymentStatus?: string | null,
  delivery?: DeliveryContext,
): OrderStatus[] {
  if (!isStatus(from) || isFinal(from)) return [];

  const withCourier = delivery?.courier === true;
  const flow = withCourier ? COURIER_FLOW : FLOW;
  if (!flow.includes(from)) return [];

  if (withCourier && delivery?.actor === "courier") {
    if (from === "handed_to_courier") return ["on_the_way"];
    if (from === "on_the_way") return ["delivered"];
    return [];
  }

  if (isPaymentPending(paymentStatus)) return ["cancelled"];

  if (withCourier && from === "pending" && delivery?.courierStatus !== "accepted") {
    return ["cancelled"];
  }

  const later = flow
    .slice(flow.indexOf(from) + 1)
    .filter((status) => !(withCourier && (status === "on_the_way" || status === "delivered")));
  return [...later, "cancelled"];
}

export function canTransition(
  from: string,
  to: string,
  paymentStatus?: string | null,
  delivery?: DeliveryContext,
) {
  return (nextStatuses(from, paymentStatus, delivery) as string[]).includes(to);
}

const PRIMARY: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  pending: { status: "confirmed", label: "Confirmar" },
  confirmed: { status: "preparing", label: "Preparar" },
  preparing: { status: "ready", label: "Marcar listo" },
  ready: { status: "delivered", label: "Marcar entregado" },
};

const PRIMARY_COURIER: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  ...PRIMARY,
  ready: { status: "handed_to_courier", label: "Entregar al repartidor" },
};

// El botón principal de cada pedido: el paso natural siguiente. Con envío, el local termina en
// "Entregar al repartidor": el resto es del repartidor.
export function primaryAction(status: string, delivery?: DeliveryContext) {
  if (!isStatus(status)) return null;
  return (delivery?.courier ? PRIMARY_COURIER[status] : PRIMARY[status]) ?? null;
}

export type BoardColumn = "nuevos" | "en_curso" | "listos" | "cerrados";

// En qué columna del tablero se muestra. Un estado desconocido va a "cerrados": ni
// pide atención ni se pierde.
export function boardColumn(status: string): BoardColumn {
  switch (status) {
    case "pending":
      return "nuevos";
    case "confirmed":
    case "preparing":
      return "en_curso";
    case "ready":
    case "handed_to_courier":
    case "on_the_way":
      return "listos";
    default:
      return "cerrados";
  }
}
