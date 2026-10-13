import { describe, expect, it } from "vitest";

import { isExpired, lastUnitsLabel, validUntilDate, validUntilLabel } from "./promo-info.js";

const promo = (extra = {}) => ({ esPromo: true, nombre: "Combo", precio: 1500, ...extra });

describe("vigencia de una promoción — PUBLICO-68", () => {
  it("dice hasta qué día vale, en hora de Argentina", () => {
    // 02:59 UTC del 21/10 son las 23:59 del 20/10 en Argentina.
    expect(validUntilDate(promo({ validaHasta: "2026-10-21T02:59:00Z" }))).toBe("20/10");
    expect(validUntilLabel(promo({ validaHasta: "2026-10-21T02:59:00Z" }), "es")).toBe("Válida hasta el 20/10");
    expect(validUntilLabel(promo({ validaHasta: "2026-10-21T02:59:00Z" }), "en")).toBe("Valid until 20/10");
    expect(validUntilLabel(promo({ validaHasta: "2026-10-21T02:59:00Z" }), "pt")).toBe("Válida até 20/10");
  });

  it("sin fin, sin fecha rota o en algo que no es una promoción, no dice nada", () => {
    expect(validUntilLabel(promo(), "es")).toBeNull();
    expect(validUntilLabel(promo({ validaHasta: "mañana" }), "es")).toBeNull();
    expect(validUntilLabel({ nombre: "Café", validaHasta: "2026-10-21T02:59:00Z" }, "es")).toBeNull();
  });

  it("vencida cuando pasó la hora de fin", () => {
    const item = promo({ validaHasta: "2026-10-21T02:59:00Z" });

    expect(isExpired(item, new Date("2026-10-21T02:58:59Z"))).toBe(false);
    expect(isExpired(item, new Date("2026-10-21T02:59:00Z"))).toBe(false);
    expect(isExpired(item, new Date("2026-10-21T02:59:01Z"))).toBe(true);
    expect(isExpired(promo(), new Date("2099-01-01"))).toBe(false);
  });
});

describe("últimas unidades — PUBLICO-69", () => {
  it("con 'quedan' dice cuántas, en los tres idiomas", () => {
    expect(lastUnitsLabel(promo({ quedan: 3 }), "es")).toBe("¡Últimas 3!");
    expect(lastUnitsLabel(promo({ quedan: 3 }), "en")).toBe("Last 3 left!");
    expect(lastUnitsLabel(promo({ quedan: 3 }), "pt")).toBe("Últimas 3!");
  });

  it("con una sola dice 'Última unidad'", () => {
    expect(lastUnitsLabel(promo({ quedan: 1 }), "es")).toBe("¡Última unidad!");
  });

  it("sin 'quedan' (más de 5 o sin stock cargado) no dice nada", () => {
    expect(lastUnitsLabel(promo(), "es")).toBeNull();
    expect(lastUnitsLabel(promo({ quedan: 0 }), "es")).toBeNull();
    expect(lastUnitsLabel({ nombre: "Café", quedan: 2 }, "es")).toBeNull();
  });
});
