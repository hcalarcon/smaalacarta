import { describe, expect, it } from "vitest";
import { buildSections } from "../lib/vitrina.js";
import { boss, enlaceMundo, mundo, tarjeta, textos } from "./piezas.js";

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

describe("piezas del arcade (WEB-VITRINA-09 y 13)", () => {
  it("escapan el nombre, la descripción, las opciones y la foto del negocio", () => {
    const html = [
      tarjeta(categorias[0].items[0], t),
      boss(destacado, t),
      mundo(categorias[0], 1, t),
      enlaceMundo(categorias[0], 1),
    ].join("");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/\sonerror="alert/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("muestra el precio real legible, aunque sea un 'puntaje'", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "Entradas", items: [{ nombre: "Papas", precio: 26900 }] }] }, "es");

    expect(tarjeta(cats[0].items[0], t)).toContain("$26.900");
  });

  it("el destacado es el ítem legendario, con su etiqueta en cada idioma", () => {
    expect(boss(destacado, textos("es"))).toContain("ÍTEM LEGENDARIO");
    expect(boss(destacado, textos("en"))).toContain("LEGENDARY ITEM");
    expect(boss(destacado, textos("pt"))).toContain("ITEM LENDÁRIO");
    expect(boss(null, t)).toBe("");
  });

  it("las categorías son mundos numerados", () => {
    expect(mundo(categorias[0], 2, t)).toContain("MUNDO 2");
    expect(mundo(categorias[0], 2, textos("en"))).toContain("WORLD 2");
  });

  it("un producto sin foto deja el marco de respaldo y uno agotado lo dice", () => {
    const { categorias: cats } = buildSections(
      { categorias: [{ nombre: "X", items: [{ nombre: "Sin foto", precio: 1, agotado: true }] }] },
      "es",
    );
    const html = tarjeta(cats[0].items[0], t);

    expect(html).toContain("sin-foto");
    expect(html).toContain("GAME OVER");
  });
});
