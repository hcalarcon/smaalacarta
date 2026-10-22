import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const aca = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(aca, "barra.css"), "utf8");
const bloque = css.slice(css.indexOf("@media (min-width: 481px)"));

describe("la vitrina es solo para celulares (WEB-VITRINA-18)", () => {
  it("en pantallas más anchas que un teléfono oculta la carta y muestra el aviso", () => {
    expect(bloque).toContain("html body > * { display: none !important; }");
    expect(bloque).toContain("Usá tu celu");
  });

  it("el aviso sale en el idioma de la página", () => {
    expect(bloque).toContain("html:lang(en) body::after");
    expect(bloque).toContain("html:lang(pt) body::after");
  });

  it("todas las páginas de la vitrina cargan ese CSS", () => {
    for (const ruta of ["index.html", "arcade", "floral", "futurista", "natural", "fantasia"].map((r) => (r.endsWith(".html") ? r : `${r}/index.html`))) {
      expect(readFileSync(join(aca, "..", ruta), "utf8"), ruta).toContain("/apps/vitrina/lib/barra.css");
    }
  });
});
