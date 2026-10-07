import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { openOptionsSheet } from "./options-sheet.js";
import { renderStaticMenuPage } from "./static-page.js";

// Las tres plantillas sirven a los dos menús (el interactivo y el estático) y a las demos.
// Estas pruebas cuidan que se mantengan parejas y que el estático no use clases sin
// estilo (como pasó con `.contact`): un CSS al que le falta un selector no rompe nada,
// solo se ve mal, y nadie se entera hasta que lo mira.

const TEMPLATES = ["moderno", "clasico", "minimal"];

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const base = read("../base.css");
const desktop = read("../desktop.css");
const templateCss = Object.fromEntries(
  TEMPLATES.map((name) => [name, read(`../../../templates/carrito/${name}/styles.css`)]),
);

// Un menú con todo lo que el estático sabe mostrar.
const completo = {
  config: {
    nombre: "Ana Resto",
    descripcion: "Cocina casera",
    template: "moderno",
    telefono: "5493510000000",
    logo: "https://cdn.example.com/logo.png",
    header: { imagen: "https://cdn.example.com/cabecera.jpg" },
    colores: { primary: "#112233", secondary: "#445566" },
    direccion: "San Martín 100",
    redes: { instagram: "https://www.instagram.com/ana", facebook: "https://www.facebook.com/ana" },
    cierre: { mensaje: "Vacaciones", hasta: null },
  },
  menu: {
    categorias: [
      {
        nombre: "Comidas",
        items: [
          { nombre: "Torta", precio: 4000, destacado: true, imagen: "https://cdn.example.com/t.jpg" },
          { nombre: "Pizza", precio: 5200, precioAnterior: 6500, promo: "20% OFF" },
          { nombre: "Flan", precio: 2500, agotado: true },
        ],
      },
    ],
  },
};

// Las modificadoras de sección son decoración opcional de cada plantilla.
const OPCIONALES = new Set(["categoria-destacados", "categoria-ofertas"]);

function classesUsadas(html) {
  const classes = new Set();
  for (const [, value] of html.matchAll(/class="([^"]+)"/g)) {
    value.split(/\s+/).forEach((c) => classes.add(c));
  }
  return [...classes].filter((c) => !OPCIONALES.has(c));
}

describe("plantillas — el menú estático se ve como el interactivo (ESTATICO-4)", () => {
  it.each(TEMPLATES)("%s: todas las clases del menú estático tienen estilo", (name) => {
    const css = [base, templateCss[name], desktop].join("\n");
    const html = renderStaticMenuPage({ ...completo, config: { ...completo.config, template: name } });

    const sinEstilo = classesUsadas(html).filter(
      (c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css),
    );

    expect(sinEstilo).toEqual([]);
  });

  it.each(TEMPLATES)("%s: las categorías del estático (enlaces) se ven como las del interactivo (botones)", (name) => {
    const css = [base, templateCss[name]].join("\n");

    expect(css).toMatch(/\.categorias a\b/);
    expect(css).toMatch(/\.categorias button\b/);
  });

  it.each(TEMPLATES)("%s: dibuja la etiqueta de la promo desde data-promo", (name) => {
    expect(templateCss[name]).toMatch(/\.producto\[data-promo\]::(before|after)/);
  });
});

