import { describe, expect, it } from "vitest";

import {
  byHour,
  byWeekday,
  comparePeriods,
  deltaPercent,
  summarize,
  topProducts,
  type MetricOrder,
} from "./metrics";

function order(extra: Partial<MetricOrder> = {}): MetricOrder {
  return {
    status: "delivered",
    total: 1000,
    source: "web",
    created_at: "2026-03-10T15:00:00Z",
    order_items: [],
    ...extra,
  };
}

describe("summarize — ADMIN-METRICAS-2", () => {
  it("con una lista vacía devuelve ceros, sin dividir por cero", () => {
    expect(summarize([])).toEqual({
      count: 0,
      revenue: 0,
      avgTicket: 0,
      cancelled: 0,
      unconfirmed: 0,
      webCount: 0,
      manualCount: 0,
    });
  });

  it("suma como vendidos confirmed, preparing, ready y delivered", () => {
    const result = summarize(
      ["confirmed", "preparing", "ready", "delivered"].map((status) => order({ status, total: 500 })),
    );
    expect(result.count).toBe(4);
    expect(result.revenue).toBe(2000);
  });

  it("los cancelados no suman y los pendientes se cuentan aparte", () => {
    const result = summarize([
      order({ total: 1000 }),
      order({ status: "cancelled", total: 9999 }),
      order({ status: "pending", total: 5000 }),
    ]);
    expect(result).toMatchObject({ count: 1, revenue: 1000, cancelled: 1, unconfirmed: 1 });
  });

  it("el ticket promedio es el total sobre la cantidad, redondeado", () => {
    const result = summarize([order({ total: 1000 }), order({ total: 1000 }), order({ total: 1001 })]);
    expect(result.avgTicket).toBe(1000); // 3001 / 3 = 1000,33
  });

  it("separa lo que vino por el menú web de lo cargado a mano", () => {
    const result = summarize([
      order({ source: "web" }),
      order({ source: "web" }),
      order({ source: "manual" }),
      order({ source: "web", status: "cancelled" }),
    ]);
    expect(result).toMatchObject({ webCount: 2, manualCount: 1 });
  });
});

describe("comparePeriods — ADMIN-METRICAS-3", () => {
  const now = new Date("2026-03-10T18:00:00Z"); // martes 10, hora argentina 15:00

  it("separa los últimos N días (con hoy) de los N anteriores", () => {
    const dentro = order({ created_at: "2026-03-04T03:00:00Z" }); // primer instante del período
    const justoAntes = order({ created_at: "2026-03-04T02:59:59Z" }); // último del anterior
    const anterior = order({ created_at: "2026-02-25T03:00:00Z" });
    const fuera = order({ created_at: "2026-02-25T02:59:59Z" });

    const { current, previous } = comparePeriods([dentro, justoAntes, anterior, fuera], now, 7);

    expect(current).toEqual([dentro]);
    expect(previous).toEqual([justoAntes, anterior]);
  });

  it("un pedido de las 23:30 argentinas cuenta en ese día, no en el siguiente", () => {
    // 02:30 UTC del 11 = 23:30 del 10 en Argentina; con days = 1 es "hoy".
    const tarde = order({ created_at: "2026-03-11T02:30:00Z" });
    const { current } = comparePeriods([tarde], new Date("2026-03-11T02:45:00Z"), 1);
    expect(current).toEqual([tarde]);
  });
});

describe("deltaPercent — ADMIN-METRICAS-3", () => {
  it("es null si el período anterior es 0", () => {
    expect(deltaPercent(5, 0)).toBeNull();
  });

  it("sube y baja, en enteros", () => {
    expect(deltaPercent(112, 100)).toBe(12);
    expect(deltaPercent(50, 100)).toBe(-50);
    expect(deltaPercent(4, 3)).toBe(33);
  });

  it("sin cambios es 0", () => {
    expect(deltaPercent(10, 10)).toBe(0);
  });
});

describe("topProducts — ADMIN-METRICAS-4", () => {
  it("suma unidades entre pedidos vendidos e ignora cancelados y pendientes", () => {
    const result = topProducts([
      order({ order_items: [{ name: "Café", quantity: 2 }, { name: "Medialuna", quantity: 1 }] }),
      order({ order_items: [{ name: "Café", quantity: 3 }] }),
      order({ status: "cancelled", order_items: [{ name: "Té", quantity: 50 }] }),
      order({ status: "pending", order_items: [{ name: "Té", quantity: 50 }] }),
    ]);
    expect(result).toEqual([
      { name: "Café", quantity: 5 },
      { name: "Medialuna", quantity: 1 },
    ]);
  });

  it("en empate ordena por nombre", () => {
    const result = topProducts([
      order({ order_items: [{ name: "Té", quantity: 2 }, { name: "Café", quantity: 2 }, { name: "Jugo", quantity: 2 }] }),
    ]);
    expect(result.map((p) => p.name)).toEqual(["Café", "Jugo", "Té"]);
  });

  it("respeta el límite", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, quantity: 8 - i }));
    expect(topProducts([order({ order_items: items })])).toHaveLength(5);
    expect(topProducts([order({ order_items: items })], 2)).toHaveLength(2);
  });
});

describe("byHour y byWeekday — ADMIN-METRICAS-4", () => {
  it("un pedido de las 23:30 argentinas cae en la hora 23 y en el día correcto", () => {
    // Lunes 9 de marzo 23:30 en Argentina = martes 10 02:30 UTC.
    const tarde = order({ created_at: "2026-03-10T02:30:00Z" });
    const hours = byHour([tarde]);
    expect(hours).toHaveLength(24);
    expect(hours[23]).toBe(1);
    expect(hours[2]).toBe(0);

    const days = byWeekday([tarde]);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(1); // lunes
    expect(days[1]).toBe(0);
  });

  it("cuentan solo pedidos vendidos", () => {
    const orders = [order(), order({ status: "cancelled" }), order({ status: "pending" })];
    expect(byHour(orders).reduce((a, b) => a + b, 0)).toBe(1);
    expect(byWeekday(orders).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("con una lista vacía son todo ceros", () => {
    expect(byHour([])).toEqual(Array(24).fill(0));
    expect(byWeekday([])).toEqual(Array(7).fill(0));
  });
});
