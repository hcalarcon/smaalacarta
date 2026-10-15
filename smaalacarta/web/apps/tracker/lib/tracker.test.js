import { describe, expect, it, vi } from "vitest";

import {
  brandTheme,
  chooseCourier,
  deliveryCard,
  fetchDelivery,
  fetchTracking,
  isFinalStatus,
  itemRow,
  langSearch,
  pageTitle,
  parseTrackingCode,
  preorderNotice,
  safeColor,
  scheduledNotice,
  statusView,
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
    ["pending", "Recibimos tu pedido"],
    ["confirmed", "Pedido confirmado"],
    ["preparing", "Estamos preparando tu pedido"],
    ["ready", "¡Tu pedido está listo!"],
    ["delivered", "Pedido entregado"],
  ])("%s → %s", (status, title) => {
    expect(statusView(status)).toMatchObject({ title, cancelled: false });
  });

  it("cancelado", () => {
    expect(statusView("cancelled")).toMatchObject({ title: "Pedido cancelado", cancelled: true });
  });

  it("un estado desconocido no rompe: se muestra genérico", () => {
    expect(statusView("volando")).toMatchObject({ title: "Estado del pedido", cancelled: false });
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

  it("lleva la posición de la imagen solo si son enteros de 0 a 100 (SEGUIMIENTO-24)", () => {
    const img = "https://cdn.example.com/a.jpg";
    expect(brandTheme({ ...negocio, imagen: img, posicion: { x: 10, y: 90 } }).position).toBe("10% 90%");
    expect(brandTheme({ ...negocio, imagen: img, posicion: { x: "10;", y: 90 } }).position).toBe("");
    expect(brandTheme({ ...negocio, imagen: img }).position).toBe("");
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
    expect(statusView("pending", "en")).toMatchObject({ title: "We received your order" });
    expect(statusView("cancelled", "pt")).toMatchObject({ title: "Pedido cancelado", cancelled: true });
    expect(statusView("volando", "en").title).toBe("Order status");
  });

  it("timeline traduce las etiquetas pero no las notas del local", () => {
    const events = [{ estado: "confirmed", nota: "Sin stock" }];
    expect(timeline(events, "en")[0]).toMatchObject({ label: "Order confirmed", note: "Sin stock" });
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

describe("itemRow — SEGUIMIENTO-23", () => {
  const money = { format: (n) => `$${n}` };

  it("muestra la cantidad, el nombre y el total de la línea, sin opciones si no hay", () => {
    const li = itemRow(document, { nombre: "Café", cantidad: 2, precio: 1000 }, money);

    expect(li.tagName).toBe("LI");
    expect(li.textContent).toBe("2 × Café$2000");
    expect(li.querySelector(".item-opciones")).toBeNull();
  });

  it("lista las opciones bajo el ítem, con ×N si se repite, y el total incluye los extras", () => {
    const li = itemRow(
      document,
      {
        nombre: "Helado",
        cantidad: 2,
        precio: 3300,
        opciones: [
          { grupo: "Sabores", nombre: "Frutilla", cantidad: 2, precio: 0 },
          { grupo: "Toppings", nombre: "Chocolate", cantidad: 1, precio: 300 },
        ],
      },
      money,
    );

    const lines = [...li.querySelectorAll(".item-opciones li")].map((n) => n.textContent);
    expect(lines).toEqual(["+ Frutilla ×2", "+ Chocolate"]);
    expect(li.textContent).toContain("$6600");
  });

  it("todo se escribe como texto: un nombre con HTML no crea elementos", () => {
    const li = itemRow(
      document,
      {
        nombre: "<img src=x onerror=alert(1)>",
        cantidad: 1,
        precio: 1,
        opciones: [{ grupo: "<b>g</b>", nombre: "<script>alert(1)</script>", cantidad: 1, precio: 0 }],
      },
      money,
    );

    expect(li.querySelector("img, script, b")).toBeNull();
    expect(li.querySelector(".item-opciones li").textContent).toBe("+ <script>alert(1)</script>");
  });

  it("ignora opciones mal formadas sin romper la página", () => {
    const li = itemRow(
      document,
      { nombre: "X", cantidad: 1, precio: 1, opciones: [null, { nombre: "" }, "texto", { nombre: "Ok", cantidad: 1 }] },
      money,
    );

    expect([...li.querySelectorAll(".item-opciones li")].map((n) => n.textContent)).toEqual(["+ Ok"]);
    expect(itemRow(document, { nombre: "Y", cantidad: 1, precio: 1, opciones: "no es lista" }, money)
      .querySelector(".item-opciones")).toBeNull();
  });
});

// Envío con Repartos al Toque — ENVIO-28 y 29.
describe("estados del envío — ENVIO-28", () => {
  it.each([
    ["handed_to_courier", "es", "Tu pedido salió del local"],
    ["on_the_way", "es", "Tu pedido está en camino"],
    ["on_the_way", "en", "Your order is on its way"],
    ["handed_to_courier", "pt", "Seu pedido saiu do local"],
  ])("%s en %s → %s", (status, lang, title) => {
    expect(statusView(status, lang)).toMatchObject({ title, cancelled: false, final: false });
  });

  it("Listo con envío no dice que pase a buscarlo", () => {
    expect(statusView("ready", "es").text).toMatch(/pasar a buscarlo/i);
    expect(statusView("ready", "es", { courier: true }).text).toMatch(/repartidor/i);
  });

  it("la línea de tiempo muestra los estados nuevos, traducidos", () => {
    const events = [
      { estado: "handed_to_courier", fecha: "2026-10-09T22:00:00Z" },
      { estado: "on_the_way", fecha: "2026-10-09T22:05:00Z" },
    ];
    expect(timeline(events, "es").map((e) => e.label)).toEqual(["Entregado al repartidor", "En camino"]);
    expect(timeline(events, "en").map((e) => e.label)).toEqual(["Handed to the courier", "On its way"]);
  });
});

describe("fetchDelivery — ENVIO-29", () => {
  const envio = {
    repartidor: "Repartos al Toque",
    zona: "Cantera",
    precio_lista: 5000,
    precio: 6500,
    motivo_cambio: "Fuera de zona",
    estado: "accepted",
    nota: "Juan, 21:30",
  };

  it("llama a public_order_delivery con el código y valida la forma", async () => {
    const fetchImpl = fakeFetch(envio);
    const r = await fetchDelivery({ ...cfg, code: CODE, fetchImpl });

    expect(r).toEqual({
      ok: true,
      data: {
        courier: "Repartos al Toque",
        whatsapp: null,
        zone: "Cantera",
        listPrice: 5000,
        price: 6500,
        reason: "Fuera de zona",
        state: "accepted",
        extras: null,
        arrivesAt: null,
        mode: "offers",
        note: "Juan, 21:30",
        offers: [],
        closesAt: null,
      },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/public_order_delivery");
    expect(JSON.parse(init.body)).toEqual({ p_code: CODE });
  });

  it("un pedido sin envío (null) es ok sin datos", async () => {
    expect(await fetchDelivery({ ...cfg, code: CODE, fetchImpl: fakeFetch(null) })).toEqual({ ok: true, data: null });
  });

  it("un estado desconocido o una forma rara no rompe: sin datos", async () => {
    const raro = await fetchDelivery({ ...cfg, code: CODE, fetchImpl: fakeFetch({ ...envio, estado: "volando" }) });
    expect(raro).toEqual({ ok: true, data: null });

    const texto = await fetchDelivery({ ...cfg, code: CODE, fetchImpl: fakeFetch("hola") });
    expect(texto).toEqual({ ok: true, data: null });
  });

  it("un error de red o de la base no es lo mismo que no tener envío", async () => {
    const caido = vi.fn().mockRejectedValue(new Error("red"));
    expect(await fetchDelivery({ ...cfg, code: CODE, fetchImpl: caido })).toEqual({ ok: false });
    expect(await fetchDelivery({ ...cfg, code: CODE, fetchImpl: fakeFetch({}, { ok: false, status: 500 }) })).toEqual({
      ok: false,
    });
    expect(await fetchDelivery({ ...cfg, code: "corto", fetchImpl: fakeFetch(envio) })).toEqual({ ok: false });
  });
});

// ENVIO-91 y 92: los estados nuevos del envío y los viejos que no tienen que romper la página.
describe("fetchDelivery con los estados nuevos — ENVIO-91 y 92", () => {
  const answer = (extra) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ zona: "Cantera", precio_lista: 5000, precio: 5000, ...extra }),
    });

  it.each(["waiting", "searching", "self"])("el estado %s no necesita repartidor", async (estado) => {
    const r = await fetchDelivery({ ...cfg, code: CODE, fetchImpl: answer({ estado }) });

    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ state: estado, courier: "", whatsapp: null });
  });

  it.each(["requested", "rejected"])("el estado viejo %s no rompe: no muestra el bloque", async (estado) => {
    const r = await fetchDelivery({ ...cfg, code: CODE, fetchImpl: answer({ estado, repartidor: "X" }) });
    expect(r).toEqual({ ok: true, data: null });
  });

  it("sin precios (un servidor que no los manda) no rompe", async () => {
    const r = await fetchDelivery({
      ...cfg,
      code: CODE,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ estado: "searching" }) }),
    });

    expect(r.data).toMatchObject({ state: "searching", price: null, listPrice: null });
  });

  // ENVIO-149: en precio fijo no hay ofertas ni cuenta regresiva, aunque el servidor las mandara.
  it("precio fijo: trae el modo y descarta ofertas y cierre", async () => {
    const r = await fetchDelivery({
      ...cfg,
      code: CODE,
      fetchImpl: answer({
        estado: "searching",
        modo: "fixed",
        ofertas: [{ id: OFFER_A, repartidor: "Damián", precio: 5000 }],
        cierra_en: "2026-10-09T22:05:00Z",
      }),
    });

    expect(r.data).toMatchObject({ state: "searching", mode: "fixed", offers: [], closesAt: null });
  });

  it("sin modo (un servidor viejo) se trata como ofertas y las conserva", async () => {
    const r = await fetchDelivery({
      ...cfg,
      code: CODE,
      fetchImpl: answer({
        estado: "searching",
        ofertas: [{ id: OFFER_A, repartidor: "Damián", precio: 5000 }],
      }),
    });

    expect(r.data.mode).toBe("offers");
    expect(r.data.offers).toHaveLength(1);
  });
});

