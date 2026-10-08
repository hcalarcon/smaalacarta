import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, validateSettings } from "./validation";
import { CENTER, dragFocus, nudgeFocus, normalizeFocus } from "./header-focus";

describe("normalizeFocus — ADMIN-CONFIG-26", () => {
  it("deja pasar un entero de 0 a 100", () => {
    expect(normalizeFocus(0)).toBe(0);
    expect(normalizeFocus(37)).toBe(37);
    expect(normalizeFocus(100)).toBe(100);
  });

  it("redondea y acota", () => {
    expect(normalizeFocus(33.6)).toBe(34);
    expect(normalizeFocus(-5)).toBe(0);
    expect(normalizeFocus(250)).toBe(100);
  });

  it("lo que no es un número vuelve al centro", () => {
    expect(normalizeFocus(Number.NaN)).toBe(CENTER);
    expect(normalizeFocus(undefined)).toBe(CENTER);
    expect(normalizeFocus("20; x")).toBe(CENTER);
  });
});

describe("validateSettings con el punto de enfoque — ADMIN-CONFIG-26", () => {
  it("los valores por defecto son el centro y son válidos", () => {
    expect(DEFAULT_SETTINGS.headerImageX).toBe(50);
    expect(DEFAULT_SETTINGS.headerImageY).toBe(50);
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({ ok: true });
  });

  it("acepta enteros de 0 a 100", () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, headerImageX: 0, headerImageY: 100 })).toEqual({ ok: true });
  });

  it.each([-1, 101, 20.5, Number.NaN])("rechaza %s", (value) => {
    const x = validateSettings({ ...DEFAULT_SETTINGS, headerImageX: value });
    const y = validateSettings({ ...DEFAULT_SETTINGS, headerImageY: value });
    expect(!x.ok && x.errors.headerImageX).toBeTruthy();
    expect(!y.ok && y.errors.headerImageY).toBeTruthy();
  });
});

describe("dragFocus — ADMIN-CONFIG-27", () => {
  // Cabecera de 400 × 200. Una imagen de 800 × 400 la cubre justo (escala 0,5): no sobra nada.
  const viewport = { w: 400, h: 200 };

  it("arrastrar la imagen a la derecha mueve el punto hacia la izquierda, proporcional a lo que sobra", () => {
    const image = { w: 1200, h: 200 }; // escala 1 → 1200 × 200: sobran 800 en x y 0 en y
    const next = dragFocus({ x: 50, y: 50 }, { x: 80, y: 0 }, viewport, image);
    expect(next).toEqual({ x: 40, y: 50 }); // 80 / 800 = 10 puntos
  });

  it("arrastrar hacia abajo mueve el punto hacia arriba en el eje vertical", () => {
    const image = { w: 400, h: 400 }; // escala 1 → 400 × 400: sobran 0 en x y 200 en y
    const next = dragFocus({ x: 50, y: 50 }, { x: 30, y: -50 }, viewport, image);
    expect(next).toEqual({ x: 50, y: 75 });
  });

  it("no mueve un eje donde la imagen no sobra", () => {
    const image = { w: 800, h: 400 }; // escala 0,5 → 400 × 200: no sobra nada
    expect(dragFocus({ x: 30, y: 60 }, { x: 100, y: 100 }, viewport, image)).toEqual({ x: 30, y: 60 });
  });

  it("queda entre 0 y 100", () => {
    const image = { w: 1200, h: 200 };
    expect(dragFocus({ x: 5, y: 50 }, { x: 800, y: 0 }, viewport, image).x).toBe(0);
    expect(dragFocus({ x: 95, y: 50 }, { x: -800, y: 0 }, viewport, image).x).toBe(100);
  });

  it("sin medidas válidas no mueve nada", () => {
    expect(dragFocus({ x: 10, y: 20 }, { x: 5, y: 5 }, viewport, { w: 0, h: 0 })).toEqual({ x: 10, y: 20 });
    expect(dragFocus({ x: 10, y: 20 }, { x: 5, y: 5 }, { w: 0, h: 0 }, { w: 100, h: 100 })).toEqual({ x: 10, y: 20 });
  });
});

describe("nudgeFocus — ADMIN-CONFIG-27", () => {
  it("las flechas mueven 2 puntos, y 10 con Mayús", () => {
    expect(nudgeFocus({ x: 50, y: 50 }, "ArrowLeft", false)).toEqual({ x: 48, y: 50 });
    expect(nudgeFocus({ x: 50, y: 50 }, "ArrowRight", false)).toEqual({ x: 52, y: 50 });
    expect(nudgeFocus({ x: 50, y: 50 }, "ArrowUp", true)).toEqual({ x: 50, y: 40 });
    expect(nudgeFocus({ x: 50, y: 50 }, "ArrowDown", true)).toEqual({ x: 50, y: 60 });
  });

  it("no se pasa de 0 ni de 100", () => {
    expect(nudgeFocus({ x: 1, y: 99 }, "ArrowLeft", true)).toEqual({ x: 0, y: 99 });
    expect(nudgeFocus({ x: 1, y: 99 }, "ArrowDown", true)).toEqual({ x: 1, y: 100 });
  });

  it("otra tecla no cambia nada (devuelve null)", () => {
    expect(nudgeFocus({ x: 50, y: 50 }, "a", false)).toBeNull();
  });
});
