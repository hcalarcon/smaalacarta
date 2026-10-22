import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEMAS, WHATSAPP, barraHtml, buildSections, galeriaHtml, lineasDeOpciones, whatsappLink } from "./vitrina.js";

const MENU = {
  categorias: [
    {
      nombre: "Hamburguesas",
      nombre_en: "Burgers",
      items: [
        {
          nombre: "Santa Julia",
          nombre_en: "Santa Julia EN",
          descripcion: "Doble carne",
          descripcion_en: "Double patty",
          precio: 26900,
          imagen: "https://images.pexels.com/foto.jpg",
          destacado: true,
          opciones: [
            {
              nombre: "Guarnición",
              min: 1,
              max: 1,
              opciones: [
                { nombre: "Papas", precio: 0 },
                { nombre: "Puré", precio: 500 },
              ],
            },
          ],
        },
        { nombre: "Clásica", precio: 18000, imagen: "javascript:alert(1)" },
      ],
    },
    { nombre: "Vacía", items: [] },
    { nombre: "Pizzas", items: [{ nombre: "Muzza", precio: 12000 }] },
    { nombre: "Pizzas", items: [{ nombre: "Fugazza", precio: 13000 }] },
  ],
};

const aqui = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));

describe("buildSections (WEB-VITRINA-03)", () => {
  it("arma categorías con id, precio formateado y destacado aparte", () => {
    const { categorias, destacado } = buildSections(MENU, "es");

    expect(categorias.map((c) => c.id)).toEqual(["cat-hamburguesas", "cat-pizzas", "cat-pizzas-2"]);
    expect(categorias[0].items[0]).toMatchObject({ nombre: "Santa Julia", precio: "26.900", destacado: true });
    expect(destacado.nombre).toBe("Santa Julia");
  });

  it("no incluye categorías sin productos ni imágenes que no sean http(s)", () => {
    const { categorias } = buildSections(MENU, "es");

    expect(categorias.some((c) => c.nombre === "Vacía")).toBe(false);
    expect(categorias[0].items[1].imagen).toBe("");
    expect(categorias[0].items[0].imagen).toBe("https://images.pexels.com/foto.jpg");
  });

  it("muestra los textos en el idioma elegido, con el español de respaldo", () => {
    const en = buildSections(MENU, "en");

    expect(en.categorias[0].nombre).toBe("Burgers");
    expect(en.categorias[0].items[0].descripcion).toBe("Double patty");
    expect(en.categorias[1].nombre).toBe("Pizzas");
  });

  it("devuelve secciones vacías con un menú vacío o roto", () => {
    expect(buildSections(null, "es")).toEqual({ categorias: [], destacado: null });
  });
});

describe("opciones del producto (WEB-VITRINA-04)", () => {
  it("las muestra como información, con extra y regla", () => {
    expect(lineasDeOpciones(MENU.categorias[0].items[0], "es")).toEqual(["Guarnición: Papas · Puré +$500 (elegí 1)"]);
    expect(lineasDeOpciones(MENU.categorias[0].items[0], "en")).toEqual(["Guarnición: Papas · Puré +$500 (pick 1)"]);
  });

  it("un producto sin opciones no trae líneas", () => {
    expect(lineasDeOpciones({ nombre: "Agua" }, "es")).toEqual([]);
  });
});

describe("WhatsApp (WEB-VITRINA-05)", () => {
  it("va al número de Herni con el nombre del tema, bien codificado", () => {
    const url = new URL(whatsappLink("Floral delicado"));

    expect(url.origin + url.pathname).toBe(`https://wa.me/${WHATSAPP}`);
    expect(WHATSAPP).toBe("5493644277105");
    expect(url.searchParams.get("text")).toBe(
      "Hola Herni, vi el menú Floral delicado y quiero uno así para mi local. Mi local se llama: ",
    );
  });
});

describe("barra fija (WEB-VITRINA-06)", () => {
  it("lleva la firma, el link a otros estilos y el botón de WhatsApp en cada idioma", () => {
    for (const lang of ["es", "en", "pt"]) {
      const html = barraHtml(TEMAS[0], lang);

      expect(html).toContain('href="https://smaalacarta.com.ar"');
      expect(html).toContain('href="/vitrina"');
      expect(html).toContain("wa.me/5493644277105");
    }
  });
});

describe("escape de datos (WEB-VITRINA-09)", () => {
  it("el nombre de un tema o de un producto nunca llega como HTML sin escapar", () => {
    const html = barraHtml({ nombre: '<script>alert("x")</script>' }, "es");
    expect(html).not.toContain("<script>");

    const { categorias } = buildSections(
      { categorias: [{ nombre: "Cat", items: [{ nombre: '<script>alert("x")</script>', precio: 1 }] }] },
      "es",
    );
    // Los temas pasan cada texto por escapeHtml; acá se comprueba que el dato llega intacto para escaparlo.
    expect(categorias[0].items[0].nombre).toBe('<script>alert("x")</script>');
  });

  it("las piezas de cada tema escapan lo que arman (comprobado en <tema>/piezas.test.js)", () => {
    for (const tema of TEMAS.filter((t) => existsSync(aqui(`../${t.id}/index.html`)))) {
      expect(existsSync(aqui(`../${tema.id}/piezas.test.js`)), tema.id).toBe(true);
    }
  });
});

describe("galería (WEB-VITRINA-12)", () => {
  it("lista los 5 temas", () => {
    expect(TEMAS.map((t) => t.id)).toEqual(["arcade", "floral", "futurista", "natural", "fantasia"]);
    expect(galeriaHtml().match(/class="tarjeta[ "]/g)).toHaveLength(5);
  });

  it("un tema está listo si y solo si tiene su carpeta; si no, 'Próximamente' y sin link", () => {
    for (const tema of TEMAS) {
      expect(tema.listo).toBe(existsSync(aqui(`../${tema.id}/index.html`)));
    }

    const html = galeriaHtml([{ id: "futurista", nombre: "Futurista", lema: "x", listo: false }]);
    expect(html).toContain("Próximamente");
    expect(html).not.toContain("<a ");
  });
});

describe("rutas (WEB-VITRINA-01)", () => {
  const { rewrites } = JSON.parse(readFileSync(aqui("../../../vercel.json"), "utf8"));
  const sources = rewrites.map((r) => r.source);
  const comodin = sources.findIndex((s) => s.startsWith("/(("));

  it("la vitrina va antes del comodín del menú", () => {
    const galeria = sources.indexOf("/vitrina");
    const tema = sources.findIndex((s) => s.startsWith("/vitrina/:tema"));

    expect(galeria).toBeGreaterThanOrEqual(0);
    expect(tema).toBeGreaterThanOrEqual(0);
    expect(galeria).toBeLessThan(comodin);
    expect(tema).toBeLessThan(comodin);
    expect(rewrites[tema].destination).toBe("/apps/vitrina/:tema/index.html");
  });

  it("siguen las rutas de /pdf, /menu.html y /pedido/:code", () => {
    expect(sources).toEqual(expect.arrayContaining(["/pdf", "/menu.html", "/pedido/:code"]));
    expect(comodin).toBe(sources.length - 1);
  });

  it("el comodín del menú no se come los archivos de la vitrina", () => {
    const re = new RegExp(`^${rewrites[comodin].source}$`);

    expect(re.test("/apps/vitrina/arcade/styles.css")).toBe(false);
    expect(re.test("/vitrina")).toBe(true); // por eso la ruta de la vitrina va antes
  });
});
