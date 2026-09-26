import { describe, expect, it } from "vitest";

import { orderTotal, validateManualOrder, type ManualOrderInput } from "./manual-order";

const valid: ManualOrderInput = {
  customerName: "Ana Pérez",
  delivery: "retiro",
  payment: "efectivo",
  notes: "Sin sal",
  items: [
    { name: "Milanesa", unitPrice: 6500.5, quantity: 2 },
    { name: "Gaseosa", unitPrice: 900, quantity: 1 },
  ],
};

describe("validateManualOrder — ADMIN-PEDIDOS-3", () => {
  it("acepta un pedido válido", () => {
    expect(validateManualOrder(valid)).toEqual({ ok: true });
  });

  it("las entregas, pagos y notas son opcionales", () => {
    expect(validateManualOrder({ ...valid, delivery: "", payment: "", notes: "" })).toEqual({ ok: true });
  });

  it.each(["", "   ", "a".repeat(81)])("rechaza el nombre %j", (customerName) => {
    const r = validateManualOrder({ ...valid, customerName });
    expect(r.ok === false && r.errors.customerName).toBeTruthy();
  });

  it("acepta un nombre de 80 caracteres", () => {
    expect(validateManualOrder({ ...valid, customerName: "a".repeat(80) })).toEqual({ ok: true });
  });

  it("respeta los máximos de entrega, pago y notas", () => {
    const r = validateManualOrder({ ...valid, delivery: "a".repeat(31), payment: "a".repeat(31), notes: "a".repeat(501) });
    expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(["delivery", "notes", "payment"]);
  });

  it("exige al menos un producto", () => {
    const r = validateManualOrder({ ...valid, items: [] });
    expect(r.ok === false && r.errors.items).toBeTruthy();
  });

  it("acepta hasta 40 productos y rechaza 41", () => {
    const item = { name: "x", unitPrice: 1, quantity: 1 };
    expect(validateManualOrder({ ...valid, items: Array(40).fill(item) })).toEqual({ ok: true });
    const r = validateManualOrder({ ...valid, items: Array(41).fill(item) });
    expect(r.ok === false && r.errors.items).toBeTruthy();
  });

  it.each([
    ["sin nombre", { name: "  ", unitPrice: 1, quantity: 1 }],
    ["con un nombre de más de 100 caracteres", { name: "a".repeat(101), unitPrice: 1, quantity: 1 }],
    ["con precio negativo", { name: "a", unitPrice: -1, quantity: 1 }],
    ["con un precio absurdo", { name: "a", unitPrice: 100_000_000, quantity: 1 }],
    ["con un precio que no es número", { name: "a", unitPrice: Number.NaN, quantity: 1 }],
    ["con cantidad 0", { name: "a", unitPrice: 1, quantity: 0 }],
    ["con cantidad decimal", { name: "a", unitPrice: 1, quantity: 1.5 }],
    ["con cantidad de más de 99", { name: "a", unitPrice: 1, quantity: 100 }],
  ])("rechaza un producto %s", (_caso, item) => {
    const r = validateManualOrder({ ...valid, items: [item] });
    expect(r.ok === false && r.errors.items).toBeTruthy();
  });

  it("acepta un precio de cero y un producto de 100 caracteres", () => {
    expect(validateManualOrder({ ...valid, items: [{ name: "a".repeat(100), unitPrice: 0, quantity: 99 }] })).toEqual({ ok: true });
  });
});

describe("orderTotal", () => {
  it("suma precio por cantidad de cada producto", () => {
    expect(orderTotal(valid.items)).toBe(13901);
  });

  it("evita los errores de coma flotante", () => {
    expect(orderTotal([{ name: "a", unitPrice: 0.1, quantity: 3 }])).toBe(0.3);
    expect(orderTotal([{ name: "a", unitPrice: 0.1, quantity: 1 }, { name: "b", unitPrice: 0.2, quantity: 1 }])).toBe(0.3);
  });

  it("un pedido sin productos suma 0", () => {
    expect(orderTotal([])).toBe(0);
  });

  it("ignora los productos con datos que no son números", () => {
    expect(orderTotal([{ name: "a", unitPrice: Number.NaN, quantity: 2 }, { name: "b", unitPrice: 10, quantity: 1 }])).toBe(10);
  });
});
