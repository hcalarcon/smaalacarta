import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// La cara de app (PUBLICO-91 a 97) es CSS y glue de DOM: no se puede probar sin navegador, pero sí
// cuidar que las piezas estén, que solo la reciban Moderna y Minimalista y que no vuelvan los cortes con "…".

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const html = read("../index.html");
const app = read("../app.js");
const shell = read("../cara-de-app.css");
const base = read("../base.css");
const rule = (selector) => {
  const start = shell.indexOf(selector);
  return start === -1 ? "" : shell.slice(start, shell.indexOf("}", start));
};

describe("cara de app solo para Moderna y Minimalista", () => {
  it("app.js carga la hoja únicamente con esas dos plantillas", () => {
    expect(app).toContain('const APP_SHELL_TEMPLATES = ["moderno", "minimal"]');
    expect(app).toContain("/apps/menu-app/cara-de-app.css");
  });

  it("la Clásica no recibe ninguna de las piezas nuevas", () => {
    expect(read("../../../templates/carrito/clasico/styles.css")).not.toMatch(/barra-app|pill-bg|cara-de-app/);
    expect(base).toMatch(/\.logo-negocio,\s*\.barra-app,\s*\.checkout-total\s*\{\s*display: none;/);
    expect(base).toMatch(/\.header-marca,\s*\.header-titulo,\s*\.checkout-pie\s*\{\s*display: contents;/);
  });
});

describe("barra de abajo (PUBLICO-92)", () => {
  it("tiene Menú, Promos y Carrito con aria-label y contador", () => {
    for (const id of ["barra-menu", "barra-promos", "barra-carrito"]) {
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*aria-label="`));
    }
    expect(html).toContain('id="barra-carrito-count"');
    expect(shell).toMatch(/\.barra-boton \{[^}]*min-height: 48px/);
  });

  it("Promos solo aparece si hay promociones", () => {
    expect(app).toContain('promos.hidden = !document.querySelector("#menu .categoria-ofertas")');
  });
});

describe("selector de idioma fijo (PUBLICO-91)", () => {
  it("queda fijo arriba, sobre las solapas, con botones de al menos 44 px", () => {
    expect(rule(".selector-idioma {")).toMatch(/position: fixed/);
    expect(rule(".selector-idioma button {")).toMatch(/min-height: 44px/);
    expect(rule(".header {")).toMatch(/z-index: 45/);
  });
});

describe("hoja del checkout (PUBLICO-94 y 95)", () => {
  it("es un diálogo con el total y confirmar fijos abajo", () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="checkout-total"');
    expect(rule(".checkout-pie {")).toMatch(/position: sticky/);
  });

  it("en el celular ocupa la pantalla y sube desde abajo", () => {
    expect(shell).toMatch(/@media \(max-width: 639px\)\s*\{[^@]*transform: translateY\(100%\)/);
  });

  it("se cierra con Escape y con el gesto atrás, y devuelve el foco", () => {
    expect(app).toContain('e.key !== "Escape"');
    expect(app).toContain('window.addEventListener("popstate"');
    expect(app).toContain("history.pushState");
    expect(app).toContain("LAYER_OPENER.focus");
  });
});

describe("nombres largos y precio (PUBLICO-87 y 96)", () => {
  it("los nombres se parten en líneas y no se cortan con puntos suspensivos", () => {
    expect(shell).not.toContain("text-overflow: ellipsis;\n  white-space: nowrap;\n  border");
    expect(shell).toMatch(/\.producto-info h3,[^{]*\{[^}]*overflow-wrap: anywhere;[^}]*hyphens: auto/);
    expect(shell).toMatch(/text-wrap: balance/);
    expect(rule(".zona-chip {")).toMatch(/white-space: normal/);
  });

  it("el contenedor del nombre no tiene alto ni ancho fijo", () => {
    for (const selector of [".header .header-marca {", ".header .header-titulo {", ".producto-abrir {"]) {
      expect(rule(selector)).not.toMatch(/(?<![-\w])(height|width):\s*[\d.]+(px|rem|em)\b/);
    }
  });

  it("el precio va en una pastilla con fondo y texto calculados", () => {
    expect(rule(".producto-precio,")).toMatch(/background: var\(--pill-bg\)/);
    expect(rule(".producto-precio,")).toMatch(/color: var\(--pill-text\)/);
  });
});

describe("carrusel de promos (PUBLICO-93)", () => {
  it("centra las tarjetas con snap y deja una sola promo quieta y centrada", () => {
    expect(shell).toMatch(/scroll-snap-type: x mandatory/);
    expect(shell).toMatch(/scroll-snap-align: center/);
    expect(shell).toMatch(/:has\(> \.producto:only-child\)/);
  });
});
