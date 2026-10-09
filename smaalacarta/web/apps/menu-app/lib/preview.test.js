import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { brandVariables } from "./colors.js";
import {
  PREVIEW_ORIGINS,
  allowedOrigins,
  applyPreviewConfig,
  headerRect,
  isAllowedOrigin,
  isPreviewMode,
  parsePreviewMessage,
  previewTemplate,
  previewTheme,
} from "./preview.js";

const menu = {
  categorias: [{ nombre: "Entradas", items: [{ nombre: "Empanadas", precio: 6500 }] }],
};
const message = (extra = {}) => ({ type: "preview", config: { nombre: "Casa", template: "moderno" }, menu, ...extra });

describe("isPreviewMode — PUBLICO-58", () => {
  it("solo con ?preview=1", () => {
    expect(isPreviewMode("?preview=1")).toBe(true);
    expect(isPreviewMode("?preview=0")).toBe(false);
    expect(isPreviewMode("?demo=moderno")).toBe(false);
    expect(isPreviewMode("")).toBe(false);
  });
});

describe("orígenes permitidos — PUBLICO-59", () => {
  it("por defecto solo el panel de producción", () => {
    const allowed = allowedOrigins({ hostname: "demo.smaalacarta.com.ar", search: "?preview=1" });
    expect(allowed).toEqual(PREVIEW_ORIGINS);
    expect(isAllowedOrigin("https://www.smaalacarta.com.ar", allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });

  it("en localhost, ?admin= suma el panel local", () => {
    const allowed = allowedOrigins({ hostname: "localhost", search: "?preview=1&admin=http://localhost:3000" });
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true);
  });

  it("?admin= se ignora fuera de localhost y si no apunta a una dirección local", () => {
    // Si no, cualquier página podría armarse un permiso propio sobre el menú publicado.
    expect(allowedOrigins({ hostname: "demo.smaalacarta.com.ar", search: "?admin=http://localhost:3000" })).toEqual(
      PREVIEW_ORIGINS,
    );
    expect(allowedOrigins({ hostname: "localhost", search: "?admin=https://evil.example" })).toEqual(PREVIEW_ORIGINS);
    expect(allowedOrigins({ hostname: "localhost", search: "?admin=no-es-una-url" })).toEqual(PREVIEW_ORIGINS);
  });
});

describe("parsePreviewMessage — PUBLICO-59", () => {
  it("acepta la forma esperada y devuelve una copia", () => {
    const parsed = parsePreviewMessage(message());
    expect(parsed).toEqual({ config: { nombre: "Casa", template: "moderno" }, menu });
    expect(parsed.menu).not.toBe(menu);
  });

  it.each([
    ["no es un objeto", "hola"],
    ["otro tipo de mensaje", message({ type: "state" })],
    ["sin config", message({ config: undefined })],
    ["config que es una lista", message({ config: [] })],
    ["menú sin categorías", message({ menu: { categorias: "x" } })],
    ["categoría sin nombre", message({ menu: { categorias: [{ items: [] }] } })],
  ])("descarta: %s", (_, data) => {
    expect(parsePreviewMessage(data)).toBeNull();
  });

  it("descarta textos y listas demasiado largos", () => {
    expect(parsePreviewMessage(message({ config: { nombre: "x".repeat(5000) } }))).toBeNull();
    expect(
      parsePreviewMessage(message({ menu: { categorias: Array.from({ length: 2000 }, () => ({ nombre: "a" })) } })),
    ).toBeNull();
  });

  it("acepta un producto con grupos de opciones (el menú más profundo que entrega menu_preview)", () => {
    const withOptions = {
      categorias: [
        {
          nombre: "Postres",
          items: [
            {
              id: "p1",
              nombre: "Waffle",
              precio: 5000,
              opciones: [{ id: "g1", nombre: "Salsa", min: 0, max: 1, opciones: [{ id: "o1", nombre: "Chocolate", precio: 200 }] }],
            },
          ],
        },
      ],
    };
    expect(parsePreviewMessage(message({ menu: withOptions }))?.menu).toEqual(withOptions);
  });

  it("descarta lo que no es dato plano (funciones, __proto__, demasiado anidado)", () => {
    expect(parsePreviewMessage(message({ config: { nombre: () => 1 } }))).toBeNull();
    expect(parsePreviewMessage(message({ config: JSON.parse('{"__proto__": {"x": 1}}') }))).toBeNull();

    let deep = "fin";
    for (let i = 0; i < 20; i += 1) deep = { a: deep };
    expect(parsePreviewMessage(message({ config: deep }))).toBeNull();
  });
});

describe("plantilla y tema — PUBLICO-60", () => {
  it("la plantilla solo puede ser una conocida (va a la dirección de una hoja de estilo)", () => {
    expect(previewTemplate({ template: "clasico" })).toBe("clasico");
    expect(previewTemplate({ template: "../../x" })).toBe("moderno");
    expect(previewTemplate(undefined)).toBe("moderno");
  });

  it("el tema es claro salvo que se pida oscuro", () => {
    expect(previewTheme({ tema: "oscuro" })).toBe("oscuro");
    expect(previewTheme({ tema: "otro" })).toBe("claro");
  });
});

describe("applyPreviewConfig — PUBLICO-60", () => {
  it("aplica plantilla, tema y colores, y vuelve a aplicar sin dejar los colores viejos", () => {
    const doc = document.implementation.createHTMLDocument("p");
    const first = applyPreviewConfig(
      doc,
      { template: "clasico", tema: "oscuro" },
      brandVariables({ primary: "#ff0000", secondary: "#0000ff" }),
    );
    expect(doc.documentElement.dataset.template).toBe("clasico");
    expect(doc.documentElement.dataset.tema).toBe("oscuro");
    expect(doc.documentElement.style.getPropertyValue("--color-primary")).toBe("#ff0000");

    // Ahora el negocio quita el color secundario: el viejo no puede quedar.
    applyPreviewConfig(doc, { template: "moderno" }, brandVariables({ primary: "#00ff00" }), first);
    expect(doc.documentElement.dataset.template).toBe("moderno");
    expect(doc.documentElement.dataset.tema).toBe("claro");
    expect(doc.documentElement.style.getPropertyValue("--color-primary")).toBe("#00ff00");
    expect(doc.documentElement.style.getPropertyValue("--color-secondary")).toBe("");
  });

  it("ignora nombres que no son variables CSS", () => {
    const doc = document.implementation.createHTMLDocument("p");
    expect(applyPreviewConfig(doc, {}, { color: "red", "--ok": "1" })).toEqual(["--ok"]);
    expect(doc.documentElement.style.color).toBe("");
  });
});

describe("headerRect — PUBLICO-61", () => {
  it("devuelve el rectángulo de la cabecera, o null si no hay", () => {
    const doc = document.implementation.createHTMLDocument("p");
    expect(headerRect(doc)).toBeNull();

    doc.body.innerHTML = '<header class="header"></header>';
    doc.querySelector(".header").getBoundingClientRect = () => ({ left: 0, top: 4, width: 390, height: 180 });
    expect(headerRect(doc)).toEqual({ x: 0, y: 4, w: 390, h: 180 });
  });
});

describe("index.html en modo vista previa — PUBLICO-60", () => {
  it("la página tiene la cabecera, las categorías y el menú donde la app dibuja", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const selector of [".header", "#nombre-negocio", "#categorias", "#menu", "#btn-carrito"]) {
      expect(doc.querySelector(selector), selector).not.toBeNull();
    }
  });
});
