import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DICTIONARY, LANGS } from "./i18n.js";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("loader en la página (PUBLICO-83)", () => {
  const html = read("../index.html");
  const css = read("../base.css");

  it("arma la hamburguesa y escribe la marca, con un texto accesible aparte", () => {
    expect(html).toContain("loader-hamburguesa");
    expect(html).toContain('class="loader-marca"');
    expect(html).toContain("SMA a la carta");
    expect(html).toContain('data-i18n="loader.loading"');
    expect(html).not.toContain("loader-cloche");
  });

  it("anima solo si el visitante no pidió menos movimiento", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*loader-capa/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*loader-marca/);
  });

  it("el loader se desvanece y el menú entra con fade, sin esconder el loader de golpe (PUBLICO-85)", () => {
    const app = read("../app.js");
    expect(app).not.toContain('loader.style.display = "none"');
    expect(app).toContain("finishLoading()");
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*\.loader-saliendo/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*menu-entra/);
    expect(css).toMatch(/\[data-tema="oscuro"\] \.loader/);
    // Fondo propio: blanco en claro y oscuro en oscuro, sin tomar el de la plantilla a mitad de carga.
    expect(css).not.toMatch(/\.loader \{[^}]*var\(--bg/);
    expect(read("../index.html")).toContain("savedLoaderTheme");
  });

  it("la marca se escribe completa y el carrito no aparece de golpe al entrar", () => {
    const marca = "SMA a la carta";
    expect(css).toContain(`steps(${marca.length}, end)`);
    // Cada letra mide 1ch más el espaciado entre letras: el ancho final tiene que sumarlo.
    expect(css).toContain(`width: calc(${marca.length}ch + ${marca.length} * var(--loader-espaciado))`);
    // El botón del carrito arranca invisible por su cuenta: animarlo lo mostraba medio segundo.
    expect(css).not.toMatch(/body\.entrando :is\([^)]*btn-carrito/);
  });

  it("el texto está en es, en y pt", () => {
    for (const lang of LANGS) expect(DICTIONARY[lang]["loader.loading"]).toBeTruthy();
  });
});
