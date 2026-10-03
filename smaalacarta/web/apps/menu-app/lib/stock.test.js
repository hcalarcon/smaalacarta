import { describe, expect, it } from "vitest";

import { DICTIONARY, LANGS } from "./i18n.js";
import { isSoldOut, reconcileCart } from "./stock.js";

const menu = {
  categorias: [
    {
      nombre: "Ofertas",
      tipo: "ofertas",
      items: [{ id: "promo-1", esPromo: true, nombre: "Combo", precio: 1500 }],
    },
    {
      nombre: "Bebidas",
      items: [
        { id: "p-cafe", nombre: "Café", precio: 1000, agotado: false },
        { id: "p-te", nombre: "Té", precio: 800, agotado: true },
      ],
    },
  ],
};

const line = (id, nombre, extra = {}) => ({ id, nombre, precio: 1, cantidad: 1, ...extra });

describe("isSoldOut — PUBLICO-26", () => {
  it("solo un 'agotado' verdadero cuenta; un menú sin el dato (JSON) no tiene agotados", () => {
    expect(isSoldOut({ agotado: true })).toBe(true);
    expect(isSoldOut({ agotado: false })).toBe(false);
    expect(isSoldOut({})).toBe(false);
    expect(isSoldOut(null)).toBe(false);
    expect(isSoldOut({ agotado: "true" })).toBe(false);
  });
});

describe("reconcileCart — PUBLICO-26", () => {
  it("quita del carrito un producto que ahora está sin stock y dice cuál", () => {
    const r = reconcileCart([line("p-cafe", "Café"), line("p-te", "Té")], menu);

    expect(r.cart.map((i) => i.id)).toEqual(["p-cafe"]);
    expect(r.removed).toEqual(["Té"]);
  });

  it("quita una promoción que el menú ya no ofrece (lleva algo sin stock)", () => {
    const r = reconcileCart([line("promo-2", "Desayuno", { esPromo: true })], menu);

    expect(r.cart).toEqual([]);
    expect(r.removed).toEqual(["Desayuno"]);
  });

  it("deja lo que sigue disponible, con sus cantidades", () => {
    const cart = [line("p-cafe", "Café", { cantidad: 3 }), line("promo-1", "Combo", { esPromo: true })];
    const r = reconcileCart(cart, menu);

    expect(r.cart).toEqual(cart);
    expect(r.removed).toEqual([]);
  });

  it("un ítem sin id (menú de JSON) no se toca", () => {
    const cart = [{ nombre: "Milanesa", precio: 5000, cantidad: 1 }];

    expect(reconcileCart(cart, menu)).toEqual({ cart, removed: [] });
  });

  it("un carrito vacío o inválido queda vacío", () => {
    expect(reconcileCart([], menu)).toEqual({ cart: [], removed: [] });
    expect(reconcileCart(null, menu)).toEqual({ cart: [], removed: [] });
  });
});

describe("textos de sin stock — PUBLICO-27", () => {
  it.each(["item.soldOut", "cart.removedSoldOut", "error.outOfStock"])(
    "%s está en los tres idiomas",
    (key) => {
      for (const lang of LANGS) {
        expect(DICTIONARY[lang][key], `${key} (${lang})`).toBeTruthy();
      }
    },
  );

  it("el aviso de lo quitado lleva el lugar para los nombres", () => {
    for (const lang of LANGS) {
      expect(DICTIONARY[lang]["cart.removedSoldOut"]).toContain("{names}");
    }
  });
});