describe("fetchDelivery con WhatsApp — ENVIO-44", () => {
  const answer = (extra) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ repartidor: "Damián", zona: "Cantera", precio_lista: 5000, precio: 5000, estado: "accepted", ...extra }),
    });

  it("lo deja con 8 a 15 dígitos", async () => {
    const r = await fetchDelivery({ ...cfg, code: CODE, fetchImpl: answer({ whatsapp: "5493644277105" }) });
    expect(r.data.whatsapp).toBe("5493644277105");
  });

  it.each([
    ["sin la clave", undefined],
    ["con letras", "549abc"],
    ["con una barra", "5493644/1"],
    ["muy corto", "1234567"],
    ["muy largo", "1234567890123456"],
    ["una URL", "javascript:alert(1)"],
  ])("lo descarta %s", async (_nombre, whatsapp) => {
    const r = await fetchDelivery({ ...cfg, code: CODE, fetchImpl: answer({ whatsapp }) });
    expect(r.data.whatsapp).toBeNull();
  });
});

const OFFER_A = "11111111-1111-4111-8111-111111111111";
const OFFER_B = "22222222-2222-4222-8222-222222222222";

describe("fetchDelivery con ofertas — ENVIO-110 y SEGUIMIENTO-28", () => {
  const answer = (extra) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ zona: "Cantera", precio_lista: 5000, precio: 5000, estado: "searching", ...extra }),
    });

  it("trae las ofertas abiertas y cuándo se elige sola", async () => {
    const r = await fetchDelivery({
      ...cfg,
      code: CODE,
      fetchImpl: answer({
        cierra_en: "2026-10-09T22:05:00Z",
        ofertas: [
          { id: OFFER_A, repartidor: "Damián", precio: 5000, favorito: true },
          { id: OFFER_B, repartidor: "Moto", precio: 4500, motivo: "Cerca", favorito: false },
        ],
      }),
    });

    expect(r.data.closesAt).toBe(Date.parse("2026-10-09T22:05:00Z"));
    expect(r.data.offers).toEqual([
      { id: OFFER_A, courier: "Damián", price: 5000, reason: null, favorite: true },
      { id: OFFER_B, courier: "Moto", price: 4500, reason: "Cerca", favorite: false },
    ]);
  });

  it("descarta las ofertas mal formadas y no inventa ofertas sin buscar", async () => {
    const r = await fetchDelivery({
      ...cfg,
      code: CODE,
      fetchImpl: answer({
        ofertas: [
          { id: "no-es-un-uuid", repartidor: "X", precio: 1 },
          { id: OFFER_A, repartidor: "Y", precio: "mucho" },
          { id: OFFER_B, repartidor: "Z", precio: -5 },
          null,
          "texto",
        ],
        cierra_en: "ayer",
      }),
    });
    expect(r.data.offers).toEqual([]);
    expect(r.data.closesAt).toBeNull();

    const aceptado = await fetchDelivery({
      ...cfg,
      code: CODE,
      fetchImpl: answer({ estado: "accepted", repartidor: "Damián", ofertas: [{ id: OFFER_A, precio: 1 }] }),
    });
    expect(aceptado.data.offers).toEqual([]);
  });
});

