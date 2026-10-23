// Qué pedidos piden atención primero en el tablero (ADMIN-PEDIDOS-53 y 54). Reglas puras: sin React.

import { searchWarning } from "./courier";
import { acceptsPrepTime, minutesLeft } from "./prep";
import { compareForBoard } from "./scheduled";

// Los pasos que dibuja la cinta de la tarjeta, de Nuevo a Entrega.
export const STEPS = ["Nuevo", "Aceptado", "Cocina", "Listo", "Entrega"] as const;

const STEP_BY_STATUS: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  handed_to_courier: 4,
  on_the_way: 4,
  delivered: 4,
};

// -1 si el estado no es del circuito (cancelado, desconocido).
export function stepIndex(status: string): number {
  return STEP_BY_STATUS[status] ?? -1;
}

// Un pendiente sin atender se vuelve media urgencia a los 5 minutos; una demora, cuando faltan 5 o menos.
const PENDING_MINUTES = 5;
const NEAR_MINUTES = 5;

type Urgent = {
  status: string;
  created_at: string;
  scheduled_for?: string | null;
  preorder?: boolean | null;
  prep_ready_at?: string | null;
  courier_status?: string | null;
  offered_at?: string | null;
  delivery_mode?: string | null;
};

// 2 = atrasado o sin repartidor (rojo), 1 = por vencer o sin atender (ámbar), 0 = en orden.
export function orderUrgency(order: Urgent, now: Date, offerCount = 0, assignMinutes?: number): 0 | 1 | 2 {
  const warning = searchWarning(
    {
      courier_status: order.courier_status ?? null,
      offered_at: order.offered_at ?? null,
      status: order.status,
      delivery_mode: order.delivery_mode ?? null,
    } as Parameters<typeof searchWarning>[0],
    now,
    offerCount,
    assignMinutes,
  );
  if (warning) return 2;

  const kitchen = order.status === "confirmed" || order.status === "preparing";
  if (kitchen && order.prep_ready_at && acceptsPrepTime({ scheduled_for: order.scheduled_for ?? null, preorder: order.preorder ?? false })) {
    const left = minutesLeft(order.prep_ready_at, now);
    if (!Number.isNaN(left)) {
      if (left < 0) return 2;
      if (left <= NEAR_MINUTES) return 1;
    }
  }

  if (order.status === "pending") {
    const waited = (now.getTime() - new Date(order.created_at).getTime()) / 60_000;
    if (waited >= PENDING_MINUTES) return 1;
  }

  return 0;
}

// Lo urgente primero; a igual urgencia, el orden de siempre (los "lo antes posible" por llegada, y los
// programados por su hora).
export function compareByUrgency<T extends Urgent & { scheduled_for?: string | null }>(
  a: T,
  b: T,
  now: Date,
  offerCount: (order: T) => number = () => 0,
  assignMinutes?: number,
): number {
  const diff = orderUrgency(b, now, offerCount(b), assignMinutes) - orderUrgency(a, now, offerCount(a), assignMinutes);
  return diff || compareForBoard(a as never, b as never);
}
