import { describe, expect, it } from "vitest";

import { staticCacheControl } from "./static-cache.js";

const NOW = new Date("2026-10-20T15:00:00Z");
const menuWith = (...validaHasta) => ({
  menu: { categorias: [{ nombre: "Ofertas", tipo: "ofertas", items: validaHasta.map((v) => ({ esPromo: true, validaHasta: v })) }] },
});
const at = (seconds) => new Date(NOW.getTime() + seconds * 1000).toISOString();

describe("cache del menú estático — ESTATICO-13", () => {
  it("sin promociones con fin, el de siempre", () => {
    expect(staticCacheControl({ menu: { categorias: [] } }, NOW)).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(staticCacheControl(null, NOW)).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });

  it("con una promoción que vence en horas, el de siempre", () => {
    expect(staticCacheControl(menuWith(at(3 * 3600)), NOW)).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });

  it("con una que vence en minutos, sin servir uno viejo mientras se revalida", () => {
    expect(staticCacheControl(menuWith(at(200)), NOW)).toBe("public, s-maxage=60");
  });

  it("con una que vence en segundos, solo hasta su fin", () => {
    expect(staticCacheControl(menuWith(at(25)), NOW)).toBe("public, s-maxage=25");
  });

  it("toma la que vence primero y nunca baja de un segundo", () => {
    expect(staticCacheControl(menuWith(at(3 * 3600), at(10)), NOW)).toBe("public, s-maxage=10");
    expect(staticCacheControl(menuWith(at(0.2)), NOW)).toBe("public, s-maxage=1");
  });

  it("una promoción ya vencida o con fecha rota no cuenta", () => {
    expect(staticCacheControl(menuWith(at(-30), "mañana"), NOW)).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });
});
