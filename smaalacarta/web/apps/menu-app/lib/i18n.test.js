import { describe, expect, it } from "vitest";

import { DICTIONARY, LANGS, resolveLang, t } from "./i18n.js";

describe("t — IDIOMA-3", () => {
  it("devuelve el texto en el idioma pedido", () => {
    expect(t("menu.ofertas", "es")).toBe("Ofertas");
    expect(t("menu.ofertas", "en")).toBe("Deals");
    expect(t("menu.ofertas", "pt")).toBe("Ofertas");
    expect(t("cart.total", "en")).toBe("Total");
  });

  it("sin idioma o con uno desconocido usa español", () => {
    expect(t("menu.destacados")).toBe("Destacados");
    expect(t("menu.destacados", "fr")).toBe("Destacados");
  });

  it("si la clave no existe devuelve la clave", () => {
    expect(t("no.existe", "en")).toBe("no.existe");
  });

  it("reemplaza las variables {nombre}", () => {
    expect(t("thanks.title", "en", { n: 7 })).toBe("Order #7 placed!");
  });

  it("los tres idiomas tienen las mismas claves y ningún texto vacío", () => {
    const es = Object.keys(DICTIONARY.es).sort();
    for (const lang of LANGS) {
      expect(Object.keys(DICTIONARY[lang]).sort()).toEqual(es);
      for (const value of Object.values(DICTIONARY[lang])) expect(value.trim()).not.toBe("");
    }
  });
});

describe("resolveLang — IDIOMA-2", () => {
  it("?lang= manda sobre el navegador", () => {
    expect(resolveLang({ search: "?lang=pt", navigatorLanguage: "en-US" })).toBe("pt");
    expect(resolveLang({ search: "?demo=moderno&lang=EN", navigatorLanguage: "es-AR" })).toBe("en");
  });

  it("sin ?lang= (o inválido) usa el idioma del navegador, ignorando la región", () => {
    expect(resolveLang({ search: "", navigatorLanguage: "pt-BR" })).toBe("pt");
    expect(resolveLang({ search: "?lang=fr", navigatorLanguage: "en-GB" })).toBe("en");
  });

  it("si no es ninguno de los tres, español", () => {
    expect(resolveLang({ search: "", navigatorLanguage: "fr-FR" })).toBe("es");
    expect(resolveLang({})).toBe("es");
  });
});
