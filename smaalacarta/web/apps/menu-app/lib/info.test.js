import { describe, expect, it } from "vitest";

import {
  closedNotice,
  headerBackground,
  DEFAULT_LOGO,
  headerPosition,
  productImage,
  isDemoMenu,
  mapsUrl,
  reopenText,
  socialIconPath,
  socialLinks,
} from "./info.js";

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

describe("socialIconPath", () => {
  it.each(["instagram", "facebook"])("tiene un trazo para %s", (key) => {
    expect(socialIconPath(key)).toMatch(/^M/);
  });

  it("una red desconocida no tiene trazo", () => {
    expect(socialIconPath("x")).toBe("");
    expect(socialIconPath(undefined)).toBe("");
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

describe("reopenText en otros idiomas — IDIOMA-1", () => {
  it("traduce el aviso", () => {
    expect(reopenText("2030-01-15", "en")).toBe("We reopen on 15/01");
    expect(reopenText("2030-01-15", "pt")).toBe("Reabrimos em 15/01");
    expect(reopenText("basura", "en")).toBe("");
  });
});

describe("headerPosition — PUBLICO-50", () => {
  const withPos = (x, y) => ({ header: { imagen: "https://x.com/a.jpg", posicion: { x, y } } });

  it('devuelve "x% y%" con enteros de 0 a 100', () => {
    expect(headerPosition(withPos(20, 80))).toBe("20% 80%");
    expect(headerPosition(withPos(0, 100))).toBe("0% 100%");
  });

  it("sin posición no hay nada que pintar (queda centrada)", () => {
    expect(headerPosition({})).toBe("");
    expect(headerPosition({ header: { imagen: "https://x.com/a.jpg" } })).toBe("");
    expect(headerPosition(null)).toBe("");
  });

  it("nunca deja pasar texto, decimales ni valores fuera de rango", () => {
    expect(headerPosition(withPos("20; background:url(x)", 50))).toBe("");
    expect(headerPosition(withPos("20", 50))).toBe("");
    expect(headerPosition(withPos(20.5, 50))).toBe("");
    expect(headerPosition(withPos(-1, 50))).toBe("");
    expect(headerPosition(withPos(50, 101))).toBe("");
    expect(headerPosition(withPos(Number.NaN, 50))).toBe("");
  });
});

describe("productImage — PUBLICO-54", () => {
  const config = { logo: "https://cdn.example.com/logo.png" };

  it("la imagen del producto es una foto", () => {
    expect(productImage({ imagen: "https://cdn.example.com/a.jpg" }, config)).toEqual({
      kind: "photo",
      src: "https://cdn.example.com/a.jpg",
    });
  });

  it("una imagen marcada como ilustrativa es una ilustración", () => {
    expect(
      productImage({ imagen: "https://www.smaalacarta.com.ar/assets/defaults/pizza.svg", imagenIlustrativa: true }, config),
    ).toEqual({ kind: "illustration", src: "https://www.smaalacarta.com.ar/assets/defaults/pizza.svg" });
  });

  it("sin imagen, el logo del negocio", () => {
    expect(productImage({ nombre: "Plato" }, config)).toEqual({ kind: "logo", src: config.logo });
    expect(productImage({ imagen: "" }, config)).toEqual({ kind: "logo", src: config.logo });
  });

  it("sin imagen ni logo, el de SMA a la Carta", () => {
    expect(productImage({}, {})).toEqual({ kind: "logo", src: DEFAULT_LOGO });
    expect(productImage({}, undefined)).toEqual({ kind: "logo", src: DEFAULT_LOGO });
    expect(DEFAULT_LOGO).toMatch(/^https:\/\//);
  });

  it("una dirección que no es http(s) se descarta", () => {
    expect(productImage({ imagen: "javascript:alert(1)" }, { logo: "data:image/png;base64,AAAA" })).toEqual({
      kind: "logo",
      src: DEFAULT_LOGO,
    });
  });

  it("una foto propia nunca se marca como ilustración aunque llegue la bandera sin imagen", () => {
    expect(productImage({ imagenIlustrativa: true }, config).kind).toBe("logo");
  });

  it("las promociones de la sección Ofertas no llevan imagen", () => {
    expect(productImage({ esPromo: true, nombre: "Combo" }, config)).toBeNull();
  });
});
