import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSections } from "../lib/vitrina.js";

const aca = dirname(fileURLToPath(import.meta.url));
const { config, menu } = JSON.parse(readFileSync(join(aca, "santa-julia.json"), "utf8"));
const items = menu.categorias.flatMap((c) => c.items);
const assets = join(aca, "..", "..", "..", "..", "landing", "assets", "defaults");

describe("menú de respaldo de la vitrina (WEB-VITRINA-20)", () => {
  it("es un menú completo de Santa Julia, sin aviso de ejemplo", () => {
    expect(config.nombre).toBe("Santa Julia Resto");
    expect(JSON.stringify({ config, menu })).not.toMatch(/ejemplo|demo/i);
    expect(menu.categorias.length).toBeGreaterThanOrEqual(6);
  });

  it("cada producto tiene foto que existe, descripción y los tres idiomas", () => {
    for (const item of items) {
      expect(item.descripcion, item.nombre).toBeTruthy();
      expect(item.nombre_en && item.nombre_pt && item.descripcion_en && item.descripcion_pt, item.nombre).toBeTruthy();
      const archivo = item.imagen.split("/").pop();
      expect(() => readFileSync(join(assets, archivo)), item.nombre).not.toThrow();
    }
  });

  it("los precios son de un restaurante argentino en 2026", () => {
    for (const item of items) {
      expect(item.precio, item.nombre).toBeGreaterThanOrEqual(2000);
      expect(item.precio, item.nombre).toBeLessThanOrEqual(80000);
    }
    expect(items.find((i) => i.destacado)?.nombre).toBe("Santa Julia");
  });

  it("alimenta a los temas: categorías con productos, un destacado y las opciones como texto", () => {
    const { categorias, destacado } = buildSections(menu, "en");
    expect(categorias.map((c) => c.nombre)).toContain("Burgers");
    expect(destacado.nombre).toBe("Santa Julia");
    expect(destacado.opciones[0]).toContain("pick 1");
  });
});
