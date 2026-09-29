import { describe, expect, it } from "vitest";

import { buildEnhancedMenu } from "./menu.js";

const cafe = { nombre: "Café", precio: 1000 };
const torta = { nombre: "Torta", precio: 4000, destacado: true };
const pizza = { nombre: "Pizza", precio: 5200, precioAnterior: 6500, promo: "20% OFF" };
const combo = { nombre: "Combo", precio: 3500, promo: "Combo" };

describe("buildEnhancedMenu — MENU-1 a 3", () => {
  it("sin destacados ni ofertas deja las categorías como están", () => {
    const menu = { categorias: [{ nombre: "Bebidas", items: [cafe] }] };

    expect(buildEnhancedMenu(menu)).toEqual(menu);
  });

  it("junta los destacados en una sección al principio", () => {
    const menu = {
      categorias: [
        { nombre: "Bebidas", items: [cafe] },
        { nombre: "Postres", items: [torta] },
      ],
    };

    const result = buildEnhancedMenu(menu);

    expect(result.categorias.map((c) => c.nombre)).toEqual(["Destacados", "Bebidas", "Postres"]);
    expect(result.categorias[0]).toEqual({ nombre: "Destacados", tipo: "destacados", items: [torta] });
  });

  it("junta en Ofertas lo que tiene precio anterior o promo, después de los destacados", () => {
    const menu = {
      categorias: [{ nombre: "Comidas", items: [torta, pizza, combo, cafe] }],
    };

    const result = buildEnhancedMenu(menu);

    expect(result.categorias.map((c) => c.nombre)).toEqual(["Destacados", "Ofertas", "Comidas"]);
    expect(result.categorias[1]).toEqual({ nombre: "Ofertas", tipo: "ofertas", items: [pizza, combo] });
  });

  it("si el menú ya trae su categoría de ofertas (las promociones del admin) no arma otra", () => {
    const menu = {
      categorias: [
        { nombre: "Ofertas", tipo: "ofertas", items: [combo] },
        { nombre: "Comidas", items: [pizza] },
      ],
    };

    const result = buildEnhancedMenu(menu);

    expect(result.categorias.map((c) => c.nombre)).toEqual(["Ofertas", "Comidas"]);
  });

  it("no toca las categorías originales ni su orden", () => {
    const original = { nombre: "Comidas", items: [torta, cafe] };
    const result = buildEnhancedMenu({ categorias: [original] });

    expect(result.categorias.at(-1)).toBe(original);
  });

  it.each([null, undefined, {}, { categorias: null }])("con %j devuelve lo mismo", (menu) => {
    expect(buildEnhancedMenu(menu)).toBe(menu);
  });
});

describe("buildEnhancedMenu en otros idiomas — IDIOMA-1", () => {
  it("traduce los nombres de Destacados y Ofertas, no el contenido del negocio", () => {
    const menu = {
      categorias: [{ nombre: "Pizzas", items: [{ nombre: "Muzza", destacado: true, promo: "2x1" }] }],
    };
    const result = buildEnhancedMenu(menu, "en");
    expect(result.categorias.map((c) => c.nombre)).toEqual(["Featured", "Deals", "Pizzas"]);
    expect(buildEnhancedMenu(menu, "pt").categorias[0].nombre).toBe("Destaques");
  });

  it("traduce también la categoría de ofertas que ya trae el menú", () => {
    const menu = { categorias: [{ nombre: "Ofertas", tipo: "ofertas", items: [{ nombre: "x" }] }] };
    expect(buildEnhancedMenu(menu, "en").categorias[0].nombre).toBe("Deals");
    expect(buildEnhancedMenu(menu).categorias[0].nombre).toBe("Ofertas");
  });
});
