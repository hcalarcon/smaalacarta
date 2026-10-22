import { describe, expect, it } from "vitest";
import { buildSections } from "../lib/vitrina.js";
import { PESOS_POR_MONEDA, lugar, mapa, monedas, nombreDeFantasia, provision, textos, tesoro } from "./piezas.js";

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

describe("piezas del tema fantasía (WEB-VITRINA-09 y 17)", () => {
  it("escapan el nombre, la descripción, las opciones y la foto del negocio", () => {
    const html = [
      provision(categorias[0].items[0], t),
      tesoro(destacado, t),
      lugar(categorias[0], "es", t),
      mapa(categorias, "es", t),
    ].join("");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/\sonerror="alert/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("el precio va en monedas de oro y en pesos reales", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "A", items: [{ nombre: "B", precio: 26900 }] }] }, "es");
    const html = provision(cats[0].items[0], t);

    expect(html).toContain("27 ");
    expect(html).toContain("monedas de oro");
    expect(html).toContain("$26.900");
    expect(provision(cats[0].items[0], textos("en"))).toContain("gold coins");
  });

  it("las monedas salen de dividir por el valor de una moneda, y nunca son menos de una", () => {
    expect(PESOS_POR_MONEDA).toBe(1000);
    expect(monedas(26900)).toBe(27);
    expect(monedas(200)).toBe(1);
    expect(monedas("x")).toBe(0);
    expect(monedas(0)).toBe(0);
    expect(monedas(null)).toBe(0);
    expect(mapa(categorias, "es", t)).toContain("1 moneda de oro = $1.000");
  });

  it("los lugares tienen nombre de fantasía en cada idioma, y el nombre real siempre se ve", () => {
    expect(nombreDeFantasia("Hamburguesas", "es")).toBe("La Forja de las Hamburguesas");
    expect(nombreDeFantasia("Pizzas", "es")).toBe("El Horno de los Magos");
    expect(nombreDeFantasia("Burgers", "en")).toBe("The Burger Forge");
    expect(nombreDeFantasia("Massas", "pt")).toBe("O Moinho dos Sábios");
    expect(nombreDeFantasia("Sándwiches", "es")).toBe("Las Tierras de Sándwiches");

    const html = lugar({ id: "cat-pizzas", nombre: "Pizzas", items: [{ nombre: "Muzza", precio: "12.000", valor: 12000, opciones: [] }] }, "es", t);
    expect(html).toContain("El Horno de los Magos");
    expect(html).toContain('<span class="reino-real">Pizzas</span>');
    expect(html).toContain("Muzza");
  });

  it("el mapa lleva un lugar por categoría con link a su sección", () => {
    const html = mapa(
      [
        { id: "cat-pizzas", nombre: "Pizzas", items: [] },
        { id: "cat-pastas", nombre: "Pastas", items: [] },
      ],
      "es",
      t,
    );

    expect(html).toContain('href="#cat-pizzas"');
    expect(html).toContain('href="#cat-pastas"');
    expect(mapa([], "es", t)).toBe("");
  });

  it("el destacado es el tesoro de la casa, con su sello", () => {
    expect(tesoro(destacado, t)).toContain("El tesoro de la casa");
    expect(tesoro(destacado, t)).toContain("lacre");
    expect(tesoro(null, t)).toBe("");
  });

  it("un producto sin foto deja el marco de respaldo y uno agotado lo dice", () => {
    const { categorias: cats } = buildSections({ categorias: [{ nombre: "X", items: [{ nombre: "Sin foto", precio: 1, agotado: true }] }] }, "es");
    const html = provision(cats[0].items[0], t);

    expect(html).toContain("sin-foto");
    expect(html).toContain("Agotado");
  });
});
