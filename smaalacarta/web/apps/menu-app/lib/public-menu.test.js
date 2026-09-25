import { describe, expect, it, vi } from "vitest";

import {
  fetchPublicMenu,
  isSupabaseConfigured,
  normalizePublicMenu,
} from "./public-menu.js";

const respuesta = {
  config: { nombre: "Ana Resto", template: "moderno", tipo: "cliente" },
  menu: {
    categorias: [
      { nombre: "Bebidas", items: [{ nombre: "Café", precio: 1000 }] },
    ],
  },
};

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
}

describe("isSupabaseConfigured — PUBLICO-6", () => {
  it("necesita dirección y clave", () => {
    expect(isSupabaseConfigured({ url: "https://x.supabase.co", key: "k" })).toBe(true);
  });

  it.each([
    [undefined],
    [null],
    [{}],
    [{ url: "", key: "k" }],
    [{ url: "https://x.supabase.co", key: "" }],
    [{ url: "  ", key: "  " }],
  ])("no está configurado con %j", (cfg) => {
    expect(isSupabaseConfigured(cfg)).toBe(false);
  });
});

describe("normalizePublicMenu — PUBLICO-7", () => {
  it("una respuesta vacía no es un menú", () => {
    expect(normalizePublicMenu(null)).toBeNull();
    expect(normalizePublicMenu(undefined)).toBeNull();
    expect(normalizePublicMenu("texto")).toBeNull();
    expect(normalizePublicMenu({})).toBeNull();
  });

  it("deja pasar un menú completo tal cual", () => {
    expect(normalizePublicMenu(respuesta)).toEqual(respuesta);
  });

  it("completa un menú sin categorías con una lista vacía", () => {
    const r = normalizePublicMenu({ config: { nombre: "X" } });
    expect(r.menu.categorias).toEqual([]);
  });

  it("completa una categoría sin ítems", () => {
    const r = normalizePublicMenu({
      config: { nombre: "X" },
      menu: { categorias: [{ nombre: "Vacía" }] },
    });
    expect(r.menu.categorias[0].items).toEqual([]);
  });

  it("convierte precios que llegan como texto y descarta los inválidos", () => {
    const r = normalizePublicMenu({
      config: { nombre: "X" },
      menu: {
        categorias: [
          {
            nombre: "C",
            items: [
              { nombre: "A", precio: "1500.50" },
              { nombre: "B", precio: "gratis" },
              null,
              { precio: 10 },
            ],
          },
        ],
      },
    });
    expect(r.menu.categorias[0].items).toEqual([{ nombre: "A", precio: 1500.5 }]);
  });

  it("conserva los campos de ofertas (precio anterior y etiqueta)", () => {
    const oferta = { nombre: "Combo", precio: 1500, precioAnterior: 2000, promo: "Combo" };
    const r = normalizePublicMenu({
      config: { nombre: "X" },
      menu: { categorias: [{ nombre: "Ofertas", tipo: "ofertas", items: [oferta] }] },
    });
    expect(r.menu.categorias[0].items[0]).toEqual(oferta);
    expect(r.menu.categorias[0].tipo).toBe("ofertas");
  });

  it("descarta categorías sin nombre", () => {
    const r = normalizePublicMenu({
      config: { nombre: "X" },
      menu: { categorias: [{ items: [] }, { nombre: "Ok", items: [] }] },
    });
    expect(r.menu.categorias.map((c) => c.nombre)).toEqual(["Ok"]);
  });
});

describe("fetchPublicMenu — PUBLICO-6", () => {
  const base = { url: "https://x.supabase.co", key: "sb_publishable_abc", slug: "ana" };

  it("pide el menú a la función public_menu con el slug", async () => {
    const fetchImpl = fakeFetch(respuesta);

    const r = await fetchPublicMenu({ ...base, fetchImpl });

    expect(r).toEqual(respuesta);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/public_menu");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ p_slug: "ana" });
    expect(init.headers.apikey).toBe("sb_publishable_abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("acepta una dirección con barra final", async () => {
    const fetchImpl = fakeFetch(respuesta);
    await fetchPublicMenu({ ...base, url: "https://x.supabase.co/", fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://x.supabase.co/rest/v1/rpc/public_menu");
  });

  it("solo manda Authorization con las claves en formato JWT", async () => {
    const nueva = fakeFetch(respuesta);
    await fetchPublicMenu({ ...base, fetchImpl: nueva });
    expect(nueva.mock.calls[0][1].headers).not.toHaveProperty("Authorization");

    const jwt = fakeFetch(respuesta);
    await fetchPublicMenu({ ...base, key: "eyJhbGciOi.payload.firma", fetchImpl: jwt });
    expect(jwt.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJhbGciOi.payload.firma");
  });

  it("devuelve null si el negocio no está publicado (la función responde null)", async () => {
    expect(await fetchPublicMenu({ ...base, fetchImpl: fakeFetch(null) })).toBeNull();
  });

  it("devuelve null si el servidor responde con error", async () => {
    const fetchImpl = fakeFetch({ message: "boom" }, { ok: false, status: 500 });
    expect(await fetchPublicMenu({ ...base, fetchImpl })).toBeNull();
  });

  it("devuelve null si la red falla", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("sin conexión");
    });
    expect(await fetchPublicMenu({ ...base, fetchImpl })).toBeNull();
  });

  it("devuelve null si la respuesta no es JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("no es json");
      },
    }));
    expect(await fetchPublicMenu({ ...base, fetchImpl })).toBeNull();
  });

  it("sin configuración o sin slug no hace ninguna llamada", async () => {
    const fetchImpl = fakeFetch(respuesta);

    expect(await fetchPublicMenu({ url: "", key: "", slug: "ana", fetchImpl })).toBeNull();
    expect(await fetchPublicMenu({ ...base, slug: "", fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
