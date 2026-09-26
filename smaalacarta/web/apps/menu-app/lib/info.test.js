import { describe, expect, it } from "vitest";

import { closedNotice, headerBackground, mapsUrl, reopenText, isDemoMenu, socialLinks } from "./info.js";

describe("closedNotice — PUBLICO-9", () => {
  it("sin cierre no hay aviso", () => {
    expect(closedNotice({ nombre: "X" })).toBeNull();
    expect(closedNotice(null)).toBeNull();
    expect(closedNotice(undefined)).toBeNull();
  });

  it("con cierre, el aviso lleva el mensaje y la fecha", () => {
    expect(closedNotice({ cierre: { mensaje: "Vacaciones", hasta: "2030-01-15" } })).toEqual({
      message: "Vacaciones",
      reopensOn: "2030-01-15",
    });
  });

  it("un cierre vacío también es un aviso", () => {
    expect(closedNotice({ cierre: {} })).toEqual({ message: "", reopensOn: null });
  });
});

describe("reopenText — PUBLICO-9", () => {
  it("da la fecha en formato día/mes", () => {
    expect(reopenText("2030-01-15")).toBe("Reabrimos el 15/01");
    expect(reopenText("2030-12-05")).toBe("Reabrimos el 05/12");
  });

  it.each([null, undefined, "", "mañana", "15/01/2030", "2030-13-40"])("con %j no dice nada", (v) => {
    expect(reopenText(v)).toBe("");
  });
});

describe("socialLinks — PUBLICO-9", () => {
  it("arma los enlaces de las redes cargadas", () => {
    expect(
      socialLinks({
        redes: {
          instagram: "https://www.instagram.com/casa",
          facebook: "https://www.facebook.com/casa",
        },
      }),
    ).toEqual([
      { key: "instagram", name: "Instagram", url: "https://www.instagram.com/casa" },
      { key: "facebook", name: "Facebook", url: "https://www.facebook.com/casa" },
    ]);
  });

  it("solo con una red, solo esa", () => {
    expect(socialLinks({ redes: { instagram: "https://www.instagram.com/casa" } })).toEqual([
      { key: "instagram", name: "Instagram", url: "https://www.instagram.com/casa" },
    ]);
  });

  it("sin redes, nada", () => {
    expect(socialLinks({})).toEqual([]);
    expect(socialLinks({ redes: {} })).toEqual([]);
    expect(socialLinks(null)).toEqual([]);
  });

  it("descarta lo que no es una dirección https de esa red", () => {
    expect(
      socialLinks({
        redes: {
          instagram: "javascript:alert(1)",
          facebook: "https://evil.com/casa",
        },
      }),
    ).toEqual([]);
  });
});

describe("mapsUrl", () => {
  it("busca la dirección en el mapa, codificada", () => {
    expect(mapsUrl("San Martín 100, Córdoba")).toBe(
      "https://www.google.com/maps/search/?api=1&query=San%20Mart%C3%ADn%20100%2C%20C%C3%B3rdoba",
    );
  });

  it("sin dirección no hay enlace", () => {
    expect(mapsUrl("")).toBe("");
    expect(mapsUrl(undefined)).toBe("");
  });
});

describe("headerBackground — PUBLICO-10", () => {
  const cssUrl = (u) => `url("${u}")`;
  const colores = { primary: "#111111", secondary: "#222222" };

  it("sin imagen pinta el degradé con los colores del negocio", () => {
    const bg = headerBackground({ template: "moderno", colores }, cssUrl);
    expect(bg).toMatch(/^linear-gradient\(/);
    expect(bg).toContain("var(--color-primary");
    expect(bg).toContain("var(--color-secondary");
  });

  it("con imagen, la imagen va primero (arriba) y el degradé debajo", () => {
    const bg = headerBackground({ template: "moderno", colores, header: { imagen: "https://x.com/a.jpg" } }, cssUrl);
    expect(bg.startsWith('url("https://x.com/a.jpg"), linear-gradient(')).toBe(true);
  });

  it("la plantilla minimal queda blanca sin imagen", () => {
    expect(headerBackground({ template: "minimal", colores }, cssUrl)).toBe("");
  });

  it("minimal con imagen también la muestra", () => {
    expect(headerBackground({ template: "minimal", colores, header: { imagen: "https://x.com/a.jpg" } }, cssUrl)).toContain("https://x.com/a.jpg");
  });

  it("sin colores y sin imagen no pinta nada", () => {
    expect(headerBackground({ template: "moderno" }, cssUrl)).toBe("");
    expect(headerBackground({ template: "moderno", colores: {} }, cssUrl)).toBe("");
  });

  it("con un solo color alcanza (el otro usa el de respaldo)", () => {
    expect(headerBackground({ colores: { primary: "#111" } }, cssUrl)).toMatch(/^linear-gradient/);
  });
});

describe("isDemoMenu — PUBLICO-11", () => {
  it("solo las demos muestran la propuesta de venta y el botón Volver", () => {
    expect(isDemoMenu("demo")).toBe(true);
    expect(isDemoMenu("cliente")).toBe(false);
    expect(isDemoMenu(undefined)).toBe(false);
    expect(isDemoMenu(null)).toBe(false);
  });
});
