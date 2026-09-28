import { describe, expect, it } from "vitest";

import { menuLinks, menuUrl, primaryMenuLink } from "./menu-url";

describe("menuUrl — ADMIN-RESUMEN-2", () => {
  it("el slug es el subdominio", () => {
    expect(menuUrl("santa-julia-resto")).toBe("https://santa-julia-resto.smaalacarta.com.ar");
  });
});

describe("menuLinks — RUTAS-4", () => {
  it("con plan_completo, todo por subdominio (lo que tenga)", () => {
    expect(menuLinks("ana", { planPdf: true, planWeb: true, planCompleto: true })).toEqual({
      interactivo: "https://ana.smaalacarta.com.ar",
      estatico: "https://ana.smaalacarta.com.ar/menu.html",
      pdf: "https://ana.smaalacarta.com.ar/pdf",
    });
  });

  it("sin plan_completo, el interactivo no existe y el resto va por path", () => {
    expect(menuLinks("ana", { planPdf: true, planWeb: true, planCompleto: false })).toEqual({
      interactivo: null,
      estatico: "https://smaalacarta.com.ar/ana/menu.html",
      pdf: "https://smaalacarta.com.ar/ana/pdf",
    });
  });

  it("sin el plan de un servicio, esa dirección es null", () => {
    expect(menuLinks("ana", { planPdf: false, planWeb: false, planCompleto: false })).toEqual({
      interactivo: null,
      estatico: null,
      pdf: null,
    });
  });
});

describe("primaryMenuLink", () => {
  it("prioriza el interactivo, después el estático, después el PDF", () => {
    expect(
      primaryMenuLink({ interactivo: "a", estatico: "b", pdf: "c" }),
    ).toBe("a");
    expect(primaryMenuLink({ interactivo: null, estatico: "b", pdf: "c" })).toBe("b");
    expect(primaryMenuLink({ interactivo: null, estatico: null, pdf: "c" })).toBe("c");
    expect(primaryMenuLink({ interactivo: null, estatico: null, pdf: null })).toBeNull();
  });
});
