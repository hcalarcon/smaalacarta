import { describe, expect, it } from "vitest";

import { renderStaticMenuPage } from "./static-page.js";

const base = {
  config: {
    nombre: "Ana Resto",
    descripcion: "Cocina casera",
    template: "clasico",
    telefono: "5493510000000",
    colores: { primary: "#112233", secondary: "#445566" },
  },
  menu: {
    categorias: [
      {
        nombre: "Bebidas",
        items: [{ nombre: "Café", descripcion: "Con leche", precio: 1000 }],
      },
    ],
  },
};

describe("renderStaticMenuPage — Etapa 6e", () => {
  it("carga el visor de imágenes (ESTATICO-9)", () => {
    expect(renderStaticMenuPage(base)).toContain('<script src="/apps/menu-app/lightbox.js"></script>');
  });

  it("muestra el nombre, la descripción, la categoría y el producto", () => {
    const html = renderStaticMenuPage(base);

    expect(html).toContain("Ana Resto");
    expect(html).toContain("Cocina casera");
    expect(html).toContain("Bebidas");
    expect(html).toContain("Café");
    expect(html).toContain("Con leche");
    expect(html).toContain("$1.000");
  });

  it("escapa el texto del negocio: un nombre con HTML no se ejecuta", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, nombre: '<script>alert(1)</script>' },
      menu: {
        categorias: [
          {
            nombre: "<img onerror=alert(1)>",
            items: [{ nombre: '"><b>hola</b>', descripcion: "", precio: 1 }],
          },
        ],
      },
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img onerror=alert(1)>");
    expect(html).not.toContain('"><b>hola</b>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("no muestra una categoría sin productos", () => {
    const html = renderStaticMenuPage({
      ...base,
      menu: { categorias: [{ nombre: "Vacía", items: [] }, ...base.menu.categorias] },
    });

    expect(html).not.toContain("Vacía");
  });

  it("la imagen de cabecera no rompe el atributo style (las comillas de url(\"…\") van escapadas)", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, header: { imagen: "https://cdn.example.com/cabecera.jpg" } },
    });

    const headerLine = html.split("\n").find((line) => line.includes('class="header"'));
    expect(headerLine).toContain("&quot;https://cdn.example.com/cabecera.jpg&quot;");
    // Ni una comilla suelta a mitad del atributo: el style tiene que cerrar una
    // sola vez, al final.
    expect(headerLine.match(/style="/g)).toHaveLength(1);
  });

  it("usa la plantilla y los colores del negocio", () => {
    const html = renderStaticMenuPage(base);

    expect(html).toContain('data-template="clasico"');
    expect(html).toContain('href="/templates/carrito/clasico/styles.css"');
    expect(html).toContain("--color-primary:#112233");
    expect(html).toContain("--color-secondary:#445566");
  });

  it("con colores claros el texto sobre la marca es oscuro (PUBLICO-15)", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, colores: { primary: "#ffe082", secondary: "#ffcc80" } },
    });

    expect(html).toContain("--on-brand:#111111");
    expect(html).toContain("--on-header:#111111");
  });

  it("una plantilla o color inválido cae al valor por defecto", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, template: "otra-cosa", colores: { primary: "javascript:alert(1)" } },
    });

    expect(html).toContain('data-template="moderno"');
    expect(html).toContain("--color-primary:#5a4a3a");
    expect(html).not.toContain("javascript:");
  });

  it("el tema va en data-tema; sin cargarlo, o con cualquier otra cosa, cae en claro", () => {
    expect(renderStaticMenuPage(base)).toContain('data-tema="claro"');
    expect(
      renderStaticMenuPage({ ...base, config: { ...base.config, tema: "oscuro" } }),
    ).toContain('data-tema="oscuro"');
    expect(
      renderStaticMenuPage({ ...base, config: { ...base.config, tema: "sepia" } }),
    ).toContain('data-tema="claro"');
  });

  it("avisa si está cerrado temporalmente", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, cierre: { mensaje: "Vacaciones", hasta: null } },
    });

    expect(html).toContain("Cerrado temporalmente");
    expect(html).toContain("Vacaciones");
    expect(html).toContain(">Cerrado<");
  });

  it("sin horarios ni cierre, está abierto", () => {
    const html = renderStaticMenuPage(base);
    expect(html).toContain(">Abierto<");
  });

  it("fuera de horario avisa cuándo vuelve a abrir", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, horarios: { lunes: [] } },
    });

    expect(html).toContain("Cerrado ahora");
  });

  it("la dirección y las redes solo aparecen si están cargadas", () => {
    const sinNada = renderStaticMenuPage(base);
    expect(sinNada).not.toContain("pie-negocio");

    const conDireccion = renderStaticMenuPage({
      ...base,
      config: { ...base.config, direccion: "San Martín 100" },
    });
    expect(conDireccion).toContain("San Martín 100");
    expect(conDireccion).toContain("google.com/maps");
  });

  it("el WhatsApp solo aparece con un teléfono cargado, con el estilo de botón de marca", () => {
    const sinTelefono = renderStaticMenuPage({ ...base, config: { ...base.config, telefono: null } });
    expect(sinTelefono).not.toContain("Consultar por WhatsApp");

    const conTelefono = renderStaticMenuPage(base);
    expect(conTelefono).toContain("Consultar por WhatsApp");
    expect(conTelefono).toContain("phone=5493510000000");
    expect(conTelefono).toContain('class="btn-cta"');
  });

  it("las redes se muestran con su ícono, no como texto suelto", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, redes: { instagram: "https://www.instagram.com/ana" } },
    });

    expect(html).toContain('aria-label="Instagram"');
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/>Instagram</);
  });

  it("el logo se muestra si el negocio lo cargó", () => {
    const sinLogo = renderStaticMenuPage(base);
    expect(sinLogo).not.toContain("<img");

    const conLogo = renderStaticMenuPage({
      ...base,
      config: { ...base.config, logo: "https://cdn.example.com/logo.png" },
    });
    expect(conLogo).toContain("https://cdn.example.com/logo.png");
  });

  it("una imagen que no es http(s) no se muestra", () => {
    const html = renderStaticMenuPage({
      ...base,
      menu: {
        categorias: [
          {
            nombre: "Bebidas",
            items: [{ nombre: "Café", precio: 1000, imagen: "javascript:alert(1)" }],
          },
        ],
      },
    });

    expect(html).not.toContain("<img");
  });
});

