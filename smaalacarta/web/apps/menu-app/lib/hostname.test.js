import { describe, expect, it } from "vitest";

import {
  DEMO_SLUGS,
  RESERVED_SUBDOMAINS,
  resolveBusinessFromHost,
  resolveDemoFromPath,
  resolveSlugFromPath,
  resolveTarget,
} from "./hostname.js";

describe("resolveBusinessFromHost — RUTAS-1", () => {
  it.each([
    ["santa-julia-resto.smaalacarta.com.ar", "santa-julia-resto"],
    ["panaderia.smaalacarta.com.ar", "panaderia"],
    ["bar24.smaalacarta.online", "bar24"],
    ["PANADERIA.SmaAlaCarta.com.ar", "panaderia"],
    ["panaderia.smaalacarta.com.ar:3000", "panaderia"],
    ["panaderia.smaalacarta.com.ar.", "panaderia"],
  ])("%s abre el negocio %s", (host, slug) => {
    expect(resolveBusinessFromHost(host)).toEqual({ type: "cliente", slug });
  });

  it("un negocio nuevo no necesita declararse en el código", () => {
    expect(resolveBusinessFromHost("negocio-recien-creado.smaalacarta.com.ar")).toEqual({
      type: "cliente",
      slug: "negocio-recien-creado",
    });
  });
});

describe("demos y reservados — RUTAS-2", () => {
  it.each(DEMO_SLUGS)("%s abre su demo", (slug) => {
    expect(resolveBusinessFromHost(`${slug}.smaalacarta.com.ar`)).toEqual({ type: "demo", slug });
  });

  it.each(RESERVED_SUBDOMAINS)("%s no es un negocio", (name) => {
    expect(resolveBusinessFromHost(`${name}.smaalacarta.com.ar`)).toBeNull();
  });

  it("la lista coincide con la de la base de datos y el admin", () => {
    expect([...RESERVED_SUBDOMAINS, ...DEMO_SLUGS].sort()).toEqual(
      [
        "www", "app", "admin", "api", "demo", "demos", "moderno", "clasico", "minimal",
        "mail", "static", "assets", "cdn", "dev", "staging", "panel", "login", "landing",
  "explorar",
      ].sort(),
    );
  });
});

describe("hosts que no son negocios — RUTAS-1", () => {
  it.each([
    "smaalacarta.com.ar",
    "smaalacarta.online",
    "localhost",
    "127.0.0.1",
    "",
    "a.b.smaalacarta.com.ar",
    "smaalacarta-com-ar.vercel.app",
    "panaderia.otrodominio.com",
    "panaderia.smaalacarta.com.ar.evil.com",
    "evilsmaalacarta.com.ar",
  ])("%j devuelve null", (host) => {
    expect(resolveBusinessFromHost(host)).toBeNull();
  });

  it.each(["-x.smaalacarta.com.ar", "x-.smaalacarta.com.ar", "x_y.smaalacarta.com.ar", "x y.smaalacarta.com.ar"])(
    "%j no es un slug válido",
    (host) => {
      expect(resolveBusinessFromHost(host)).toBeNull();
    },
  );

  it("acepta dominios base distintos", () => {
    expect(resolveBusinessFromHost("bar.midominio.com", ["midominio.com"])).toEqual({
      type: "cliente",
      slug: "bar",
    });
  });
});

describe("resolveDemoFromPath — RUTAS-2", () => {
  it.each(DEMO_SLUGS)("/%s abre su demo, con o sin barra final", (slug) => {
    expect(resolveDemoFromPath(`/${slug}`)).toEqual({ type: "demo", slug });
    expect(resolveDemoFromPath(`/${slug}/`)).toEqual({ type: "demo", slug });
  });

  it("solo mira el primer segmento del path", () => {
    expect(resolveDemoFromPath("/moderno/algo-mas")).toEqual({ type: "demo", slug: "moderno" });
    expect(resolveDemoFromPath("/otro/moderno")).toBeNull();
  });

  it.each(["/", "", undefined, null, "/santa-julia-resto", "/api/manifest", "/MODERNO"])(
    "%j no es una demo",
    (pathname) => {
      expect(resolveDemoFromPath(pathname)).toBeNull();
    },
  );

  it("acepta otra lista de demos", () => {
    expect(resolveDemoFromPath("/otra", ["otra"])).toEqual({ type: "demo", slug: "otra" });
  });
});

describe("resolveSlugFromPath — RUTAS-4", () => {
  it("lee el primer segmento de un negocio real", () => {
    expect(resolveSlugFromPath("/santa-julia-resto/pdf")).toBe("santa-julia-resto");
    expect(resolveSlugFromPath("/santa-julia-resto/menu.html")).toBe("santa-julia-resto");
  });

  it.each(["", "/", undefined, null])("%j no tiene slug", (pathname) => {
    expect(resolveSlugFromPath(pathname)).toBeNull();
  });

  it.each(DEMO_SLUGS)("una demo (%s) no cuenta como negocio", (slug) => {
    expect(resolveSlugFromPath(`/${slug}/pdf`)).toBeNull();
  });

  it.each(RESERVED_SUBDOMAINS)("un nombre reservado (%s) no cuenta como negocio", (name) => {
    expect(resolveSlugFromPath(`/${name}/pdf`)).toBeNull();
  });

  it("rechaza un segmento con formato inválido", () => {
    expect(resolveSlugFromPath("/Slug Malo/pdf")).toBeNull();
  });
});

describe("resolveTarget — RUTAS-4", () => {
  it("prioriza ?demo= y ?cliente= (para probar en local), sin marcar viaPath", () => {
    expect(resolveTarget({ search: "?demo=moderno" })).toEqual({
      type: "demo",
      slug: "moderno",
      viaPath: false,
    });
    expect(resolveTarget({ search: "?cliente=ana" })).toEqual({
      type: "cliente",
      slug: "ana",
      viaPath: false,
    });
  });

  it("usa ?ruta= (el rewrite de landing/) y lo marca viaPath", () => {
    expect(resolveTarget({ search: "?ruta=santa-julia-resto" })).toEqual({
      type: "cliente",
      slug: "santa-julia-resto",
      viaPath: true,
    });
  });

  it("sin query, resuelve por el subdominio, sin viaPath", () => {
    expect(resolveTarget({ hostname: "ana.smaalacarta.com.ar" })).toEqual({
      type: "cliente",
      slug: "ana",
      viaPath: false,
    });
  });

  it("sin nada, no hay nada que resolver", () => {
    expect(resolveTarget({ hostname: "smaalacarta.com.ar" })).toBeNull();
    expect(resolveTarget()).toBeNull();
  });
});
