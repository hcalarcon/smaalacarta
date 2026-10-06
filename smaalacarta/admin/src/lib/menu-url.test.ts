import { describe, expect, it } from "vitest";

import { menuLinks, menuUrl, primaryMenuLink } from "./menu-url";

describe("menuUrl — ADMIN-RESUMEN-2", () => {
  it("el slug es el subdominio", () => {
    expect(menuUrl("santa-julia-resto")).toBe("https://santa-julia-resto.smaalacarta.com.ar");
  });
});

describe("menuLinks — RUTAS-4 y 5", () => {
  const plan = (planPdf: boolean, planWeb: boolean, planCompleto: boolean) => ({ planPdf, planWeb, planCompleto });

  it("con los tres planes, todo por subdominio", () => {
    expect(menuLinks("ana", plan(true, true, true))).toEqual({
      interactivo: "https://ana.smaalacarta.com.ar",
      estatico: "https://ana.smaalacarta.com.ar/menu.html",
      pdf: "https://ana.smaalacarta.com.ar/pdf",
    });
  });

  it("sin plan_completo, el interactivo no existe y el estático y el PDF van por path", () => {
    expect(menuLinks("ana", plan(true, true, false))).toEqual({
      interactivo: null,
      estatico: "https://smaalacarta.com.ar/ana/menu.html",
      pdf: "https://smaalacarta.com.ar/ana/pdf",
    });
  });

  it("plan_completo solo no habilita el estático ni el PDF: solo el interactivo", () => {
    expect(menuLinks("ana", plan(false, false, true))).toEqual({
      interactivo: "https://ana.smaalacarta.com.ar",
      estatico: null,
      pdf: null,
    });
  });

  it("cada servicio exige su plan; plan_completo solo decide subdominio o path", () => {
    expect(menuLinks("ana", plan(false, true, true))).toEqual({
      interactivo: "https://ana.smaalacarta.com.ar",
      estatico: "https://ana.smaalacarta.com.ar/menu.html",
      pdf: null,
    });
    expect(menuLinks("ana", plan(true, false, true))).toEqual({
      interactivo: "https://ana.smaalacarta.com.ar",
      estatico: null,
      pdf: "https://ana.smaalacarta.com.ar/pdf",
    });
    expect(menuLinks("ana", plan(true, false, false))).toEqual({
      interactivo: null,
      estatico: null,
      pdf: "https://smaalacarta.com.ar/ana/pdf",
    });
  });

  it("sin ningún plan, no hay direcciones", () => {
    expect(menuLinks("ana", plan(false, false, false))).toEqual({
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
