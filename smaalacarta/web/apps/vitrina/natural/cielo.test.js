import { describe, expect, it } from "vitest";
import { FASES, faseInicial, mezclar, paleta, posicion } from "./cielo.js";

describe("cielo del tema Natural (WEB-VITRINA-16)", () => {
  it("arranca en el momento real del día", () => {
    expect(faseInicial(6)).toBe(0);
    expect(faseInicial(12)).toBe(1);
    expect(faseInicial(18.5)).toBe(2);
    expect(faseInicial(23)).toBe(3);
    expect(faseInicial(3)).toBe(3);
  });

  it("al bajar por la carta llega a la noche, sea cual sea la hora", () => {
    for (const fase of [0, 1, 2, 3]) {
      expect(posicion(fase, 0)).toBe(fase);
      expect(posicion(fase, 1)).toBe(3);
    }
    expect(posicion(1, 2)).toBe(3);
    expect(posicion(1, -1)).toBe(1);
  });

  it("la paleta de cada fase es exactamente la de esa fase", () => {
    FASES.forEach((fase, i) => {
      const p = paleta(i);
      expect(p.cielo1).toBe(fase.cielo1);
      expect(p.cielo2).toBe(fase.cielo2);
      expect(p.media).toBe(fase.media);
    });
  });

  it("entre dos fases mezcla los colores", () => {
    expect(mezclar("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(paleta(1.5).cielo1).toBe(mezclar(FASES[1].cielo1, FASES[2].cielo1, 0.5));
  });

  it("las estrellas y la luna aparecen solo de noche", () => {
    expect(paleta(0).estrellas).toBe(0);
    expect(paleta(2).estrellas).toBe(0);
    expect(paleta(3).estrellas).toBe(1);
    expect(paleta(1).luna).toBe(false);
    expect(paleta(3).luna).toBe(true);
  });

  it("el sol sube al mediodía y se pone tapado por las montañas", () => {
    expect(paleta(1).astroY).toBeLessThan(paleta(0).astroY);
    expect(paleta(0).astroY).toBeGreaterThanOrEqual(75);
    expect(paleta(2).astroY).toBeGreaterThanOrEqual(75);
    expect(paleta(2.01).astroY).toBeGreaterThanOrEqual(85);
  });

  it("una posición fuera de rango no rompe la paleta", () => {
    expect(paleta(-4)).toEqual(paleta(0));
    expect(paleta(9)).toEqual(paleta(3));
  });
});

describe("el astro no se ve saltar", () => {
  it("se desvanece al llegar al horizonte, donde el sol se vuelve luna", () => {
    expect(paleta(1).astroOpacidad).toBe(1);
    expect(paleta(2).astroOpacidad).toBeLessThan(0.3);
    expect(paleta(2.01).astroOpacidad).toBe(0);
    expect(paleta(3).astroOpacidad).toBe(1);
  });
});
