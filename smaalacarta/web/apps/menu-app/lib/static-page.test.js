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
  it("muestra el nombre, la descripción, la categoría y el producto", () => {
    const html = renderStaticMenuPage(base);

    expect(html).toContain("Ana Resto");
    expect(html).toContain("Cocina casera");
    expect(html).toContain("Bebidas");
    expect(html).toContain("Café");
    expect(html).toContain("Con leche");
    expect(html).toContain("$1000");
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

  it("una plantilla o color inválido cae al valor por defecto", () => {
    const html = renderStaticMenuPage({
      ...base,
      config: { ...base.config, template: "otra-cosa", colores: { primary: "javascript:alert(1)" } },
    });

    expect(html).toContain('data-template="moderno"');
    expect(html).toContain("--color-primary:#5a4a3a");
    expect(html).not.toContain("javascript:");
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
