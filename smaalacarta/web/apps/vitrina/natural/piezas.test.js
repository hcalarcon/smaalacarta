import { describe, expect, it } from "vitest";
import { buildSections } from "../lib/vitrina.js";
import { imperdible, postal, sendero, textos } from "./piezas.js";

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

describe("piezas del tema natural (WEB-VITRINA-09 y 16)", () => {
  it("escapan el nombre, la descripción, las opciones y la foto del negocio", () => {
    const html = [postal(categorias[0].items[0], t), imperdible(destacado, t), sendero(categorias[0], 1, t)].join("");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/\sonerror="alert/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("la postal muestra el precio real en la etiqueta de madera", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "A", items: [{ nombre: "B", precio: 26900 }] }] }, "es");

    expect(postal(cats[0].items[0], t)).toContain("$26.900");
  });

  it("las categorías son senderos numerados y el destacado, el imperdible", () => {
    expect(sendero(categorias[0], 2, t)).toContain("Sendero 2");
    expect(sendero(categorias[0], 2, textos("en"))).toContain("Trail 2");
    expect(imperdible(destacado, t)).toContain("El imperdible del lugar");
    expect(imperdible(null, t)).toBe("");
  });

  it("un producto sin foto deja el marco de respaldo y uno agotado lo dice", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "X", items: [{ nombre: "Sin foto", precio: 1, agotado: true }] }] }, "es");
    const html = postal(cats[0].items[0], t);

    expect(html).toContain("sin-foto");
    expect(html).toContain("Sin stock");
  });
});
