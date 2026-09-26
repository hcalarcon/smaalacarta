import { describe, expect, it, vi } from "vitest";

import { fetchTracking, isFinalStatus, parseTrackingCode, statusView, timeline } from "./tracker.js";

const CODE = "0123456789abcdef0123";

describe("parseTrackingCode — SEGUIMIENTO-8", () => {
  it.each([
    [`/pedido/${CODE}`, ""],
    [`/pedido/${CODE}/`, ""],
    [`/pedido/${CODE.toUpperCase()}`, ""],
    ["/apps/tracker/index.html", `?code=${CODE}`],
    ["/", `?code=${CODE}`],
  ])("%s %s → el código", (pathname, search) => {
    expect(parseTrackingCode(pathname, search)).toBe(CODE);
  });

  it.each([
    ["/pedido/", ""],
    ["/pedido/abc", ""],
    [`/pedido/${"0".repeat(19)}`, ""],
    [`/pedido/${"0".repeat(21)}`, ""],
    ["/pedido/zzzzzzzzzzzzzzzzzzzz", ""],
    ["/pedido/'; drop table", ""],
    ["/otra-cosa", ""],
    ["/", "?code=corto"],
    ["/", ""],
  ])("%s %s → nada", (pathname, search) => {
    expect(parseTrackingCode(pathname, search)).toBeNull();
  });
});

describe("statusView — SEGUIMIENTO-8", () => {
  it.each([
    ["pending", "Recibimos tu pedido", 0],
    ["confirmed", "Pedido confirmado", 1],
    ["preparing", "Estamos preparando tu pedido", 2],
    ["ready", "¡Tu pedido está listo!", 3],
    ["delivered", "Pedido entregado", 4],
  ])("%s → %s (paso %i)", (status, title, step) => {
    expect(statusView(status)).toMatchObject({ title, step, cancelled: false });
  });

  it("cancelado", () => {
    expect(statusView("cancelled")).toMatchObject({ title: "Pedido cancelado", cancelled: true });
  });

  it("un estado desconocido no rompe: se muestra genérico", () => {
    expect(statusView("volando")).toMatchObject({ title: "Estado del pedido", step: -1, cancelled: false });
  });
});

describe("isFinalStatus", () => {
  it.each([
    ["delivered", true],
    ["cancelled", true],
    ["pending", false],
    ["ready", false],
    [undefined, false],
  ])("%s → %s", (status, esperado) => {
    expect(isFinalStatus(status)).toBe(esperado);
  });
});

describe("timeline", () => {
  it("da la etiqueta de cada evento y respeta el orden", () => {
    const eventos = [
      { estado: "pending", fecha: "2026-09-29T15:00:00Z" },
      { estado: "confirmed", fecha: "2026-09-29T15:05:00Z" },
    ];
    expect(timeline(eventos).map((e) => e.label)).toEqual(["Pedido recibido", "Pedido confirmado"]);
  });

  it("tolera datos que no son una lista", () => {
    expect(timeline(undefined)).toEqual([]);
    expect(timeline(null)).toEqual([]);
    expect(timeline("x")).toEqual([]);
  });

  it("descarta eventos sin estado", () => {
    expect(timeline([{ fecha: "2026-09-29T15:00:00Z" }, null])).toEqual([]);
  });
});

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({ ok, status, json: async () => body }));
}

const cfg = { url: "https://x.supabase.co", key: "sb_publishable_abc" };
const pedido = {
  negocio: { nombre: "Ana Resto", telefono: "5493510000001", slug: "ana" },
  pedido: { numero: "7", estado: "confirmed", total: 2000, creado: "2026-09-29T15:00:00Z" },
  items: [{ nombre: "Café", cantidad: 2, precio: 1000 }],
  eventos: [{ estado: "pending", fecha: "2026-09-29T15:00:00Z" }],
};

describe("fetchTracking — SEGUIMIENTO-8", () => {
  it("pide el pedido a public_order_tracking con el código", async () => {
    const fetchImpl = fakeFetch(pedido);

    const r = await fetchTracking({ ...cfg, code: CODE, fetchImpl });

    expect(r).toEqual({ ok: true, data: pedido });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/public_order_tracking");
    expect(JSON.parse(init.body)).toEqual({ p_code: CODE });
    expect(init.headers.apikey).toBe("sb_publishable_abc");
  });

  it("solo manda Authorization con claves JWT", async () => {
    const fetchImpl = fakeFetch(pedido);
    await fetchTracking({ ...cfg, key: "eyJhbGciOi.p.f", code: CODE, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJhbGciOi.p.f");
  });

  it("un código que no existe (la base responde null) es 'notfound'", async () => {
    expect(await fetchTracking({ ...cfg, code: CODE, fetchImpl: fakeFetch(null) })).toEqual({ ok: false, reason: "notfound" });
  });

  it("un error del servidor o de la red es 'error' (se reintenta), sin lanzar", async () => {
    expect(await fetchTracking({ ...cfg, code: CODE, fetchImpl: fakeFetch({}, { ok: false, status: 500 }) })).toEqual({ ok: false, reason: "error" });

    const caido = vi.fn(async () => {
      throw new Error("sin conexión");
    });
    expect(await fetchTracking({ ...cfg, code: CODE, fetchImpl: caido })).toEqual({ ok: false, reason: "error" });
  });

  it("una respuesta con forma inesperada no se toma como pedido", async () => {
    expect(await fetchTracking({ ...cfg, code: CODE, fetchImpl: fakeFetch({ algo: 1 }) })).toEqual({ ok: false, reason: "error" });
  });

  it("sin configuración o con un código inválido no hace ninguna llamada", async () => {
    const fetchImpl = fakeFetch(pedido);
    expect((await fetchTracking({ url: "", key: "", code: CODE, fetchImpl })).ok).toBe(false);
    expect((await fetchTracking({ ...cfg, code: "corto", fetchImpl })).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