describe("deliveryCard — SEGUIMIENTO-27, ENVIO-29, 44 y 91", () => {
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const base = {
    courier: "Damián",
    whatsapp: "5493644277105",
    zone: "Cantera",
    listPrice: 5000,
    price: 5000,
    reason: null,
    state: "accepted",
    note: null,
    offers: [],
    closesAt: null,
  };
  const offer = { id: OFFER_A, courier: "Damián", price: 5000, reason: null, favorite: true };

  it("precio fijo: 'Buscando repartidor' con 'El primero que lo tome', sin hablar de ofertas (ENVIO-154)", () => {
    const card = deliveryCard({ ...base, state: "searching", courier: "", mode: "fixed" }, "es", money);

    expect(card).toMatchObject({ kind: "searching", title: "Buscando repartidor" });
    expect(card.lines.join(" ")).toMatch(/primero que lo tome/);
    expect(card.lines.join(" ")).not.toMatch(/ofrezcan|oferta/i);

    const en = deliveryCard({ ...base, state: "searching", courier: "", mode: "fixed" }, "en", money);
    expect(en.lines.join(" ")).toMatch(/first one to take it/);
  });

  it("precio fijo: tomado, muestra quién lo lleva y el precio de lista (ENVIO-154)", () => {
    const card = deliveryCard({ ...base, mode: "fixed" }, "es", money);

    expect(card).toMatchObject({ kind: "accepted", title: "Lo lleva Damián" });
    expect(card.lines.join(" ")).toMatch(/5\.000/);
  });

  it("searching sin ofertas: 'Buscando repartidor', con la moto", () => {
    expect(deliveryCard({ ...base, state: "searching", courier: "" }, "es", money)).toMatchObject({
      kind: "searching",
      icon: "searching",
      title: "Buscando repartidor",
    });
  });

  it("searching con ofertas: 'Elegí tu repartidor'", () => {
    expect(deliveryCard({ ...base, state: "searching", courier: "", offers: [offer] }, "es", money)).toMatchObject({
      kind: "choose",
      title: "Elegí tu repartidor",
    });
  });

  it("waiting: el local todavía no aceptó, y lo dice en los tres idiomas — ENVIO-165", () => {
    const waiting = { ...base, state: "waiting", courier: "", whatsapp: null };

    expect(deliveryCard(waiting, "es", money)).toMatchObject({
      kind: "waiting",
      title: "Esperando que el local confirme",
    });
    expect(deliveryCard(waiting, "en", money).title).toBe("Waiting for the restaurant to confirm");
    expect(deliveryCard(waiting, "pt", money).title).toBe("Aguardando o local confirmar");
  });

  it("accepted con tiempo de llegada: dice la hora aprox., y sin él no dice nada — ENVIO-165", () => {
    // 2026-10-12T00:55:00Z es 21:55 en Argentina.
    const at = Date.parse("2026-10-12T00:55:00Z");

    const now = new Date("2026-10-12T00:43:00Z");

    expect(deliveryCard({ ...base, arrivesAt: at }, "es", money, now).lines).toContain("Llega aprox. 21:55 · faltan 12 min");
    expect(deliveryCard({ ...base, arrivesAt: at }, "en", money, now).lines).toContain("Arrives around 21:55 · 12 min to go");
    expect(deliveryCard({ ...base, arrivesAt: at }, "pt", money, now).lines).toContain("Chega por volta das 21:55 · faltam 12 min");
    // Pasada la hora: sin números negativos (SEGUIMIENTO-45).
    expect(
      deliveryCard({ ...base, arrivesAt: at }, "es", money, new Date("2026-10-12T01:30:00Z")).lines,
    ).toContain("Unos minutos más");
    expect(deliveryCard({ ...base, arrivesAt: null }, "es", money).lines.join(" ")).not.toContain("Llega aprox");
  });

  it("con repartidor asignado y preferencias, dice qué más se le puede pedir — SEGUIMIENTO-47", () => {
    const extras = { shop: true, seek: true, note: "Hasta las 22" };

    const lines = deliveryCard({ ...base, extras }, "es", money).lines;
    expect(lines).toContain("Podés pedirle a Damián también: compras en el camino · buscar otros pedidos.");
    expect(lines).toContain("Hasta las 22");

    expect(
      deliveryCard({ ...base, extras: { shop: false, seek: true, note: "" } }, "en", money).lines.join(" "),
    ).toContain("picking up other orders");
    // Sin nada marcado, no hay bloque.
    expect(deliveryCard({ ...base, extras: null }, "es", money).lines.join(" ")).not.toContain("Podés pedirle");
  });

  it("self: dice que lo lleva el local", () => {
    expect(deliveryCard({ ...base, state: "self", courier: "", whatsapp: null }, "es", money)).toMatchObject({
      kind: "self",
      title: "Lo lleva el local",
    });
  });

  it("accepted: quién lo lleva, nota y precio al repartidor, con su teléfono y el botón para escribirle", () => {
    const card = deliveryCard({ ...base, note: "Juan, 21:30" }, "es", money);

    expect(card.kind).toBe("accepted");
    expect(card.title).toBe("Lo lleva Damián");
    expect(card.lines[0]).toBe("Juan, 21:30");
    expect(card.lines[1]).toMatch(/5.000.* al repartidor$/);
    expect(card.lines[2]).toBe("Damián: +5493644277105");
    expect(card.link).toEqual({ text: "Escribir a Damián", href: "https://wa.me/5493644277105" });
  });

  it("accepted sin WhatsApp: ni línea ni link", () => {
    const card = deliveryCard({ ...base, whatsapp: null }, "es", money);

    expect(card.link).toBeUndefined();
    expect(card.lines.join(" ")).not.toContain("+");
  });

  it("el teléfono y el link solo salen con el envío tomado", () => {
    for (const state of ["waiting", "searching", "self"]) {
      expect(JSON.stringify(deliveryCard({ ...base, state }, "es", money))).not.toContain("5493644277105");
    }
  });

  it("si el precio cambió, dice el precio de lista y el motivo", () => {
    const card = deliveryCard({ ...base, price: 6500, reason: "Fuera de zona" }, "es", money);

    expect(card.lines[0]).toMatch(/6.500.* al repartidor$/);
    expect(card.lines[1]).toMatch(/^Precio de lista .*5.000.* · Fuera de zona$/);
  });

  it("si cambió sin motivo, dice solo cuál era", () => {
    const card = deliveryCard({ ...base, price: 6500 }, "es", money);

    expect(card.lines[1]).toMatch(/^Precio de lista .*5.000.*$/);
    expect(card.lines[1]).not.toContain("·");
  });

  it("sin nombre del repartidor no inventa uno", () => {
    const card = deliveryCard({ ...base, courier: "" }, "es", money);

    expect(card.title).toBe("Ya tiene repartidor");
    expect(card.link.text).toBe("Escribir a el repartidor");
  });

  it("los estados viejos o desconocidos no muestran nada", () => {
    for (const state of ["requested", "rejected", "volando"]) {
      expect(deliveryCard({ ...base, state }, "es", money)).toBeNull();
    }
    expect(deliveryCard(null, "es", money)).toBeNull();
  });

  it("se traduce", () => {
    expect(deliveryCard({ ...base, state: "searching" }, "en", money).title).toBe("Looking for a courier");
    expect(deliveryCard({ ...base, state: "searching" }, "pt", money).title).toBe("Procurando entregador");
    expect(deliveryCard({ ...base, state: "self" }, "en", money).title).toBe("The restaurant delivers it");
    expect(deliveryCard({ ...base, state: "self" }, "pt", money).title).toBe("O estabelecimento entrega");
    expect(deliveryCard(base, "en", money).link.text).toBe("Message Damián");
    expect(deliveryCard(base, "pt", money).link.text).toBe("Escrever para Damián");
    expect(deliveryCard({ ...base, state: "searching", offers: [offer] }, "en", money).title).toBe(
      "Choose your courier",
    );
  });
});

