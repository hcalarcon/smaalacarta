import { describe, expect, it } from "vitest";

import { deltaText, formatArs, webShareText } from "./metrics-format";

describe("formatArs — ADMIN-METRICAS-7", () => {
  it("formatea pesos argentinos sin decimales", () => {
    expect(formatArs(12500)).toMatch(/^\$\s?12\.500$/);
  });

  it("redondea los centavos", () => {
    expect(formatArs(1999.6)).toMatch(/^\$\s?2\.000$/);
  });

  it("cero es $ 0", () => {
    expect(formatArs(0)).toMatch(/^\$\s?0$/);
  });
});

describe("deltaText — ADMIN-METRICAS-7", () => {
  it("sube: flecha hacia arriba y el porcentaje", () => {
    expect(deltaText(112, 100, "semana anterior")).toBe("↑ 12 % vs semana anterior");
  });

  it("baja: flecha hacia abajo, sin signo menos", () => {
    expect(deltaText(95, 100, "semana anterior")).toBe("↓ 5 % vs semana anterior");
  });

  it("sin cambios dice que es igual", () => {
    expect(deltaText(10, 10, "semana anterior")).toBe("Sin cambios vs semana anterior");
  });

  it("no dice nada si el período anterior es 0", () => {
    expect(deltaText(10, 0, "semana anterior")).toBeNull();
  });

  it("no dice nada si la lectura se truncó", () => {
    expect(deltaText(112, 100, "semana anterior", true)).toBeNull();
  });
});

describe("webShareText — ADMIN-METRICAS-7", () => {
  it("cuenta cuántos vinieron por el menú web", () => {
    expect(webShareText(8, 10)).toBe("8 de 10 pedidos vinieron por tu menú web");
  });

  it("singular", () => {
    expect(webShareText(1, 1)).toBe("1 de 1 pedido vino por tu menú web");
  });

  it("ninguno", () => {
    expect(webShareText(0, 4)).toBe("0 de 4 pedidos vinieron por tu menú web");
  });

  it("sin pedidos no hay nada que contar", () => {
    expect(webShareText(0, 0)).toBe("Todavía no hay pedidos");
  });
});
