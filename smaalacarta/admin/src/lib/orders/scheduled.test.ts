import { describe, expect, it } from "vitest";

import { compareForBoard, scheduledLabel, todayAtIso } from "./scheduled";
import { validateManualOrder, type ManualOrderInput } from "./manual-order";

// Argentina es UTC-3 todo el año.
describe("scheduledLabel — ADMIN-PEDIDOS-15", () => {
  it("dice 'Para las HH:MM' en hora de Argentina", () => {
    expect(scheduledLabel("2026-01-05T23:30:00Z")).toBe("Para las 20:30");
    expect(scheduledLabel("2026-01-06T02:05:00Z")).toBe("Para las 23:05");
  });

  it("un pedido sin hora, o con una hora que no se entiende, no tiene distintivo", () => {
    expect(scheduledLabel(null)).toBeNull();
    expect(scheduledLabel(undefined)).toBeNull();
    expect(scheduledLabel("no es una fecha")).toBeNull();
  });
});

describe("compareForBoard — ADMIN-PEDIDOS-15", () => {
  const o = (id: string, created: string, scheduled: string | null = null) => ({
    id,
    created_at: created,
    scheduled_for: scheduled,
  });
  const sorted = (orders: ReturnType<typeof o>[]) => [...orders].sort(compareForBoard).map((x) => x.id);

  it("sin pedidos programados, del más viejo al más nuevo, como siempre", () => {
    expect(sorted([o("b", "2026-01-05T12:05:00Z"), o("a", "2026-01-05T12:00:00Z")])).toEqual(["a", "b"]);
  });

  it("los programados van por la hora para la que son, no por cuándo llegaron", () => {
    const list = [
      o("tarde", "2026-01-05T12:00:00Z", "2026-01-05T23:30:00Z"),
      o("temprano", "2026-01-05T12:30:00Z", "2026-01-05T22:00:00Z"),
    ];
    expect(sorted(list)).toEqual(["temprano", "tarde"]);
  });

  it("los 'lo antes posible' van antes que los programados, por llegada", () => {
    const list = [
      o("prog", "2026-01-05T11:00:00Z", "2026-01-05T22:00:00Z"),
      o("ya2", "2026-01-05T12:10:00Z"),
      o("ya1", "2026-01-05T12:00:00Z"),
    ];
    expect(sorted(list)).toEqual(["ya1", "ya2", "prog"]);
  });

  it("a la misma hora, desempata por llegada", () => {
    const list = [
      o("b", "2026-01-05T12:30:00Z", "2026-01-05T22:00:00Z"),
      o("a", "2026-01-05T12:00:00Z", "2026-01-05T22:00:00Z"),
    ];
    expect(sorted(list)).toEqual(["a", "b"]);
  });
});

describe("todayAtIso — ADMIN-PEDIDOS-14", () => {
  it("arma la hora de hoy en Argentina como instante", () => {
    // 15:00 UTC del 5 de enero = 12:00 en Argentina.
    expect(todayAtIso("20:30", new Date("2026-01-05T15:00:00Z"))).toBe("2026-01-05T23:30:00.000Z");
  });

  it("'hoy' es el día de Argentina, no el de UTC", () => {
    // 01:00 UTC del 6 de enero es todavía el 5 a las 22:00 en Argentina.
    expect(todayAtIso("21:00", new Date("2026-01-06T01:00:00Z"))).toBe("2026-01-06T00:00:00.000Z");
  });

  it.each(["", "25:00", "9:30", "20:60", "abc"])("%j no es una hora: devuelve null", (value) => {
    expect(todayAtIso(value, new Date("2026-01-05T15:00:00Z"))).toBeNull();
  });
});

describe("validateManualOrder con 'Para las' — ADMIN-PEDIDOS-14", () => {
  const valid: ManualOrderInput = {
    customerName: "Ana",
    delivery: "",
    payment: "",
    notes: "",
    items: [{ name: "Café", unitPrice: 1000, quantity: 1 }],
  };

  it("es opcional", () => {
    expect(validateManualOrder(valid)).toEqual({ ok: true });
    expect(validateManualOrder({ ...valid, scheduledFor: "" })).toEqual({ ok: true });
  });

  it("acepta una hora HH:MM", () => {
    expect(validateManualOrder({ ...valid, scheduledFor: "20:30" })).toEqual({ ok: true });
  });

  it("rechaza algo que no es una hora", () => {
    const r = validateManualOrder({ ...valid, scheduledFor: "mañana" });
    expect(r.ok === false && r.errors.scheduledFor).toBe("Ingresá una hora, por ejemplo 20:30.");
  });
});
