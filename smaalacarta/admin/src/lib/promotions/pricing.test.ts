import { describe, expect, it } from "vitest";

import { promotionPricing } from "./pricing";

// Una unidad de cada producto, salvo que se diga otra cosa.
const units = (...prices: number[]) => prices.map((price) => ({ price, quantity: 1 }));

describe("promotionPricing — ADMIN-PROMOS-4", () => {
  it("porcentaje: descuenta sobre la suma de los productos", () => {
    expect(
      promotionPricing({ type: "percent", discountPercent: 20, price: null }, units(1000, 2000)),
    ).toEqual({ original: 3000, final: 2400, saving: 600 });
  });

  it("porcentaje: redondea a 2 decimales", () => {
    const r = promotionPricing({ type: "percent", discountPercent: 15, price: null }, units(999.99));
    expect(r.final).toBe(849.99);
    expect(r.saving).toBe(150);
  });

  it("porcentaje: 100 % deja el precio en 0", () => {
    expect(
      promotionPricing({ type: "percent", discountPercent: 100, price: null }, units(500)),
    ).toEqual({ original: 500, final: 0, saving: 500 });
  });

  it("combo: el precio final es el fijo", () => {
    expect(
      promotionPricing({ type: "combo", discountPercent: 0, price: 2500 }, units(1000, 2000)),
    ).toEqual({ original: 3000, final: 2500, saving: 500 });
  });

  it("combo más caro que la suma: el ahorro nunca es negativo", () => {
    const r = promotionPricing({ type: "combo", discountPercent: 0, price: 5000 }, units(1000, 2000));
    expect(r.final).toBe(5000);
    expect(r.saving).toBe(0);
  });

  it("sin productos todo es 0 (y el combo mantiene su precio)", () => {
    expect(
      promotionPricing({ type: "percent", discountPercent: 20, price: null }, units()),
    ).toEqual({ original: 0, final: 0, saving: 0 });
    expect(
      promotionPricing({ type: "combo", discountPercent: 0, price: 100 }, units()).saving,
    ).toBe(0);
  });

  it("evita los errores de coma flotante al sumar", () => {
    expect(
      promotionPricing({ type: "percent", discountPercent: 10, price: null }, units(0.1, 0.2)).original,
    ).toBe(0.3);
  });

  it("multiplica el precio de cada producto por su cantidad", () => {
    expect(
      promotionPricing(
        { type: "combo", discountPercent: 0, price: 3000 },
        [
          { price: 1000, quantity: 3 },
          { price: 500, quantity: 1 },
        ],
      ),
    ).toEqual({ original: 3500, final: 3000, saving: 500 });
  });

  it("porcentaje: el descuento se aplica a la suma de precio × cantidad", () => {
    expect(
      promotionPricing(
        { type: "percent", discountPercent: 10, price: null },
        [
          { price: 1000, quantity: 3 },
          { price: 500, quantity: 1 },
        ],
      ),
    ).toEqual({ original: 3500, final: 3150, saving: 350 });
  });
});
