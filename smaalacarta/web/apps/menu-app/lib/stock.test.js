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

describe("reconcileCart con opciones — PUBLICO-47", () => {
  const punto = {
    id: "g-punto", nombre: "Punto", min: 1, max: 1, repetir: false,
    opciones: [
      { id: "o-jugoso", nombre: "Jugoso", precio: 0, agotado: false },
      { id: "o-cocido", nombre: "Cocido", precio: 0, agotado: true },
    ],
  };
  const extras = {
    id: "g-extras", nombre: "Extras", min: 0, max: 2, repetir: false,
    opciones: [
      { id: "o-queso", nombre: "Queso", precio: 500, agotado: false },
      { id: "o-panceta", nombre: "Panceta", precio: 800, agotado: false },
    ],
  };
  const menuConOpciones = (opciones, precio = 1000) => ({
    categorias: [{ nombre: "Comidas", items: [{ id: "p-hamb", nombre: "Hamburguesa", precio, opciones }] }],
  });
  const elegida = (id, grupo, nombre, precio, cantidad = 1) => ({ id, grupo, nombre, precio, cantidad });
  const hamb = (elegidas, precio = 1500) => ({
    id: "p-hamb", nombre: "Hamburguesa", precio, precioBase: 1000, cantidad: 2, elegidas,
  });
  const valida = [elegida("o-jugoso", "Punto", "Jugoso", 0), elegida("o-queso", "Extras", "Queso", 500)];

  it("deja una línea cuyas opciones siguen existiendo y cumpliendo las reglas", () => {
    const r = reconcileCart([hamb(valida)], menuConOpciones([punto, extras]));

    expect(r.removed).toEqual([]);
    expect(r.cart).toHaveLength(1);
    expect(r.cart[0].cantidad).toBe(2);
  });

  it("quita la línea si una opción elegida ya no existe en el menú", () => {
    const r = reconcileCart([hamb(valida)], menuConOpciones([punto, { ...extras, opciones: [extras.opciones[1]] }]));

    expect(r.cart).toEqual([]);
    expect(r.removed).toEqual(["Hamburguesa"]);
  });

  it("quita la línea si una opción elegida se agotó", () => {
    const agotada = [elegida("o-cocido", "Punto", "Cocido", 0)];
    expect(reconcileCart([hamb(agotada, 1000)], menuConOpciones([punto, extras])).removed).toEqual(["Hamburguesa"]);
  });

  it("quita la línea si el grupo ya no se cumple (ahora pide más, o menos)", () => {
    const exige2 = { ...extras, min: 2, max: 2 };
    expect(reconcileCart([hamb(valida)], menuConOpciones([punto, exige2])).removed).toEqual(["Hamburguesa"]);

    const maximo0 = { ...extras, max: 1, opciones: extras.opciones };
    const dosExtras = [...valida, elegida("o-panceta", "Extras", "Panceta", 800)];
    expect(reconcileCart([hamb(dosExtras)], menuConOpciones([punto, maximo0])).removed).toEqual(["Hamburguesa"]);
  });

  it("quita una línea vieja, sin opciones, de un producto que ahora exige opciones", () => {
    const vieja = { id: "p-hamb", nombre: "Hamburguesa", precio: 1000, cantidad: 1 };
    const r = reconcileCart([vieja], menuConOpciones([punto, extras]));

    expect(r.cart).toEqual([]);
    expect(r.removed).toEqual(["Hamburguesa"]);
  });

  it("deja una línea vieja de un producto cuyos grupos son todos opcionales", () => {
    const vieja = { id: "p-hamb", nombre: "Hamburguesa", precio: 1000, cantidad: 1 };
    expect(reconcileCart([vieja], menuConOpciones([extras])).cart).toEqual([vieja]);
  });

  it("quita una línea con opciones de un producto que ya no tiene ninguna", () => {
    const r = reconcileCart([hamb(valida)], menuConOpciones([]));
    expect(r.removed).toEqual(["Hamburguesa"]);
  });

  it("vuelve a precificar la línea con los precios actuales del menú", () => {
    const menuNuevo = menuConOpciones(
      [punto, { ...extras, opciones: [{ ...extras.opciones[0], precio: 650 }, extras.opciones[1]] }],
      1200,
    );
    const r = reconcileCart([hamb(valida, 1500)], menuNuevo);

    expect(r.cart[0].precio).toBe(1200 + 650);
    expect(r.cart[0].precioBase).toBe(1200);
    expect(r.cart[0].elegidas.find((c) => c.id === "o-queso").precio).toBe(650);
    expect(r.cart[0].cantidad).toBe(2);
  });

  it("un carrito viejo de localStorage sin opciones sigue igual", () => {
    const cart = [line("p-cafe", "Café", { cantidad: 3 })];
    expect(reconcileCart(cart, menu)).toEqual({ cart, removed: [] });
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
