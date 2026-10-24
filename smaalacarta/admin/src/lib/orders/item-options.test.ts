import { describe, expect, it } from "vitest";

import { itemOptionLines, itemTitle } from "./item-options";

const option = (nombre: string, cantidad = 1, extra: Record<string, unknown> = {}) => ({
  grupo: "Extras",
  nombre,
  cantidad,
  precio: 0,
  ...extra,
});

describe("itemOptionLines — ADMIN-PEDIDOS-20", () => {
  it("una línea por opción elegida, con ×N si se repite", () => {
    expect(itemOptionLines([option("Queso"), option("Frutilla", 2)])).toEqual(["+ Queso", "+ Frutilla ×2"]);
  });

  it("sin opciones (ítem sin elegir, pedido viejo o manual) no hay líneas", () => {
    expect(itemOptionLines(null)).toEqual([]);
    expect(itemOptionLines(undefined)).toEqual([]);
    expect(itemOptionLines([])).toEqual([]);
  });

  it("ignora lo que no tiene forma de opción en vez de romper el tablero", () => {
    const raw = [null, "texto", 5, { nombre: "" }, { cantidad: 2 }, option("Ok")] as unknown;
    expect(itemOptionLines(raw as never)).toEqual(["+ Ok"]);
    expect(itemOptionLines("no es lista" as never)).toEqual([]);
  });
});

describe("itemTitle — MP-8", () => {
  it("el nombre solo si no hay opciones", () => {
    expect(itemTitle("Café", null)).toBe("Café");
    expect(itemTitle("Café", [])).toBe("Café");
  });

  it("suma las opciones elegidas al título", () => {
    expect(itemTitle("Helado", [option("Frutilla", 2), option("Chocolate")])).toBe(
      "Helado (Frutilla ×2, Chocolate)",
    );
  });

  // Mercado Pago limita el título: mejor cortarlo que perder el cobro.
  it("no pasa de 250 caracteres y termina en puntos suspensivos si lo corta", () => {
    const title = itemTitle("Helado", Array.from({ length: 40 }, (_, i) => option(`Sabor número ${i}`)));

    expect(title.length).toBeLessThanOrEqual(250);
    expect(title.endsWith("…")).toBe(true);
    expect(title.startsWith("Helado (Sabor número 0")).toBe(true);
  });

  it("un nombre sin opciones no se toca aunque sea largo", () => {
    const name = "x".repeat(100);
    expect(itemTitle(name, null)).toBe(name);
  });
});

describe("promociones con componentes — ADMIN-PROMOS-9", () => {
  const emp = (gusto: string) => ({ producto: "Empanada clásica", opciones: [option(gusto, 1, { grupo: "Gusto" })] });
  const comps = [emp("Carne"), emp("Carne"), emp("Pollo"), { producto: "Gaseosas" }];

  it("una línea por unidad distinta, juntando las iguales", () => {
    expect(itemOptionLines(comps)).toEqual([
      "2× Empanada clásica: Carne",
      "Empanada clásica: Pollo",
      "Gaseosas",
    ]);
  });

  it("el título de Mercado Pago lleva lo elegido en cada unidad", () => {
    expect(itemTitle("Combo", comps)).toBe(
      "Combo (2× Empanada clásica: Carne, Empanada clásica: Pollo, Gaseosas)",
    );
  });

  it("ignora los componentes sin nombre de producto", () => {
    expect(itemOptionLines([emp("Carne"), { producto: "" }, null])).toEqual(["Empanada clásica: Carne"]);
  });
});
