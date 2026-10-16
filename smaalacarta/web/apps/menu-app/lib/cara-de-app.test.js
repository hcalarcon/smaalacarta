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

describe("selector de idioma compacto (PUBLICO-91)", () => {
  it("es un botón dentro del encabezado, no fijo: se va con el scroll y no queda sobre las categorías", () => {
    expect(rule(".selector-idioma {")).not.toMatch(/position: fixed/);
    expect(rule(".selector-idioma {")).toMatch(/position: relative/);
    expect(rule(".selector-idioma .idioma-toggle {")).toMatch(/min-height: 44px/);
    expect(rule(".selector-idioma .idioma-opcion {")).toMatch(/min-height: 44px/);
    expect(app).toContain('toggle.className = "idioma-toggle"');
    expect(app).toContain('lista.className = "idioma-lista"');
  });

  it("se estira hacia la izquierda en la misma línea, con animación suave y sin ella si se pide", () => {
    const lista = rule(".selector-idioma .idioma-lista {");
    expect(lista).toMatch(/flex-direction: row/);
    expect(lista).toMatch(/position: absolute/);
    expect(lista).toMatch(/right: calc\(100% \+ 4px\)/);
    expect(lista).toMatch(/clip-path/);
    expect(lista).toMatch(/opacity 0\.2s/);
    expect(shell).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.selector-idioma \.idioma-lista \{[^}]*transition: none/);
    expect(app).toContain('toggle.setAttribute("aria-expanded", String(open))');
  });

  it("la Clásica sigue con los tres botones: el botón compacto está oculto en la base", () => {
    expect(base).toMatch(/\.idioma-toggle\s*\{\s*display: none;/);
  });
});

describe("encabezado liviano (PUBLICO-97)", () => {
  it("el estado va en una línea chica con el nombre y no como pastilla suelta", () => {
    expect(html).toContain('id="linea-estado"');
    expect(rule(".header-top .badge-estado {")).toMatch(/display: none/);
    expect(app).toContain("`${estado} · ${c.descripcion}`");
  });

  it("el nombre va sin caja, sobre la portada, en hasta dos líneas balanceadas", () => {
    const marca = rule(".header .header-marca {");
    expect(marca).not.toMatch(/border:|box-shadow|background: var\(--card\)/);
    expect(marca).toMatch(/linear-gradient/);
    const h1 = rule(".header .header-titulo h1 {");
    expect(h1).toMatch(/text-wrap: balance/);
    expect(h1).toMatch(/line-clamp: 2/);
    expect(h1).toMatch(/text-shadow/);
  });
});

describe("header compacto de Moderna (PUBLICO-98)", () => {
  it("tiene buscador desplegable accesible y un nombre compacto para la fila fija", () => {
    expect(html).toContain('id="btn-buscar"');
    expect(html).toContain('aria-controls="buscador"');
    expect(html).toMatch(/id="header-sticky-title"[^>]*hidden/);
    expect(html).toContain('id="nombre-negocio-mini"');
    expect(html).toContain('id="header-sticky-title"');
    expect(app).toContain('btnBuscar.setAttribute("aria-expanded", String(abierto))');
    expect(app).toContain('input.addEventListener("keydown"');
  });

  it("deja pasar la fila de controles y fija solo el nombre compacto sobre las tabs", () => {
    expect(shell).toMatch(/html\[data-template="moderno"\]\s+\.header-top\s*\{[^}]*position:\s*relative/);
    expect(shell).toMatch(/html\[data-template="moderno"\]\s+\.header\s*\{[^}]*height:\s*120px/);
    expect(shell).toMatch(/html\[data-template="moderno"\]\s+\.header-sticky-title\s*\{[^}]*display:\s*none/);
    expect(shell).toMatch(/html\[data-template="moderno"\]\s+body\.header-scrolled\s+\.header-sticky-title\s*\{[^}]*position:\s*sticky;[^}]*display:\s*flex/);
    expect(shell).toMatch(/html\[data-template="moderno"\]\s+\.categorias\s*\{[^}]*top:\s*36px/);
  });

  it("abre la lupa sin altura permanente, muestra foco y reduce el movimiento", () => {
    expect(shell).toMatch(/html\[data-template="moderno"\]\s+#buscador\s*\{[^}]*display:\s*none/);
    expect(shell).toMatch(/html\[data-template="moderno"\]\s+body\.buscador-abierto\s+#buscador\s*\{[^}]*display:\s*block/);
    expect(shell).toMatch(/\.btn-buscar:focus-visible/);
    expect(shell).toMatch(/prefers-reduced-motion:\s*reduce/);
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
    for (const selector of [".header .header-marca {", ".header .header-titulo {", ".producto .producto-abrir {"]) {
      expect(rule(selector)).not.toMatch(/(?<![-\w])(height|width):\s*[\d.]+(px|rem|em)\b/);
    }
  });

  it("el nombre que abre la hoja ocupa todo el ancho de la tarjeta y no hereda el botón redondo de agregar", () => {
    const abrir = rule(".producto .producto-abrir {");
    expect(abrir).toMatch(/width: 100%/);
    expect(abrir).toMatch(/height: auto/);
    expect(abrir).toMatch(/border-radius: 0/);
    expect(abrir).toMatch(/background: none/);
    expect(abrir).toMatch(/overflow-wrap: break-word/);
    expect(abrir).not.toMatch(/anywhere/);
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
