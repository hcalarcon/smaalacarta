import { describe, expect, it } from "vitest";

import { validatePromotion } from "./validation";

const base = {
  name: "Combo café",
  type: "percent",
  discountPercent: 20,
  price: null as number | null,
  productIds: ["p1", "p2"],
};

describe("validatePromotion — ADMIN-PROMOS-1", () => {
  it("acepta un porcentaje válido", () => {
    expect(validatePromotion(base)).toEqual({ ok: true });
  });

  it("acepta un combo con precio", () => {
    expect(
      validatePromotion({ ...base, type: "combo", discountPercent: 0, price: 2500 }),
    ).toEqual({ ok: true });
  });

  it.each(["", "  ", "a"])("rechaza el nombre %j", (name) => {
    const r = validatePromotion({ ...base, name });
    expect(r.ok === false && r.errors.name).toBeTruthy();
  });

  it("rechaza un tipo desconocido", () => {
    const r = validatePromotion({ ...base, type: "sorteo" });
    expect(r.ok === false && r.errors.type).toBeTruthy();
  });

  it.each([0, -5, 101, Number.NaN])("rechaza el porcentaje %s", (discountPercent) => {
    const r = validatePromotion({ ...base, discountPercent });
    expect(r.ok === false && r.errors.discountPercent).toBeTruthy();
  });

  it.each([1, 50, 100])("acepta el porcentaje %s", (discountPercent) => {
    expect(validatePromotion({ ...base, discountPercent })).toEqual({ ok: true });
  });

  it.each([null, 0, -1, Number.NaN])("rechaza el precio %s en un combo", (price) => {
    const r = validatePromotion({ ...base, type: "combo", discountPercent: 0, price });
    expect(r.ok === false && r.errors.price).toBeTruthy();
  });

  it("no mira el precio en un porcentaje ni el porcentaje en un combo", () => {
    expect(validatePromotion({ ...base, price: 999 })).toEqual({ ok: true });
    expect(
      validatePromotion({ ...base, type: "combo", discountPercent: 55, price: 100 }),
    ).toEqual({ ok: true });
  });

  it("exige al menos un producto", () => {
    const r = validatePromotion({ ...base, productIds: [] });
    expect(r.ok === false && r.errors.products).toBeTruthy();
  });

  it("no acepta el mismo producto dos veces", () => {
    const r = validatePromotion({ ...base, productIds: ["p1", "p1"] });
    expect(r.ok === false && r.errors.products).toBeTruthy();
  });
});
