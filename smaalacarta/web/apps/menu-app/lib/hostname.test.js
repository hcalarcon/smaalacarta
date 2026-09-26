import { describe, expect, it } from "vitest";

import { DEMO_SLUGS, RESERVED_SUBDOMAINS, resolveBusinessFromHost } from "./hostname.js";

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
