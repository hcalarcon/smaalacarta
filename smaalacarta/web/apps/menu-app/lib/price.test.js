import { describe, expect, it } from "vitest";

import { formatPrice } from "./price.js";

describe("formatPrice — MENU-4", () => {
  it("agrupa los miles con punto, también los de cuatro cifras", () => {
    expect(formatPrice(12000)).toBe("12.000");
    expect(formatPrice(1000)).toBe("1.000");
    expect(formatPrice(1250000)).toBe("1.250.000");
  });

  it("no agrega decimales a un entero y deja los de un precio con centavos", () => {
    expect(formatPrice(500)).toBe("500");
    expect(formatPrice(1234.5)).toBe("1.234,5");
  });

  it("acepta el precio como texto", () => {
    expect(formatPrice("12000")).toBe("12.000");
  });

  it("devuelve el texto tal cual si no es un número", () => {
    expect(formatPrice("consultar")).toBe("consultar");
    expect(formatPrice(undefined)).toBe("");
    expect(formatPrice(null)).toBe("");
  });
});
