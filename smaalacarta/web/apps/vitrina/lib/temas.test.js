import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEMAS } from "./vitrina.js";

const aqui = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));
const hechos = TEMAS.filter((tema) => existsSync(aqui(`../${tema.id}/index.html`)));
const leer = (tema, archivo) => readFileSync(aqui(`../${tema.id}/${archivo}`), "utf8");

describe("cada tema hecho", () => {
  it("hay al menos un tema hecho", () => {
    expect(hechos.length).toBeGreaterThan(0);
  });

  describe.each(hechos.map((tema) => [tema.id, tema]))("%s", (_id, tema) => {
    const html = leer(tema, "index.html");

    it("tiene título y Open Graph propios (WEB-VITRINA-11)", () => {
      const titulo = `Santa Julia · Menú ${tema.nombre.split(" ")[0]}`;

      expect(html).toContain(`<title>${titulo}`);
      expect(html).toContain(`<meta property="og:title" content="${titulo}`);
      expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/);
      expect(html).toContain("SMA a la Carta</title>");
    });

    it("carga la barra y no usa más de 2 familias de Google Fonts (WEB-VITRINA-06)", () => {
      expect(html).toContain("/apps/vitrina/lib/barra.css");
      const familias = (html.match(/[?&]family=/g) ?? []).length;
      expect(familias).toBeLessThanOrEqual(2);
      expect(html).toContain("display=swap");
    });

    it("respeta prefers-reduced-motion (WEB-VITRINA-08)", () => {
      expect(leer(tema, "styles.css")).toContain("prefers-reduced-motion: reduce");
    });

    it("usa solo librerías con versión fija si carga alguna (pedido de Herni)", () => {
      const externos = [...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]);
      externos.forEach((url) => expect(url).toMatch(/@\d+\.\d+\.\d+/));
    });
  });
});