// Que el estático se vea como el interactivo (ESTATICO-4): mismas secciones, mismo
// encabezado, misma marca de promo.
describe("renderStaticMenuPage — ESTATICO-4 (igual que el interactivo)", () => {
  const conDestacadosYOfertas = {
    ...base,
    menu: {
      categorias: [
        {
          nombre: "Comidas",
          items: [
            { nombre: "Torta", precio: 4000, destacado: true },
            { nombre: "Pizza", precio: 5200, precioAnterior: 6500, promo: "20% OFF" },
          ],
        },
      ],
    },
  };

  it("arma las secciones Destacados y Ofertas antes de las categorías", () => {
    const html = renderStaticMenuPage(conDestacadosYOfertas);

    const titulos = [...html.matchAll(/<h2 class="categoria-titulo">([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(titulos).toEqual(["Destacados", "Ofertas", "Comidas"]);
    expect(html).toContain("categoria-destacados");
    expect(html).toContain("categoria-ofertas");
  });

  it("marca la promo del producto para que la plantilla la muestre como etiqueta", () => {
    const html = renderStaticMenuPage(conDestacadosYOfertas);

    expect(html).toContain('data-promo="20% OFF"');
  });

  it("escapa la promo", () => {
    const html = renderStaticMenuPage({
      ...base,
      menu: {
        categorias: [
          { nombre: "X", items: [{ nombre: "P", precio: 1, promo: '"><script>alert(1)</script>' }] },
        ],
      },
    });

    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("el estado va en el mismo contenedor del encabezado que en el interactivo", () => {
    const html = renderStaticMenuPage(base);

    expect(html).toMatch(/<div class="header-top">\s*<span class="badge-estado">/);
  });

  it("los enlaces de las categorías apuntan a secciones que existen", () => {
    const html = renderStaticMenuPage(conDestacadosYOfertas);

    const nav = html.match(/<nav class="categorias">.*?<\/nav>/s)[0];
    const ids = [...nav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);

    expect(ids.length).toBe(3);
    for (const id of ids) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});

describe("renderStaticMenuPage con ?lang= — IDIOMA-6", () => {
  const conCierre = {
    ...base,
    config: { ...base.config, cierre: { mensaje: "Vacaciones", hasta: "2030-01-15" } },
    menu: { categorias: [{ nombre: "Bebidas", items: [{ nombre: "Café", precio: 1, destacado: true }] }] },
  };

  it("sin idioma sigue en español", () => {
    const html = renderStaticMenuPage(conCierre);
    expect(html).toContain('<html lang="es"');
    expect(html).toContain("Cerrado temporalmente");
    expect(html).toContain("Destacados");
  });

  it("traduce la interfaz y no el contenido del negocio", () => {
    const html = renderStaticMenuPage({ ...conCierre, lang: "en" });
    expect(html).toContain('<html lang="en"');
    expect(html).toContain("Temporarily closed · Vacaciones · We reopen on 15/01");
    expect(html).toContain("Featured");
    expect(html).toContain("Ask us on WhatsApp");
    expect(html).toContain("Bebidas");
    expect(html).toContain("Ana Resto");
  });

  it("un idioma inválido cae a español", () => {
    expect(renderStaticMenuPage({ ...conCierre, lang: "fr" })).toContain('<html lang="es"');
  });

  it("el mensaje de WhatsApp al negocio queda en español (IDIOMA-5)", () => {
    const html = renderStaticMenuPage({ ...conCierre, lang: "pt" });
    expect(html).toContain(encodeURIComponent("Hola, consulto por el menú de Ana Resto"));
  });
});

describe("renderStaticMenuPage con productos sin stock — ESTATICO-7", () => {
  const conAgotado = {
    ...base,
    menu: {
      categorias: [
        {
          nombre: "Bebidas",
          items: [
            { nombre: "Café", precio: 1000 },
            { nombre: "Té", precio: 800, agotado: true },
          ],
        },
      ],
    },
  };

  it("el producto sin stock se ve atenuado y con su etiqueta; el otro no", () => {
    const html = renderStaticMenuPage(conAgotado);
    const articles = html.match(/<article class="producto[^"]*"[\s\S]*?<\/article>/g);
    const te = articles.find((a) => a.includes("Té"));
    const cafe = articles.find((a) => a.includes("Café"));

    expect(te).toContain("producto agotado");
    expect(te).toContain('<span class="etiqueta-agotado">Sin stock</span>');
    expect(cafe).not.toContain("agotado");
  });

  it("la etiqueta sale en el idioma pedido", () => {
    expect(renderStaticMenuPage({ ...conAgotado, lang: "en" })).toContain(">Out of stock<");
    expect(renderStaticMenuPage({ ...conAgotado, lang: "pt" })).toContain(">Sem estoque<");
  });

  it("agotado: false o ausente no marca nada", () => {
    const html = renderStaticMenuPage({
      ...base,
      menu: { categorias: [{ nombre: "Bebidas", items: [{ nombre: "Café", precio: 1, agotado: false }] }] },
    });

    expect(html).not.toContain("etiqueta-agotado");
  });
});

describe("opciones y extras de solo lectura — ESTATICO-8", () => {
  const hamburguesa = {
    nombre: "Hamburguesa",
    precio: 1000,
    opciones: [
      {
        id: "g1", nombre: "Punto", min: 1, max: 1, repetir: false,
        opciones: [{ id: "a", nombre: "Jugoso", precio: 0 }, { id: "b", nombre: "Cocido", precio: 0 }],
      },
      {
        id: "g2", nombre: "Extras", min: 0, max: 2, repetir: false,
        opciones: [
          { id: "c", nombre: "Queso", precio: 500 },
          { id: "d", nombre: "Panceta", precio: 800 },
          { id: "e", nombre: "Huevo", precio: 0, agotado: true },
        ],
      },
      { id: "g3", nombre: "Salsas", min: 0, max: 1, repetir: false, opciones: [{ id: "f", nombre: "Mayo", precio: 50 }] },
      {
        id: "g4", nombre: "Sabores", min: 2, max: 4, repetir: true,
        opciones: [{ id: "h", nombre: "Frutilla", precio: 0 }],
      },
    ],
  };

  const render = (items, extra = {}) =>
    renderStaticMenuPage({ ...base, ...extra, menu: { categorias: [{ nombre: "Comidas", items }] } });
  const textOf = (html) => new DOMParser().parseFromString(html, "text/html");
  const lines = (html) =>
    [...textOf(html).querySelectorAll(".opciones-estatico")].map((p) => p.textContent.replace(/\s+/g, " ").trim());

  it("lista bajo el producto cada grupo con sus opciones y el extra de las que cuestan", () => {
    const l = lines(render([hamburguesa]));

    expect(l[1]).toBe("Extras: Queso +$500 · Panceta +$800 · Huevo (Sin stock) (hasta 2)");
  });

  it("dice qué hay que elegir en los grupos obligatorios y no pone '+$0'", () => {
    const l = lines(render([hamburguesa]));

    expect(l[0]).toBe("Punto: Jugoso · Cocido (elegí 1)");
    expect(l[3]).toBe("Sabores: Frutilla (elegí de 2 a 4)");
    expect(l.join(" ")).not.toContain("+$0");
  });

  it("un grupo opcional de un solo lugar no lleva aclaración", () => {
    expect(lines(render([hamburguesa]))[2]).toBe("Salsas: Mayo +$50");
  });

  it("es solo texto: sin carrito, sin casillas ni botones para elegir", () => {
    const doc = textOf(render([hamburguesa]));

    expect(doc.querySelector("input, select, button")).toBeNull();
    expect(doc.querySelector("#carrito-panel, .btn-add")).toBeNull();
  });

  it("un producto sin opciones no muestra nada extra", () => {
    expect(lines(render([{ nombre: "Café", precio: 1000 }, { nombre: "Té", precio: 1, opciones: [] }]))).toEqual([]);
  });

  it("los nombres de grupos y opciones se escapan", () => {
    const html = render([
      {
        nombre: "X", precio: 1,
        opciones: [
          { id: "g", nombre: "<b>Grupo</b>", min: 0, max: 2, repetir: false, opciones: [{ id: "o", nombre: '<img src=x onerror="a()">', precio: 5 }] },
        ],
      },
    ]);

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Grupo</b>");
    expect(html).toContain("&lt;b&gt;Grupo&lt;/b&gt;");
    expect(textOf(html).querySelector(".opciones-estatico").textContent).toContain('<img src=x onerror="a()">');
  });

  it("los textos se traducen: 'hasta' y 'elegí' en inglés y portugués", () => {
    const enPage = renderStaticMenuPage({ ...base, lang: "en", menu: { categorias: [{ nombre: "Comidas", items: [hamburguesa] }] } });
    const ptPage = renderStaticMenuPage({ ...base, lang: "pt", menu: { categorias: [{ nombre: "Comidas", items: [hamburguesa] }] } });

    expect(lines(enPage)[0]).toBe("Punto: Jugoso · Cocido (pick 1)");
    expect(lines(enPage)[1]).toContain("(up to 2)");
    expect(lines(enPage)[1]).toContain("Huevo (Out of stock)");
    expect(lines(ptPage)[0]).toBe("Punto: Jugoso · Cocido (escolha 1)");
    expect(lines(ptPage)[1]).toContain("(até 2)");
  });
});
