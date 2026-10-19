import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyMenuLook, backgroundUrl, menuAnimation, MENU_ANIMATIONS } from "./menu-look.js";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const css = read("../base.css");

function fakeDoc() {
  const props = new Map();
  const classes = new Set();
  const root = {
    dataset: {},
    classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n), contains: (n) => classes.has(n) },
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
  };
  return { documentElement: root, props, classes };
}

describe("menuAnimation — PUBLICO-102", () => {
  it.each(MENU_ANIMATIONS)("acepta %s", (value) => {
    expect(menuAnimation({ animacionMenu: value })).toBe(value);
  });

  it.each([undefined, null, "", "loca", "NINGUNA", 3])("usa la estándar si falta o no vale (%s)", (value) => {
    expect(menuAnimation({ animacionMenu: value })).toBe("estandar");
    expect(menuAnimation(null)).toBe("estandar");
  });
});

describe("backgroundUrl — PUBLICO-107", () => {
  it("acepta una dirección https", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/business-images/n/f.webp";
    expect(backgroundUrl({ fondo: url })).toBe(url);
  });

  it.each([
    undefined,
    "",
    "http://x.com/f.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    'https://x.com/f.jpg"); background: url(https://evil',
    "https://x.com/f (1).jpg",
    "https://x.com/f.jpg'",
    42,
  ])("descarta lo que no es seguro (%s)", (fondo) => {
    expect(backgroundUrl({ fondo })).toBeNull();
  });
});

describe("applyMenuLook — PUBLICO-102 y 107", () => {
  it("pone la animación y el fondo, y los saca si después faltan", () => {
    const doc = fakeDoc();

    const applied = applyMenuLook(doc, { animacionMenu: "dinamica", fondo: "https://x.com/f.jpg" });
    expect(applied).toEqual({ animation: "dinamica", background: "https://x.com/f.jpg" });
    expect(doc.documentElement.dataset.animacionMenu).toBe("dinamica");
    expect(doc.classes.has("con-fondo")).toBe(true);
    expect(doc.props.get("--fondo-url")).toBe('url("https://x.com/f.jpg")');

    applyMenuLook(doc, {});
    expect(doc.documentElement.dataset.animacionMenu).toBe("estandar");
    expect(doc.classes.has("con-fondo")).toBe(false);
    expect(doc.props.has("--fondo-url")).toBe(false);
  });

  it("un fondo inseguro no deja nada puesto", () => {
    const doc = fakeDoc();
    applyMenuLook(doc, { fondo: "javascript:alert(1)" });
    expect(doc.classes.has("con-fondo")).toBe(false);
    expect(doc.props.size).toBe(0);
  });
});

describe("las animaciones en CSS — PUBLICO-102 y 109", () => {
  const motion = css.slice(css.indexOf("/* ANIMACIONES DEL MENÚ"), css.indexOf("/* FONDO DEL MENÚ"));
  const gate = motion.indexOf("@media (prefers-reduced-motion: no-preference)");

  it("las que mueven algo viven dentro de prefers-reduced-motion: no-preference", () => {
    expect(gate).toBeGreaterThan(-1);
    const block = motion.slice(gate, motion.indexOf("html[data-animacion-menu=\"ninguna\"]"));
    expect(block).toMatch(/\[data-animacion-menu="suave"\]/);
    expect(block).toMatch(/\[data-animacion-menu="dinamica"\]/);
    // Antes del bloque que respeta el movimiento reducido no se arma ninguna animación.
    expect(motion.slice(0, gate)).not.toMatch(/animation:\s*menu-(suave|desliza|rebota)/);
  });

  it("'Sin animaciones' apaga las animaciones y transiciones del menú, no las del cargador", () => {
    expect(motion).toMatch(/\[data-animacion-menu="ninguna"\][^{]*\{[^}]*animation:\s*none\s*!important/);
    expect(motion).toMatch(/\[data-animacion-menu="ninguna"\][^{]*\{[^}]*transition:\s*none\s*!important/);
    expect(motion).toContain(":not(#loader)");
  });

  it("existen los keyframes de cada animación", () => {
    for (const name of ["menu-suave", "menu-desliza", "menu-rebota"]) {
      expect(css).toContain(`@keyframes ${name}`);
    }
  });
});

describe("el fondo en CSS — PUBLICO-107", () => {
  const block = css.slice(css.indexOf("/* FONDO DEL MENÚ"));

  it("es una capa fija detrás del contenido, cubre sin deformar y no tapa los productos", () => {
    expect(block).toMatch(/html\.con-fondo::before\s*\{[^}]*position:\s*fixed/);
    expect(block).toMatch(/html\.con-fondo::before\s*\{[^}]*z-index:\s*-1/);
    expect(block).toMatch(/html\.con-fondo::before\s*\{[^}]*pointer-events:\s*none/);
    expect(block).toMatch(/var\(--fondo-url\) center \/ cover no-repeat/);
  });

  it("lleva una capa del color de la página encima, para que el texto se lea en claro y oscuro", () => {
    expect(block).toMatch(/color-mix\(\s*in srgb, var\(--bg/);
    expect(block).toMatch(/\[data-tema="oscuro"\]/);
  });

  it("la página deja ver la capa, en las tres plantillas", () => {
    expect(block).toMatch(/html\.con-fondo body\s*\{[^}]*background:\s*transparent/);
  });
});
