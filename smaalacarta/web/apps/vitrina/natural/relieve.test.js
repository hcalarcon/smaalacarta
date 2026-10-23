import { describe, expect, it } from "vitest";
import { ALTO_MONTANAS, ANCHO, azar, cresta, capasDelPaisaje, caminoMontana, caminoPinos, recorteNieve } from "./relieve.js";

describe("relieve del tema natural (WEB-VITRINA-19)", () => {
  it("el azar con semilla es siempre el mismo y queda entre 0 y 1", () => {
    const a = azar(5);
    const b = azar(5);
    const valores = Array.from({ length: 50 }, () => a());
    expect(valores).toEqual(Array.from({ length: 50 }, () => b()));
    expect(valores.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("la cresta cubre todo el ancho y nunca se sale del dibujo", () => {
    const puntos = cresta({ semilla: 1, afilada: true });
    expect(puntos[0][0]).toBe(0);
    expect(puntos[puntos.length - 1][0]).toBe(ANCHO);
    expect(puntos.every(([, y]) => y >= 0 && y <= ALTO_MONTANAS)).toBe(true);
    expect(cresta({ semilla: 1, afilada: true })).toEqual(puntos);
    expect(cresta({ semilla: 2, afilada: true })).not.toEqual(puntos);
  });

  it("la cresta respeta el piso y el techo que se pidan", () => {
    const puntos = cresta({ semilla: 9, piso: 0.2, techo: 0.5 });
    const ys = puntos.map(([, y]) => y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(ALTO_MONTANAS * 0.5 - 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(ALTO_MONTANAS * 0.8 + 0.01);
  });

  it("las montañas, la nieve y los pinos son caminos SVG cerrados y sin valores raros", () => {
    const caminos = [caminoMontana(cresta({ semilla: 3 })), recorteNieve({ semilla: 3 }), caminoPinos({ semilla: 3 })];
    for (const d of caminos) {
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      expect(d).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("las tres capas salen con sus colores en variables CSS, para que el cielo las cambie", () => {
    const capas = capasDelPaisaje();
    expect(Object.keys(capas)).toEqual(["lejos", "media", "cerca"]);
    expect(capas.lejos).toContain("var(--lejos)");
    expect(capas.lejos).toContain("clip-path");
    expect(capas.media).toContain("var(--media)");
    expect(capas.cerca).toContain("var(--cerca)");
  });
});
