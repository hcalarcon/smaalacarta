import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DICTIONARY, LANGS } from "./i18n.js";
import { loaderVariant } from "./loader.js";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("loaderVariant (PUBLICO-84)", () => {
  it("usa la hamburguesa si no se pide otra", () => {
    expect(loaderVariant("")).toBe("hamburguesa");
    expect(loaderVariant("?demo=moderno")).toBe("hamburguesa");
  });

  it("acepta las dos variantes por la dirección", () => {
    expect(loaderVariant("?loader=cloche")).toBe("cloche");
    expect(loaderVariant("?demo=moderno&loader=hamburguesa")).toBe("hamburguesa");
  });

  it("ignora un valor desconocido", () => {
    expect(loaderVariant("?loader=otra")).toBe("hamburguesa");
  });
});

describe("loader en la página (PUBLICO-83)", () => {
  const html = read("../index.html");
  const css = read("../base.css");

  it("trae las dos animaciones y un texto accesible", () => {
    expect(html).toContain("loader-hamburguesa");
    expect(html).toContain("loader-cloche");
    expect(html).toContain('data-i18n="loader.loading"');
  });

  it("anima solo si el visitante no pidió menos movimiento", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*loader-capa/);
  });

  it("el texto está en es, en y pt", () => {
    for (const lang of LANGS) expect(DICTIONARY[lang]["loader.loading"]).toBeTruthy();
  });
});
