type OrderLike = { id: string; status?: string };

// Qué pedidos hay que atender. Para el local, los pendientes; el panel del repartidor pasa el
// suyo (los que esperan su respuesta, ENVIO-33).
const isPendingStatus = (order: OrderLike) => order.status === "pending";

// Ids de pedidos pendientes que el tablero todavía no vio.
export function newPendingIds<T extends OrderLike>(
  seenIds: ReadonlySet<string>,
  orders: T[],
  isPending: (order: T) => boolean = isPendingStatus,
): string[] {
  return orders.filter((o) => isPending(o) && !seenIds.has(o.id)).map((o) => o.id);
}

export function pendingCount<T extends OrderLike>(
  orders: T[],
  isPending: (order: T) => boolean = isPendingStatus,
): number {
  return orders.filter((o) => isPending(o)).length;
}

// ¿Toca repetir el aviso? Mientras quede algún pendiente, cada `intervalMs` desde el
// último sonido (`null` si todavía no sonó).
export function shouldRemind(
  lastBeepAt: number | null,
  now: number,
  pendingCount: number,
  intervalMs: number,
): boolean {
  if (pendingCount <= 0) return false;
  return lastBeepAt === null || now - lastBeepAt >= intervalMs;
}

export function tabTitle(
  originalTitle: string,
  pendingCount: number,
  label = "Nuevo pedido",
): string {
  return pendingCount > 0 ? `(${pendingCount}) ${label} · ${originalTitle}` : originalTitle;
}
