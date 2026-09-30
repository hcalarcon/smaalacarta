import { describe, expect, it } from "vitest";

import { newPendingIds, pendingCount, shouldRemind, tabTitle } from "./alerts";

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

describe("repetir el aviso — ADMIN-PEDIDOS-11", () => {
  const INTERVAL = 30_000;

  it("no repite antes de que pase el intervalo", () => {
    expect(shouldRemind(1_000, 1_000 + INTERVAL - 1, 2, INTERVAL)).toBe(false);
  });

  it("repite cuando pasó el intervalo justo o más", () => {
    expect(shouldRemind(1_000, 1_000 + INTERVAL, 2, INTERVAL)).toBe(true);
    expect(shouldRemind(1_000, 1_000 + INTERVAL * 3, 1, INTERVAL)).toBe(true);
  });

  it("no repite si no queda ningún pendiente", () => {
    expect(shouldRemind(1_000, 1_000 + INTERVAL * 3, 0, INTERVAL)).toBe(false);
  });

  it("si todavía no sonó nunca y hay pendientes, repite", () => {
    expect(shouldRemind(null, 5_000, 1, INTERVAL)).toBe(true);
  });
});

describe("título de la pestaña — ADMIN-PEDIDOS-12", () => {
  it("con pendientes muestra la cantidad y el título original", () => {
    expect(tabTitle("Pedidos", 3)).toBe("(3) Nuevo pedido · Pedidos");
  });

  it("sin pendientes deja el título original", () => {
    expect(tabTitle("Pedidos", 0)).toBe("Pedidos");
  });
});
