// Estados de un pedido (ADMIN-PEDIDOS-1). La misma regla está en la base de datos
// (`set_order_status`); los tests comparan la matriz completa.
export const STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

// El camino normal; Cancelado queda aparte.
const FLOW = ["pending", "confirmed", "preparing", "ready", "delivered"] as const;

function isStatus(value: string): value is OrderStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export function isFinal(status: string) {
  return status === "delivered" || status === "cancelled";
}

// Desde un estado se puede pasar a uno posterior o cancelar; Entregado y Cancelado
// no cambian.
export function nextStatuses(from: string): OrderStatus[] {
  if (!isStatus(from) || isFinal(from)) return [];

  const later = FLOW.slice(FLOW.indexOf(from as (typeof FLOW)[number]) + 1);
  return [...later, "cancelled"];
}

export function canTransition(from: string, to: string) {
  return (nextStatuses(from) as string[]).includes(to);
}

const PRIMARY: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  pending: { status: "confirmed", label: "Confirmar" },
  confirmed: { status: "preparing", label: "Preparar" },
  preparing: { status: "ready", label: "Marcar listo" },
  ready: { status: "delivered", label: "Marcar entregado" },
};

// El botón principal de cada pedido: el paso natural siguiente.
export function primaryAction(status: string) {
  return isStatus(status) ? (PRIMARY[status] ?? null) : null;
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
      return "listos";
    default:
      return "cerrados";
  }
}
