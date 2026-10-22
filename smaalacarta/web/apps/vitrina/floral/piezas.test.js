import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSections } from "../lib/vitrina.js";
import { FLORES, chef, florDeLaCategoria, plato, seccion, separador, textos } from "./piezas.js";

const MALO = '<script>alert("x")</script>';
const menu = {
  categorias: [
    {
      nombre: MALO,
      items: [
        {
          nombre: MALO,
          descripcion: `"><img src=x onerror=alert(1)>`,
          precio: 26900,
          imagen: `https://ejemplo.com/a.jpg" onerror="alert(1)`,
          destacado: true,
          opciones: [{ nombre: MALO, min: 1, max: 1, opciones: [{ nombre: MALO, precio: 0 }] }],
        },
      ],
    },
  ],
};
const { categorias, destacado } = buildSections(menu, "es");
const t = textos("es");

describe("piezas del tema floral (WEB-VITRINA-09 y 14)", () => {
  it("escapan el nombre, la descripción, las opciones y la foto del negocio", () => {
    const html = [plato(categorias[0].items[0], t), chef(destacado, t), seccion(categorias[0], 0, t)].join("");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/\sonerror="alert/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("el plato lleva línea de puntos hasta el precio real", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "Postres", items: [{ nombre: "Flan", precio: 8500 }] }] }, "es");
    const html = plato(cats[0].items[0], t);

    expect(html).toContain('class="puntos"');
    expect(html).toContain("$8.500");
  });

  it("el destacado es la sugerencia del chef, con sello de lacre, en cada idioma", () => {
    expect(chef(destacado, textos("es"))).toContain("Sugerencia del chef");
    expect(chef(destacado, textos("en"))).toContain("Chef&#39;s suggestion");
    expect(chef(destacado, textos("pt"))).toContain("Sugestão do chef");
    expect(chef(destacado, t)).toContain('href="#sello"');
    expect(chef(null, t)).toBe("");
  });

  it("cada categoría lleva un separador floral distinto", () => {
    const usadas = FLORES.map((_, i) => florDeLaCategoria(i));

    expect(new Set(usadas).size).toBe(FLORES.length);
    expect(separador(1)).toContain(`#${FLORES[1]}`);
    expect(florDeLaCategoria(FLORES.length)).toBe(FLORES[0]);
  });

  it("un producto sin foto deja el óvalo de respaldo", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "X", items: [{ nombre: "Sin foto", precio: 1 }] }] }, "es");

    expect(plato(cats[0].items[0], t)).toContain("sin-foto");
  });
});

describe("símbolos del index.html", () => {
  it("define cada flor y el sello que usan las piezas", () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.html"), "utf8");

    for (const id of [...FLORES, "sello"]) expect(html, id).toContain(`<symbol id="${id}"`);
  });
});
