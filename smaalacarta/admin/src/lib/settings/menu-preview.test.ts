// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MENU_ASSETS_URL,
  menuPreviewDocument,
  previewBrandVariables,
  previewHeaderBackground,
  previewMessage,
  resolveAssetsUrl,
} from "./menu-preview";

// ADMIN-CONFIG-28 y 29: la vista previa usa el CSS real del menú. Como admin/ no puede importar
// código de web/, estos tests lo leen del disco y comprueban que las dos copias no se separen.
const WEB = resolve(__dirname, "../../../../web");
const read = (path: string) => readFileSync(resolve(WEB, path), "utf8");
const loadWeb = (path: string) => import(/* @vite-ignore */ pathToFileURL(resolve(WEB, path)).href);

const TEMPLATES = ["moderno", "clasico", "minimal"] as const;
const BASE_CSS = read("apps/menu-app/base.css");
const DESKTOP_CSS = read("apps/menu-app/desktop.css");
const TEMPLATE_CSS = Object.fromEntries(
  TEMPLATES.map((t) => [t, read(`templates/carrito/${t}/styles.css`)]),
) as Record<(typeof TEMPLATES)[number], string>;

// Clases que el documento define por su cuenta, solo para la vista previa.
const PREVIEW_ONLY = new Set(["sma-foco", "sma-fila", "sma-chico"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasSelector = (css: string, prefix: "." | "#", name: string) =>
  new RegExp(`${escapeRe(prefix + name)}(?![\\w-])`).test(css);

function usedNames(html: string) {
  const body = html.slice(html.indexOf("<body"), html.indexOf("<script"));
  const classes = new Set<string>();
  for (const m of body.matchAll(/\sclass="([^"]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
  }
  const ids = new Set<string>();
  for (const m of body.matchAll(/\sid="([^"]*)"/g)) ids.add(m[1]);
  return { classes, ids };
}

describe("menuPreviewDocument — ADMIN-CONFIG-28", () => {
  it.each(TEMPLATES)("toda clase del HTML tiene estilo en base.css o en la plantilla %s", (template) => {
    const doc = menuPreviewDocument({ template, tema: "claro", assetsUrl: "https://menu.test" });
    const { classes, ids } = usedNames(doc);
    const css = `${BASE_CSS}\n${DESKTOP_CSS}\n${TEMPLATE_CSS[template]}`;

    expect(classes.size).toBeGreaterThan(10);
    const sinEstilo = [...classes].filter((c) => !PREVIEW_ONLY.has(c) && !hasSelector(css, ".", c));
    expect(sinEstilo).toEqual([]);

    const idsSinEstilo = [...ids].filter((id) => !id.startsWith("pv-") && !hasSelector(css, "#", id));
    expect(idsSinEstilo).toEqual([]);
  });

  it.each(TEMPLATES)(
    "el modo botones solo usa clases con estilo en base.css o en la plantilla %s (ADMIN-CONFIG-41)",
    (template) => {
      const doc = menuPreviewDocument({
        template,
        tema: "oscuro",
        assetsUrl: "https://menu.test",
        mode: "botones",
      });
      const { classes, ids } = usedNames(doc);
      const css = `${BASE_CSS}
${DESKTOP_CSS}
${TEMPLATE_CSS[template]}`;

      for (const c of ["btn-cta", "btn-add", "btn-carrito", "badge-estado", "header"]) {
        expect(classes.has(c), c).toBe(true);
      }
      expect([...classes].filter((c) => !PREVIEW_ONLY.has(c) && !hasSelector(css, ".", c))).toEqual([]);
      expect([...ids].filter((id) => !id.startsWith("pv-") && !hasSelector(css, "#", id))).toEqual([]);
      expect(doc).toContain('data-tema="oscuro"');
      expect(doc).toContain(`href="https://menu.test/templates/carrito/${template}/styles.css"`);
    },
  );

  it("el modo botones no trae el menú completo y recibe los colores por mensaje", () => {
    const doc = menuPreviewDocument({ template: "moderno", tema: "claro", assetsUrl: "https://menu.test", mode: "botones" });
    expect(doc).not.toContain('class="producto"');
    expect(doc).not.toContain("categorias");
    expect(doc).toContain("setProperty");
    expect(doc).toContain("Abierto");
    expect(doc).toContain("Cerrado");
  });

  it('incluye cabecera con logo y chip, categorías, tarjeta, "+", carrito, WhatsApp y cierre', () => {
    const { classes, ids } = usedNames(
      menuPreviewDocument({ template: "moderno", tema: "claro", assetsUrl: "https://menu.test" }),
    );
    for (const c of [
      "header",
      "logo-negocio",
      "badge-estado",
      "dot",
      "categorias",
      "producto",
      "btn-add",
      "btn-cta",
      "carrito-header",
    ]) {
      expect(classes.has(c), c).toBe(true);
    }
    expect(ids.has("btn-carrito")).toBe(true);
  });

  it("carga el CSS real desde la base indicada, con la plantilla elegida", () => {
    const doc = menuPreviewDocument({ template: "clasico", tema: "oscuro", assetsUrl: "https://menu.test" });
    expect(doc).toContain('href="https://menu.test/apps/menu-app/base.css"');
    expect(doc).toContain('href="https://menu.test/templates/carrito/clasico/styles.css"');
    expect(doc).toContain('href="https://menu.test/apps/menu-app/desktop.css"');
    expect(doc).toContain('data-template="clasico"');
    expect(doc).toContain('data-tema="oscuro"');
  });

  it("una plantilla o un tema desconocidos no llegan al HTML", () => {
    const doc = menuPreviewDocument({ template: 'x"><script>', tema: '"><b>', assetsUrl: "https://menu.test" });
    expect(doc).not.toContain("<b>");
    expect(doc).toContain('data-template="moderno"');
    expect(doc).toContain('data-tema="claro"');
  });

  it("los datos del negocio no están en el documento: llegan por mensaje y se escriben con textContent", () => {
    const doc = menuPreviewDocument({ template: "moderno", tema: "claro", assetsUrl: "https://menu.test" });
    expect(doc).toContain("textContent");
    expect(doc).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe("resolveAssetsUrl — ADMIN-CONFIG-28", () => {
  it("por defecto son los estáticos de producción", () => {
    expect(resolveAssetsUrl(undefined)).toBe(DEFAULT_MENU_ASSETS_URL);
    expect(resolveAssetsUrl("")).toBe(DEFAULT_MENU_ASSETS_URL);
  });

  it("la variable pública lo pisa (sin barra final), p. ej. el web/ local", () => {
    expect(resolveAssetsUrl("http://localhost:5500/")).toBe("http://localhost:5500");
  });

  it("lo que no es http(s) se ignora", () => {
    expect(resolveAssetsUrl("javascript:alert(1)")).toBe(DEFAULT_MENU_ASSETS_URL);
  });
});

describe("previewBrandVariables — ADMIN-CONFIG-29", () => {
  const casos = [
    { primary: "#463AE5", secondary: "#9A6CE0" },
    { primary: "#facc15", secondary: "#fde047" }, // amarillos: el texto tiene que ser oscuro
    { primary: "#5a4a3a", secondary: "#d97706" },
    { primary: "#fff", secondary: "#000" },
    { primary: "#111111" },
    { secondary: "#d97706" },
    { primary: "rojo", secondary: "#12" },
    {},
  ];

  it.each(casos)("da lo mismo que brandVariables de web/lib/colors.js (%j)", async (colores) => {
    const web = await loadWeb("apps/menu-app/lib/colors.js");
    expect(previewBrandVariables(colores)).toEqual(web.brandVariables(colores));
  });
});

describe("previewHeaderBackground y previewMessage — ADMIN-CONFIG-30", () => {
  type WebConfig = {
    template: string;
    colores?: { primary?: string; secondary?: string };
    header?: { imagen: string };
  };
  const configs: WebConfig[] = [
    { template: "moderno", colores: { primary: "#112233", secondary: "#445566" } },
    { template: "minimal", colores: { primary: "#112233", secondary: "#445566" } },
    { template: "minimal", colores: { primary: "#112233" }, header: { imagen: "https://x.test/a.jpg" } },
    { template: "clasico", colores: {}, header: { imagen: "https://x.test/a.jpg" } },
    { template: "moderno" },
  ];

  it.each(configs)("el fondo de la cabecera es el de web/lib/info.js (%j)", async (config) => {
    const web = await loadWeb("apps/menu-app/lib/info.js");
    const cssUrl = (u: string) => `url("${u}")`;
    expect(
      previewHeaderBackground({
        template: config.template,
        primary: config.colores?.primary ?? "",
        secondary: config.colores?.secondary ?? "",
        image: config.header?.imagen ?? "",
      }),
    ).toBe(web.headerBackground(config, cssUrl));
  });

  const input = {
    name: "Casa <b>Resto</b>",
    tagline: "Cocina casera",
    template: "moderno",
    primaryColor: "#112233",
    secondaryColor: "#445566",
    imageUrl: "https://x.test/a.jpg",
    logoUrl: "https://x.test/logo.png",
    focus: { x: 20, y: 80 },
    open: true,
  };

  it("el mensaje lleva los textos como datos, sin tocarlos", () => {
    const m = previewMessage(input);
    expect(m.name).toBe("Casa <b>Resto</b>");
    expect(m.tagline).toBe("Cocina casera");
  });

  it("la posición es la de web/lib/info.js", async () => {
    const web = await loadWeb("apps/menu-app/lib/info.js");
    expect(previewMessage(input).position).toBe(web.headerPosition({ header: { posicion: { x: 20, y: 80 } } }));
  });

  it("una imagen o un logo que no son https no se mandan", () => {
    const m = previewMessage({ ...input, imageUrl: "javascript:alert(1)", logoUrl: 'http://x/"y' });
    expect(m.image).toBe("");
    expect(m.logo).toBe("");
  });

  it("un color inválido se descarta (como el menú real)", () => {
    const m = previewMessage({ ...input, primaryColor: "red; background:url(x)" });
    expect(m.vars["--color-primary"]).toBeUndefined();
  });
});
