import { describe, expect, it, vi } from "vitest";

import {
  brandTheme,
  fetchTracking,
  isFinalStatus,
  langSearch,
  pageTitle,
  parseTrackingCode,
  preorderNotice,
  safeColor,
  scheduledNotice,
  statusView,
  stepLabels,
  timeline,
} from "./tracker.js";

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

  it("pasa la nota de cada evento, si tiene (SEGUIMIENTO-12)", () => {
    const eventos = [
      { estado: "pending", fecha: "2026-09-29T15:00:00Z" },
      { estado: "cancelled", fecha: "2026-09-29T15:05:00Z", nota: "Sin stock" },
    ];
    expect(timeline(eventos).map((e) => e.note)).toEqual([null, "Sin stock"]);
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

describe("brandTheme — SEGUIMIENTO-11", () => {
  const negocio = { plantilla: "moderno", colores: { primary: "#112233", secondary: "#445566" } };

  it("usa los colores del negocio y un degradé en la cabecera", () => {
    const t = brandTheme(negocio);
    expect(t.brand).toBe("#112233");
    expect(t.accent).toBe("#445566");
    expect(t.header).toMatch(/^linear-gradient\(/);
    expect(t.plain).toBe(false);
  });

  it("con imagen, la imagen va sobre el degradé", () => {
    const t = brandTheme({ ...negocio, imagen: "https://cdn.example.com/a.jpg" });
    expect(t.header.startsWith('url("https://cdn.example.com/a.jpg"), linear-gradient(')).toBe(true);
  });

  it("minimal sin imagen es una cabecera blanca", () => {
    expect(brandTheme({ ...negocio, plantilla: "minimal" }).plain).toBe(true);
  });

  it("colores inválidos (o un intento de inyección) vuelven a los de la marca", () => {
    const t = brandTheme({ plantilla: "moderno", colores: { primary: "red; background:url(x)", secondary: "#12" } });
    expect(t.brand).toBe("#5a4a3a");
    expect(t.accent).toBe("#d97706");
  });

  it("una imagen que no es https no se usa", () => {
    const t = brandTheme({ ...negocio, imagen: "javascript:alert(1)" });
    expect(t.header).not.toContain("javascript");
  });

  it("un negocio sin datos de estilo (respuesta vieja) usa los de la marca", () => {
    const t = brandTheme({ nombre: "X" });
    expect(t.brand).toBe("#5a4a3a");
    expect(t.plain).toBe(false);
  });
});

describe("safeColor", () => {
  it("acepta #rrggbb y nada más", () => {
    expect(safeColor("#AbCdEf", "#000000")).toBe("#AbCdEf");
    expect(safeColor("#abc", "#000000")).toBe("#000000");
    expect(safeColor(null, "#000000")).toBe("#000000");
  });
});

describe("seguimiento en otros idiomas — IDIOMA-7", () => {
  it("statusView traduce título y texto", () => {
    expect(statusView("pending", "en")).toMatchObject({ title: "We received your order", step: 0 });
    expect(statusView("cancelled", "pt")).toMatchObject({ title: "Pedido cancelado", cancelled: true });
    expect(statusView("volando", "en").title).toBe("Order status");
  });

  it("timeline traduce las etiquetas pero no las notas del local", () => {
    const events = [{ estado: "confirmed", nota: "Sin stock" }];
    expect(timeline(events, "en")[0]).toMatchObject({ label: "Order confirmed", note: "Sin stock" });
  });

  it("los pasos del camino se traducen", () => {
    expect(stepLabels("en")).toEqual(["Received", "Confirmed", "Preparing", "Ready", "Delivered"]);
    expect(stepLabels()).toEqual(["Recibido", "Confirmado", "Preparando", "Listo", "Entregado"]);
  });
});

describe("idioma de la página — IDIOMA-13 y 14", () => {
  it("langSearch pone ?lang= sin perder el resto ni repetirlo", () => {
    expect(langSearch("", "en")).toBe("?lang=en");
    expect(langSearch("?code=abc", "pt")).toBe("?code=abc&lang=pt");
    expect(langSearch("?lang=es&code=abc", "en")).toBe("?lang=en&code=abc");
  });

  it("langSearch ignora un idioma que no es es, en o pt", () => {
    expect(langSearch("?lang=en", "fr")).toBe("?lang=en");
    expect(langSearch("", "fr")).toBe("");
  });

  it("pageTitle arma el título en el idioma pedido", () => {
    expect(pageTitle(12, "Café Ana", "es")).toBe("Pedido #12 · Café Ana");
    expect(pageTitle(12, "Café Ana", "en")).toBe("Order #12 · Café Ana");
  });
});

describe("scheduledNotice — SEGUIMIENTO-18", () => {
  it("dice para qué hora es el pedido, en hora de Argentina", () => {
    // 23:30 UTC = 20:30 en Argentina.
    expect(scheduledNotice("2026-01-05T23:30:00Z", "es")).toBe("Programado para las 20:30");
    expect(scheduledNotice("2026-01-05T23:30:00Z", "en")).toBe("Scheduled for 20:30");
    expect(scheduledNotice("2026-01-05T23:30:00Z", "pt")).toBe("Agendado para as 20:30");
  });

  it("usa 24 horas en todos los idiomas", () => {
    expect(scheduledNotice("2026-01-06T02:05:00Z", "en")).toBe("Scheduled for 23:05");
  });

  it("un pedido sin hora (o con una hora que no se entiende) no muestra nada", () => {
    expect(scheduledNotice(undefined, "es")).toBeNull();
    expect(scheduledNotice(null, "es")).toBeNull();
    expect(scheduledNotice("no es una fecha", "es")).toBeNull();
    expect(scheduledNotice(12345, "es")).toBeNull();
  });
});

describe("preorderNotice — PUBLICO-38", () => {
  it("dice el día del pedido anticipado, en hora de Argentina y en cada idioma", () => {
    // 15:00 UTC = 12:00 en Argentina: sábado 10 de octubre de 2026.
    expect(preorderNotice("2026-10-10T15:00:00Z", "es")).toMatch(/^Tu pedido es para el sábado.*10 de octubre/);
    expect(preorderNotice("2026-10-10T15:00:00Z", "en")).toMatch(/^Your order is for Saturday.*October 10|10 October/);
    expect(preorderNotice("2026-10-10T15:00:00Z", "pt")).toMatch(/^Seu pedido é para sábado.*10 de outubro/);
  });

  it("usa el día de Argentina, no el de UTC", () => {
    // 01:00 UTC del domingo = 22:00 del sábado en Argentina.
    expect(preorderNotice("2026-10-11T01:00:00Z", "es")).toMatch(/sábado/);
  });

  it("sin fecha válida no hay aviso", () => {
    for (const value of [null, undefined, "", "no es una fecha", 5]) expect(preorderNotice(value, "es")).toBeNull();
  });
});
