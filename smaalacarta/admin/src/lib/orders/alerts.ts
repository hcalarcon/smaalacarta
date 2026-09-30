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
