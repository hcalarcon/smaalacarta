import { beforeEach, describe, expect, it } from "vitest";

import { applyPwa, GENERAL_FAVICON, GENERAL_TOUCH_ICON, manifestHref } from "./pwa.js";

const q = (sel) => document.head.querySelector(sel);

beforeEach(() => {
  document.head.innerHTML = '<title>Menú</title><link rel="icon" href="/viejo.ico" />';
  document.title = "Menú";
});

describe("manifestHref — PWA-1 y 2", () => {
  it("un negocio pide su manifest por slug", () => {
    expect(manifestHref("cliente", "santa-julia-resto")).toBe("/api/manifest?slug=santa-julia-resto");
  });

  it("las demos y lo desconocido piden el general", () => {
    expect(manifestHref("demo", "moderno")).toBe("/api/manifest");
    expect(manifestHref("cliente", "../x")).toBe("/api/manifest");
    expect(manifestHref("cliente", undefined)).toBe("/api/manifest");
    expect(manifestHref("cliente", "a&b=c")).toBe("/api/manifest");
  });
});

describe("applyPwa — PWA-1", () => {
  const config = { nombre: "Santa Julia Resto", colores: { primary: "#112233" }, logo: "https://cdn.example.com/l.png" };

  it("pone el nombre, el manifest, el ícono y el color del negocio", () => {
    applyPwa(document, { type: "cliente", slug: "santa", config });

    expect(document.title).toBe("Santa Julia Resto");
    expect(q('link[rel="manifest"]').getAttribute("href")).toBe("/api/manifest?slug=santa");
    expect(q('link[rel="icon"]').getAttribute("href")).toBe("https://cdn.example.com/l.png");
    expect(q('link[rel="apple-touch-icon"]').getAttribute("href")).toBe("https://cdn.example.com/l.png");
    expect(q('meta[name="theme-color"]').getAttribute("content")).toBe("#112233");
    expect(q('meta[name="apple-mobile-web-app-title"]').getAttribute("content")).toBe("Santa Julia");
  });

  it("reemplaza los íconos que había, sin duplicarlos", () => {
    applyPwa(document, { type: "cliente", slug: "santa", config });
    applyPwa(document, { type: "cliente", slug: "santa", config });
    expect(document.head.querySelectorAll('link[rel="icon"]').length).toBe(1);
    expect(document.head.querySelectorAll('link[rel="manifest"]').length).toBe(1);
  });

  it("sin logo usa los íconos generales", () => {
    applyPwa(document, { type: "cliente", slug: "santa", config: { ...config, logo: undefined } });
    expect(q('link[rel="icon"]').getAttribute("href")).toBe(GENERAL_FAVICON);
    expect(q('link[rel="apple-touch-icon"]').getAttribute("href")).toBe(GENERAL_TOUCH_ICON);
  });

  it("un logo que no es https no se usa como ícono", () => {
    applyPwa(document, { type: "cliente", slug: "santa", config: { ...config, logo: "javascript:alert(1)" } });
    expect(q('link[rel="icon"]').getAttribute("href")).toBe(GENERAL_FAVICON);
  });

  it("un color inválido no toca la barra del navegador", () => {
    applyPwa(document, { type: "cliente", slug: "santa", config: { ...config, colores: { primary: "red" } } });
    expect(q('meta[name="theme-color"]')).toBeNull();
  });

  it("una demo usa el manifest general", () => {
    applyPwa(document, { type: "demo", slug: "moderno", config });
    expect(q('link[rel="manifest"]').getAttribute("href")).toBe("/api/manifest");
  });
});