describe("plantillas — calidad pareja", () => {
  it("la barra de categorías queda arriba al bajar, en las tres", () => {
    expect(base).toMatch(/\.categorias\s*\{[^}]*position:\s*sticky/);
  });

  it("los campos y botones tienen foco visible con el teclado", () => {
    expect(base).toMatch(/:focus-visible/);
  });

  it("respeta a quien pide menos animación", () => {
    expect(base).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it.each(TEMPLATES)("%s: el texto sobre el color de la marca no es blanco fijo (PUBLICO-15)", (name) => {
    const bloques = templateCss[name].match(/\{[^{}]*\}/g) ?? [];
    const blancoSobreMarca = bloques.filter(
      (b) =>
        /background:\s*(var\(--primary\)|var\(--brand\)|linear-gradient\([^;]*(--brand-2|--color-secondary))/.test(b) &&
        /(^|[\s;{])color:\s*#fff\s*;/.test(b),
    );

    expect(blancoSobreMarca).toEqual([]);
  });

  it.each(TEMPLATES)("%s: no repite la palabra de la sección como etiqueta (Destacados • Destacados)", (name) => {
    expect(templateCss[name]).not.toMatch(/content:\s*"\s*•\s*(Destacados|Ofertas)"/);
  });

  it.each(TEMPLATES)("%s: el texto secundario se lee (gris que no es casi negro ni demasiado claro)", (name) => {
    const muted = templateCss[name].match(/--muted:\s*(#[0-9a-f]{3,6})/i)?.[1];
    if (!muted) return;

    // Luminancia relativa, contra el blanco: hace falta un contraste de al menos 4.5:1 (WCAG AA)
    const hex = muted.length === 4 ? muted.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : muted;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const contrast = 1.05 / (luminance + 0.05);

    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});

describe("plantillas — opciones y extras (PUBLICO-45, 46 y 49)", () => {
  // Una hoja con todo lo que sabe dibujar: radio, casillas, contador y una opción agotada.
  const producto = {
    id: "p1",
    nombre: "Hamburguesa",
    precio: 1000,
    opciones: [
      { id: "g1", nombre: "Punto", min: 1, max: 1, repetir: false, opciones: [{ id: "a", nombre: "Jugoso", precio: 0 }] },
      {
        id: "g2", nombre: "Extras", min: 0, max: 2, repetir: false,
        opciones: [{ id: "b", nombre: "Queso", precio: 500 }, { id: "c", nombre: "Huevo", precio: 0, agotado: true }],
      },
      { id: "g3", nombre: "Sabores", min: 1, max: 3, repetir: true, opciones: [{ id: "d", nombre: "Frutilla", precio: 0 }] },
    ],
  };

  function clasesDeLaHoja() {
    document.body.innerHTML = "";
    const sheet = openOptionsSheet({ item: producto, t: (k) => k, formatPrice: String, onAdd() {} });
    const classes = new Set();
    document.querySelectorAll(".opciones-overlay, .opciones-overlay *").forEach((node) => {
      node.classList.forEach((c) => classes.add(c));
    });
    sheet.close();
    return [...classes];
  }

  it.each(TEMPLATES)("%s: toda clase de la hoja de opciones tiene estilo", (name) => {
    const css = [base, templateCss[name], desktop].join("\n");
    const sinEstilo = clasesDeLaHoja().filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));

    expect(sinEstilo).toEqual([]);
  });

  it.each(TEMPLATES)("%s: la línea del carrito con opciones y el texto del estático tienen estilo", (name) => {
    const css = [base, templateCss[name]].join("\n");

    expect(css).toMatch(/\.item-opciones\b/);
    expect(css).toMatch(/\.opciones-estatico\b/);
  });

  it.each(TEMPLATES)("%s: la hoja tiene su forma propia y su variante para el tema oscuro", (name) => {
    expect(templateCss[name]).toMatch(/\.opciones-hoja\s*\{/);
    expect(templateCss[name]).toMatch(/\.opciones-agregar\s*\{/);
    expect(templateCss[name]).toMatch(/:root\[data-tema="oscuro"\][^{]*\.opciones-hoja/);
  });

  it("la hoja usa los colores de la plantilla (claro y oscuro), no colores fijos de fondo o texto", () => {
    const bloque = base.slice(base.indexOf("OPCIONES Y EXTRAS"));
    const hoja = bloque.match(/\.opciones-hoja\s*\{[^}]*\}/)[0];

    expect(hoja).toMatch(/background:\s*var\(--card/);
    expect(hoja).toMatch(/color:\s*var\(--text/);
  });

  it("el botón Agregar no usa blanco fijo sobre el color de la marca", () => {
    expect(base).toMatch(/\.opciones-agregar\s*\{[^}]*color:\s*var\(--opc-on/);
  });
});
