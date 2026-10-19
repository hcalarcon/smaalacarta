import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DICTIONARY, LANGS } from "./i18n.js";
import { applyLoaderAnimation } from "./loader.js";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("loader en la página (PUBLICO-83)", () => {
  const html = read("../index.html");
  const css = read("../base.css");

  it("incluye las animaciones de comida y escribe la marca, con un texto accesible aparte", () => {
    expect(html).toMatch(/id="loader"[^>]*data-animacion="hamburguesa"/);
    expect(html).toContain("loader-hamburguesa");
    expect(html).toContain("loader-pizza");
    expect(html).toContain("loader-cafe");
    expect(html).toContain("loader-helado");
    expect(html).toContain("loader-parrilla");
    expect(html).toContain("loader-sushi");
    expect(html).toContain("loader-pastas");
    expect(html).toContain("loader-panificados");
    expect(html).toContain('class="loader-marca"');
    expect(html).toContain("SMA a la carta");
    expect(html).toContain('data-i18n="loader.loading"');
    expect(html).not.toContain("loader-cloche");
    expect([...html.matchAll(/class="loader-anim [^"]+"[^>]*aria-hidden="true"/g)]).toHaveLength(8);
  });

  it("aplica la opción configurada después de cargar los datos del negocio", () => {
    expect(read("../app.js")).toContain("loaderLib.applyLoaderAnimation(config)");
  });

  it("muestra una sola animación elegida por data-animacion", () => {
    expect(css).toMatch(/\.loader\[data-animacion="hamburguesa"\]\s+\.loader-hamburguesa/);
    expect(css).toMatch(/\.loader\[data-animacion="pizza"\]\s+\.loader-pizza/);
    expect(css).toMatch(/\.loader\[data-animacion="cafe"\]\s+\.loader-cafe/);
    expect(css).toMatch(/\.loader\[data-animacion="helado"\]\s+\.loader-helado/);
    expect(css).toMatch(/\.loader\[data-animacion="parrilla"\]\s+\.loader-parrilla/);
    expect(css).toMatch(/\.loader\[data-animacion="sushi"\]\s+\.loader-sushi/);
    expect(css).toMatch(/\.loader\[data-animacion="pastas"\]\s+\.loader-pastas/);
    expect(css).toMatch(/\.loader\[data-animacion="panificados"\]\s+\.loader-panificados/);
  });

  it.each(["hamburguesa", "pizza", "cafe", "helado", "parrilla", "sushi", "pastas", "panificados"])(
    "selecciona la animación %s que configura el negocio",
    (animacion) => {
      const loader = { dataset: {}, setAttribute(name, value) { this.dataset[name] = value; } };
      const doc = { querySelector: () => loader };

      expect(applyLoaderAnimation({ animacionCarga: animacion }, doc)).toBe(animacion);
      expect(loader.dataset.animacion).toBe(animacion);
    },
  );

  it("el helado cae sobre el cucurucho y después cae la cereza, sin aparecer con un pop", () => {
    expect(css).toMatch(/loader-helado-bocha\s*\{[^}]*animation:\s*loader-helado-bocha 2\.8s/);
    expect(css).toMatch(/loader-helado-cereza\s*\{[^}]*animation:\s*loader-helado-cereza 2\.8s/);
    expect(css).toMatch(/@keyframes loader-helado-bocha\s*\{[^}]*0%, 10% \{ transform: translateY\(-48px\); \}[^}]*32% \{ transform: translateY\(0\); \}/);
    expect(css).toMatch(/@keyframes loader-helado-cereza\s*\{[^}]*0%, 46% \{ transform: translateY\(-28px\); \}[^}]*62% \{ transform: translateY\(0\); \}/);
    expect(html).toContain("m39 60 39-14");
  });

  it.each([undefined, "", "cohete"])("usa la hamburguesa si la animación falta o no está permitida (%s)", (animacion) => {
    const loader = { dataset: {}, setAttribute(name, value) { this.dataset[name] = value; } };
    const doc = { querySelector: () => loader };

    expect(applyLoaderAnimation({ animacionCarga: animacion }, doc)).toBe("hamburguesa");
    expect(loader.dataset.animacion).toBe("hamburguesa");
  });

  it("muestra el nombre del negocio que está cargando sin interpretar su contenido", () => {
    expect(html).toMatch(/id="loader-negocio"[^>]*class="loader-negocio"[^>]*hidden/);
    expect(read("../app.js")).toMatch(/loaderNegocio\.textContent\s*=\s*config\.nombre\s*\|\|\s*""/);
    expect(read("../app.js")).toContain('loaderNegocio.hidden = !config.nombre');
    expect(css).toMatch(/\.loader-negocio\s*\{[^}]*text-wrap:\s*balance;[^}]*overflow-wrap:\s*anywhere/);
  });

  it("anima solo si el visitante no pidió menos movimiento", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*loader-capa/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*loader-marca/);
    const animations = css.slice(
      css.indexOf("@media (prefers-reduced-motion: no-preference)"),
      css.indexOf("@keyframes loader-caer"),
    );
    for (const selector of [
      ".loader-pizza-cuerpo",
      ".loader-cafe-vapor",
      ".loader-helado-bocha",
      ".loader-parrilla-llamas",
      ".loader-sushi-salmon",
      ".loader-pastas-fideos",
      ".loader-panificados-pan",
    ]) {
      expect(animations).toContain(selector);
    }
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

  it("el loader recuerda el tema al cargar y cuando el visitante lo cambia (PUBLICO-85)", () => {
    const app = read("../app.js");
    expect(app.match(/rememberLoaderTheme\(\);/g)).toHaveLength(2);
  });

  it("el texto está en es, en y pt", () => {
    for (const lang of LANGS) expect(DICTIONARY[lang]["loader.loading"]).toBeTruthy();
  });
});
