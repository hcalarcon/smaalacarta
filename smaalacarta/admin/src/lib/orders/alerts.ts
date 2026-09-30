type OrderLike = { id: string; status: string };

// Ids de pedidos pendientes que el tablero todavía no vio.
export function newPendingIds(
  seenIds: ReadonlySet<string>,
  orders: OrderLike[],
): string[] {
  return orders
    .filter((o) => o.status === "pending" && !seenIds.has(o.id))
    .map((o) => o.id);
}

export function pendingCount(orders: OrderLike[]): number {
  return orders.filter((o) => o.status === "pending").length;
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

export function tabTitle(originalTitle: string, pendingCount: number): string {
  return pendingCount > 0
    ? `(${pendingCount}) Nuevo pedido · ${originalTitle}`
    : originalTitle;
}
