import { describe, expect, it } from "vitest";

import { newPendingIds, pendingCount } from "./alerts";

const order = (id: string, status: string) => ({ id, status });

describe("pedidos nuevos — ADMIN-PEDIDOS-6", () => {
  it("en el primer render, con nada visto, devuelve todos los pendientes", () => {
    const orders = [order("a", "pending"), order("b", "confirmed"), order("c", "pending")];
    expect(newPendingIds(new Set(), orders)).toEqual(["a", "c"]);
  });

  it("no repite un pedido que ya estaba visto", () => {
    const orders = [order("a", "pending"), order("b", "pending")];
    expect(newPendingIds(new Set(["a"]), orders)).toEqual(["b"]);
  });

  it("no cuenta un pedido que pasó de pendiente a confirmado", () => {
    expect(newPendingIds(new Set(), [order("a", "confirmed")])).toEqual([]);
  });

  it("con lista vacía no devuelve nada", () => {
    expect(newPendingIds(new Set(["a"]), [])).toEqual([]);
  });

  it("ignora los estados desconocidos", () => {
    expect(newPendingIds(new Set(), [order("a", "raro"), order("b", "")])).toEqual([]);
  });
});

describe("pendientes — ADMIN-PEDIDOS-7", () => {
  it("cuenta solo los pedidos en estado pending", () => {
    const orders = [
      order("a", "pending"),
      order("b", "pending"),
      order("c", "confirmed"),
      order("d", "cancelled"),
    ];
    expect(pendingCount(orders)).toBe(2);
  });

  it("con lista vacía es cero", () => {
    expect(pendingCount([])).toBe(0);
  });

  it("no suma los estados desconocidos", () => {
    expect(pendingCount([order("a", "raro")])).toBe(0);
  });
});
