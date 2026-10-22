import { describe, expect, it } from "vitest";
import { buildSections } from "../lib/vitrina.js";
import { ficha, lineasDeArranque, objetivo, sector, textos } from "./piezas.js";

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

describe("piezas del tema futurista (WEB-VITRINA-09 y 15)", () => {
  it("escapan el nombre, la descripción, las opciones y la foto del negocio", () => {
    const html = [ficha(categorias[0].items[0], t), objetivo(destacado, t), sector(categorias[0], 1, t)].join("");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/\sonerror="alert/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("la ficha lleva composición y créditos con el precio real", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "A", items: [{ nombre: "B", descripcion: "Carne", precio: 26900 }] }] }, "es");
    const html = ficha(cats[0].items[0], t);

    expect(html).toContain("COMPOSICIÓN");
    expect(html).toContain("CRÉDITOS");
    expect(html).toContain("$26.900");
    expect(ficha(cats[0].items[0], textos("en"))).toContain("COMPOSITION");
  });

  it("el destacado es el objetivo prioritario y las categorías, sectores numerados", () => {
    expect(objetivo(destacado, t)).toContain("OBJETIVO PRIORITARIO");
    expect(objetivo(null, t)).toBe("");
    expect(sector(categorias[0], 3, t)).toContain("SECTOR 03");
  });

  it("la terminal de arranque tiene texto en cada idioma", () => {
    for (const lang of ["es", "en", "pt"]) {
      const lineas = lineasDeArranque(lang);
      expect(lineas).toHaveLength(3);
      expect(lineas.join("")).toContain("SANTA JULIA");
    }
  });
});

describe("destacado agotado (WEB-VITRINA-15)", () => {
  it("el objetivo prioritario también avisa que no hay stock", () => {
    const { destacado: agotado } = buildSections({ categorias: [{ nombre: "A", items: [{ nombre: "B", precio: 1, destacado: true, agotado: true }] }] }, "es");

    expect(objetivo(agotado, textos("es"))).toContain("SIN STOCK");
  });
});
