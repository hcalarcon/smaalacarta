import { describe, expect, it } from "vitest";

import {
  brandVariables,
  contrastRatio,
  ensureContrastOnWhite,
  readableOn,
} from "./colors.js";

describe("contrastRatio — PUBLICO-15", () => {
  it("negro contra blanco es el máximo, 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("un color contra sí mismo es 1:1", () => {
    expect(contrastRatio("#3d1aea", "#3d1aea")).toBeCloseTo(1, 5);
  });

  it("acepta #rgb y mayúsculas", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });

  it.each(["", "rojo", "#12", "#gggggg", null, undefined, 7])("con %j no hay contraste que calcular", (bad) => {
    expect(contrastRatio(bad, "#fff")).toBeNull();
  });
});

describe("readableOn — PUBLICO-15", () => {
  it("texto blanco sobre colores oscuros", () => {
    expect(readableOn("#111111")).toBe("#ffffff");
    expect(readableOn("#463ae5")).toBe("#ffffff");
    expect(readableOn("#7c2d12")).toBe("#ffffff");
  });

  it("texto oscuro sobre colores claros (un negocio puede elegir amarillo)", () => {
    expect(readableOn("#ffe082")).toBe("#111111");
    expect(readableOn("#ffeb3b")).toBe("#111111");
    expect(readableOn("#ffffff")).toBe("#111111");
  });

  it("con varios colores (un degradé) elige el que se lee en todos", () => {
    // Oscuro y claro: ninguno se lee en los dos extremos, pero uno se lee menos mal.
    const text = readableOn(["#111111", "#ffe082"]);
    expect(["#111111", "#ffffff"]).toContain(text);

    // Dos oscuros: blanco. Dos claros: oscuro.
    expect(readableOn(["#111111", "#463ae5"])).toBe("#ffffff");
    expect(readableOn(["#ffe082", "#ffcc80"])).toBe("#111111");
  });

  it("un color que no es válido no se toca: devuelve null", () => {
    expect(readableOn("no-es-un-color")).toBeNull();
    expect(readableOn(["#111111", "no-es-un-color"])).toBeNull();
    expect(readableOn(undefined)).toBeNull();
  });
});

describe("ensureContrastOnWhite — PUBLICO-15", () => {
  it.each(["#ffe082", "#ffeb3b", "#9a6ce0", "#4ade80", "#d97706", "#463ae5", "#111111"])(
    "%s queda con contraste de al menos 4.5:1 contra blanco",
    (color) => {
      const ink = ensureContrastOnWhite(color);
      expect(contrastRatio(ink, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("un color que ya se lee no cambia", () => {
    expect(ensureContrastOnWhite("#111111")).toBe("#111111");
  });

  it("oscurece sin cambiar de tono: el amarillo sigue siendo amarillento", () => {
    const ink = ensureContrastOnWhite("#ffe082");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("con un color inválido devuelve null", () => {
    expect(ensureContrastOnWhite("nada")).toBeNull();
  });
});

describe("brandVariables — PUBLICO-15", () => {
  it("con los dos colores del negocio da los colores y con qué texto se leen", () => {
    const vars = brandVariables({ primary: "#463ae5", secondary: "#9a6ce0" });

    expect(vars["--color-primary"]).toBe("#463ae5");
    expect(vars["--color-secondary"]).toBe("#9a6ce0");
    expect(vars["--on-brand"]).toBe("#ffffff");
    expect(contrastRatio(vars["--brand-ink"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("con una paleta clara, el texto sobre la marca es oscuro", () => {
    const vars = brandVariables({ primary: "#ffe082", secondary: "#ffcc80" });

    expect(vars["--on-brand"]).toBe("#111111");
    expect(vars["--on-brand-2"]).toBe("#111111");
    expect(vars["--on-brand-mix"]).toBe("#111111");
    expect(vars["--on-header"]).toBe("#111111");
  });

  it("el encabezado lleva sombra clara con texto oscuro y sombra oscura con texto blanco", () => {
    expect(brandVariables({ primary: "#ffe082", secondary: "#ffcc80" })["--on-header-shadow"]).toMatch(/255/);
    expect(brandVariables({ primary: "#111111", secondary: "#333333" })["--on-header-shadow"]).toMatch(/0, 0, 0/);
  });

  it("si falta uno de los colores usa el otro para todo", () => {
    const vars = brandVariables({ primary: "#111111" });

    expect(vars["--color-primary"]).toBe("#111111");
    expect(vars["--color-secondary"]).toBeUndefined();
    expect(vars["--on-brand"]).toBe("#ffffff");
  });

  it.each([undefined, null, {}, { primary: "rojo" }, { primary: 5, secondary: [] }])(
    "con %j no inventa nada",
    (colores) => {
      expect(brandVariables(colores)).toEqual({});
    },
  );

  it("no deja pasar un valor que no sea un color (va a un estilo)", () => {
    const vars = brandVariables({ primary: "red; background:url(x)", secondary: "#111111" });

    expect(Object.values(vars).join(" ")).not.toMatch(/[;()]\s*background|url\(/);
    expect(vars["--color-primary"]).toBeUndefined();
  });
});
