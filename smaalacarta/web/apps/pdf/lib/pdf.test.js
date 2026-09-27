import { describe, expect, it, vi } from "vitest";

import { fetchBusinessPdf, resolvePdf, resolvePdfTarget } from "./pdf.js";

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({ ok, status, json: async () => body }));
}

describe("resolvePdfTarget — PDF-1", () => {
  it("prioriza ?demo= sobre todo lo demás", () => {
    expect(
      resolvePdfTarget({ hostname: "smaalacarta.com.ar", pathname: "/ana/pdf", search: "?demo=moderno&cliente=ana" }),
    ).toEqual({ type: "demo", slug: "moderno" });
  });

  it("usa ?cliente= si no hay ?demo=", () => {
    expect(resolvePdfTarget({ pathname: "/", search: "?cliente=ana" })).toEqual({
      type: "cliente",
      slug: "ana",
    });
  });

  it("un subdominio demo.* sin query es la demo fija, sin slug", () => {
    expect(resolvePdfTarget({ hostname: "demo.smaalacarta.com.ar", pathname: "/pdf" })).toEqual({
      type: "demo",
      slug: null,
    });
  });

  it("toma el negocio del primer segmento del path (la ruta real /:cliente/pdf)", () => {
    expect(resolvePdfTarget({ hostname: "smaalacarta.com.ar", pathname: "/santa-julia-resto/pdf" })).toEqual({
      type: "cliente",
      slug: "santa-julia-resto",
    });
  });

  it("sin negocio en ningún lado, no hay nada que resolver", () => {
    expect(resolvePdfTarget({ hostname: "smaalacarta.com.ar", pathname: "/" })).toBeNull();
    expect(resolvePdfTarget()).toBeNull();
  });
});

describe("fetchBusinessPdf — PDF-1", () => {
  const base = { url: "https://x.supabase.co", key: "sb_publishable_x", slug: "ana" };

  it("pide public_business_pdf y devuelve el resultado", async () => {
    const fetchImpl = fakeFetch({ nombre: "Ana Resto", pdf: "https://cdn.example.com/menu.pdf" });
    const r = await fetchBusinessPdf({ ...base, fetchImpl });

    expect(r).toEqual({ nombre: "Ana Resto", pdf: "https://cdn.example.com/menu.pdf" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://x.supabase.co/rest/v1/rpc/public_business_pdf",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("manda Authorization solo con una clave JWT", async () => {
    const fetchImpl = fakeFetch({ nombre: "Ana", pdf: "https://x/menu.pdf" });
    await fetchBusinessPdf({ ...base, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();

    const jwt = fakeFetch({ nombre: "Ana", pdf: "https://x/menu.pdf" });
    await fetchBusinessPdf({ ...base, key: "eyJhbGciOi.payload.firma", fetchImpl: jwt });
    expect(jwt.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJhbGciOi.payload.firma");
  });

  it("null si el negocio no cargó un PDF", async () => {
    expect(await fetchBusinessPdf({ ...base, fetchImpl: fakeFetch(null) })).toBeNull();
    expect(await fetchBusinessPdf({ ...base, fetchImpl: fakeFetch({ nombre: "Ana", pdf: "" }) })).toBeNull();
  });

  it("null si Supabase responde mal o falla la red", async () => {
    expect(
      await fetchBusinessPdf({ ...base, fetchImpl: fakeFetch(null, { ok: false, status: 500 }) }),
    ).toBeNull();
    expect(
      await fetchBusinessPdf({
        ...base,
        fetchImpl: vi.fn(async () => {
          throw new Error("red caída");
        }),
      }),
    ).toBeNull();
  });

  it("null sin dirección, clave o slug", async () => {
    const fetchImpl = fakeFetch({ nombre: "Ana", pdf: "https://x/menu.pdf" });
    expect(await fetchBusinessPdf({ url: "", key: "", slug: "ana", fetchImpl })).toBeNull();
    expect(await fetchBusinessPdf({ ...base, slug: "", fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("resolvePdf — PDF-1 y PDF-2", () => {
  it("sin negocio, no hay nada que mostrar", async () => {
    const result = await resolvePdf(null, { fetchRemote: vi.fn(), fetchJSON: vi.fn() });
    expect(result).toBeNull();
  });

  it("la demo siempre muestra el mismo PDF fijo, sin pedir nada", async () => {
    const fetchRemote = vi.fn();
    const fetchJSON = vi.fn();
    const result = await resolvePdf({ type: "demo", slug: null }, { fetchRemote, fetchJSON });

    expect(result).toEqual({ url: "/data/demos/demomenu.pdf", title: "Menú demo" });
    expect(fetchRemote).not.toHaveBeenCalled();
    expect(fetchJSON).not.toHaveBeenCalled();
  });

  it("un negocio con PDF en Supabase no consulta el JSON local", async () => {
    const fetchRemote = vi.fn(async () => ({ nombre: "Ana Resto", pdf: "https://cdn.example.com/menu.pdf" }));
    const fetchJSON = vi.fn();
    const result = await resolvePdf({ type: "cliente", slug: "ana" }, { fetchRemote, fetchJSON });

    expect(result).toEqual({ url: "https://cdn.example.com/menu.pdf", title: "Menú - Ana Resto" });
    expect(fetchJSON).not.toHaveBeenCalled();
  });

  it("sin nada en Supabase, cae al JSON local (el cliente estático de siempre)", async () => {
    const fetchRemote = vi.fn(async () => null);
    const fetchJSON = vi.fn(async () => ({ nombre: "Santa Julia Resto", pdf: { file: "assets/menu.pdf" } }));
    const result = await resolvePdf({ type: "cliente", slug: "santa-julia-resto" }, { fetchRemote, fetchJSON });

    expect(result).toEqual({
      url: "/data/clientes/santa-julia-resto/assets/menu.pdf",
      title: "Menú - Santa Julia Resto",
    });
  });

  it("sin Supabase ni JSON con PDF, no hay nada que mostrar", async () => {
    const result = await resolvePdf(
      { type: "cliente", slug: "nadie" },
      { fetchRemote: vi.fn(async () => null), fetchJSON: vi.fn(async () => null) },
    );
    expect(result).toBeNull();
  });
});