describe("chooseCourier — ENVIO-103 y SEGUIMIENTO-28", () => {
  it("manda el código, la oferta y el precio que se veía", async () => {
    const fetchImpl = fakeFetch(null);
    const r = await chooseCourier({ ...cfg, code: CODE, offerId: OFFER_A, price: 5000, fetchImpl });

    expect(r).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/public_choose_courier");
    expect(JSON.parse(init.body)).toEqual({ p_code: CODE, p_offer_id: OFFER_A, p_price: 5000 });
  });

  it.each([
    ["P0020", "closed"],
    ["P0022", "changed"],
    ["P0002", "error"],
    ["XX000", "error"],
  ])("el error %s es '%s'", async (code, reason) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ code }) });
    expect(await chooseCourier({ ...cfg, code: CODE, offerId: OFFER_A, fetchImpl })).toEqual({ ok: false, reason });
  });

  it("sin configuración, con un código o una oferta inválidos, no llama", async () => {
    const fetchImpl = fakeFetch(null);
    expect(await chooseCourier({ ...cfg, code: "corto", offerId: OFFER_A, fetchImpl })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(await chooseCourier({ ...cfg, code: CODE, offerId: "x'; drop", fetchImpl })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("un error de red no lanza", async () => {
    const caido = vi.fn().mockRejectedValue(new Error("red"));
    expect(await chooseCourier({ ...cfg, code: CODE, offerId: OFFER_A, fetchImpl: caido })).toEqual({
      ok: false,
      reason: "error",
    });
  });
});

describe("nota por ítem — SEGUIMIENTO-36", () => {
  const money = { format: (n) => `$${n}` };

  it("muestra la nota del cliente bajo el ítem", () => {
    const li = itemRow(document, { nombre: "Hamburguesa", cantidad: 1, precio: 1000, nota: "sin cheddar" }, money);

    expect(li.querySelector(".item-nota").textContent).toBe("📝 sin cheddar");
  });

  it("sin nota (o vacía) no agrega nada", () => {
    for (const nota of [undefined, null, "", "   ", 5]) {
      const li = itemRow(document, { nombre: "Café", cantidad: 1, precio: 1000, nota }, money);
      expect(li.querySelector(".item-nota")).toBeNull();
    }
  });

  it("es texto: un HTML en la nota no se interpreta", () => {
    const li = itemRow(
      document,
      { nombre: "Café", cantidad: 1, precio: 1000, nota: "<img src=x onerror=alert(1)>" },
      money,
    );

    expect(li.querySelector("img")).toBeNull();
    expect(li.querySelector(".item-nota").textContent).toBe("📝 <img src=x onerror=alert(1)>");
  });
});
