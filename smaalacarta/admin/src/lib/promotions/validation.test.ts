import { describe, expect, it } from "vitest";

import { normalizePromotion, validatePromotion } from "./validation";

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

describe("normalizePromotion", () => {
  const input = {
    name: "  Combo café ",
    description: "  con medialuna ",
    type: "percent" as const,
    discountPercent: 20,
    price: 999,
    productIds: ["p1"],
    active: true,
  };

  it("un porcentaje guarda el descuento y ningún precio", () => {
    expect(normalizePromotion(input)).toMatchObject({
      name: "Combo café",
      description: "con medialuna",
      type: "percent",
      discountPercent: 20,
      price: null,
    });
  });

  it("un combo guarda el precio y descuento 0", () => {
    expect(
      normalizePromotion({ ...input, type: "combo", discountPercent: 55, price: 2500 }),
    ).toMatchObject({ type: "combo", discountPercent: 0, price: 2500 });
  });

  it("la descripción vacía queda vacía, no nula (la base la guarda tal cual)", () => {
    expect(normalizePromotion({ ...input, description: "   " }).description).toBe("");
  });
});

describe("imagen, vigencia y stock — ADMIN-PROMO-2, 5 y 7", () => {
  const now = new Date("2026-10-20T15:00:00Z");
  const check = (extra: Parameters<typeof validatePromotion>[0]) => validatePromotion({ ...extra, now });
  const errorsOf = (extra: Partial<Parameters<typeof validatePromotion>[0]>) => {
    const r = check({ ...base, ...extra });
    return r.ok ? {} : r.errors;
  };

  it("una promoción sin nada de esto sigue siendo válida", () => {
    expect(check({ ...base, imageUrl: "", imageProductId: null, validUntil: null, stock: null })).toEqual({ ok: true });
  });

  it("acepta la imagen propia o la de un producto de la promoción", () => {
    expect(errorsOf({ imageUrl: "https://x/y.jpg" }).image).toBeUndefined();
    expect(errorsOf({ imageProductId: "p1" }).image).toBeUndefined();
  });

  it("rechaza las dos a la vez y la de un producto que no está en la promoción", () => {
    expect(errorsOf({ imageUrl: "https://x/y.jpg", imageProductId: "p1" }).image).toBeTruthy();
    expect(errorsOf({ imageProductId: "p9" }).image).toBeTruthy();
  });

  it("la fecha de fin nueva tiene que ser futura", () => {
    expect(errorsOf({ validUntil: "2026-10-21T02:59:00.000Z" }).validUntil).toBeUndefined();
    expect(errorsOf({ validUntil: "2026-10-20T14:59:00.000Z" }).validUntil).toBeTruthy();
    expect(errorsOf({ validUntil: "2026-10-20T15:00:00.000Z" }).validUntil).toBeTruthy();
    expect(errorsOf({ validUntil: "mañana" }).validUntil).toBeTruthy();
  });

  it("una fecha ya vencida que no se tocó no bloquea guardar", () => {
    const past = "2026-10-01T02:59:00.000Z";
    expect(errorsOf({ validUntil: past, initialValidUntil: past }).validUntil).toBeUndefined();
    expect(errorsOf({ validUntil: past, initialValidUntil: null }).validUntil).toBeTruthy();
  });

  it("el stock es un entero de 1 en adelante, o vacío", () => {
    expect(errorsOf({ stock: 1 }).stock).toBeUndefined();
    expect(errorsOf({ stock: 200 }).stock).toBeUndefined();
    expect(errorsOf({ stock: null }).stock).toBeUndefined();
    for (const stock of [0, -3, 2.5, Number.NaN]) {
      expect(errorsOf({ stock }).stock).toBeTruthy();
    }
  });
});

describe("normalizePromotion con imagen y vigencia — ADMIN-PROMO-2", () => {
  const input = {
    name: " Combo ",
    description: "",
    type: "percent" as const,
    discountPercent: 10,
    price: null,
    productIds: ["p1"],
    active: true,
  };

  it("sin imagen ni vigencia deja todo en nulo", () => {
    expect(normalizePromotion(input)).toMatchObject({
      imageUrl: null,
      imageProductId: null,
      validUntil: null,
      stock: null,
    });
  });

  it("la imagen propia gana y descarta la del producto", () => {
    expect(normalizePromotion({ ...input, imageUrl: " https://x/y.jpg ", imageProductId: "p1" })).toMatchObject({
      imageUrl: "https://x/y.jpg",
      imageProductId: null,
    });
  });

  it("conserva la vigencia y el stock", () => {
    expect(normalizePromotion({ ...input, validUntil: "2026-10-21T02:59:00.000Z", stock: 12 })).toMatchObject({
      validUntil: "2026-10-21T02:59:00.000Z",
      stock: 12,
    });
  });
});
