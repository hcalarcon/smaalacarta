import { describe, expect, it, vi } from "vitest";

import {
  buildOrderItems,
  createOrder,
  finalizeOrderMessage,
  forgetLastOrder,
  handoffUrl,
  lastOrder,
  markHandoffSent,
  pendingHandoff,
  rememberHandoff,
  rememberLastOrder,
  trackingLink,
  whatsappOrderUrl,
} from "./orders.js";

const ID_CAFE = "d1000000-0000-0000-0000-000000000001";
const ID_COMBO = "e1000000-0000-0000-0000-000000000002";

describe("buildOrderItems — SEGUIMIENTO-2 y 7", () => {
  it("manda solo el id, el tipo y la cantidad (nunca un precio)", () => {
    const items = buildOrderItems([
      { id: ID_CAFE, nombre: "Café", precio: 1000, cantidad: 2 },
      { id: ID_COMBO, esPromo: true, nombre: "Combo", precio: 1500, cantidad: 1 },
    ]);

    expect(items).toEqual([
      { id: ID_CAFE, kind: "product", quantity: 2 },
      { id: ID_COMBO, kind: "promo", quantity: 1 },
    ]);
    // Ninguna clave de precio: solo id, tipo y cantidad.
    expect(items.every((item) => Object.keys(item).sort().join() === "id,kind,quantity")).toBe(true);
  });

  it("si algún ítem no tiene id (menú de un JSON viejo) no se puede guardar el pedido", () => {
    expect(buildOrderItems([{ id: ID_CAFE, cantidad: 1 }, { nombre: "Sin id", cantidad: 1 }])).toBeNull();
  });

  it("un carrito vacío no arma pedido", () => {
    expect(buildOrderItems([])).toBeNull();
    expect(buildOrderItems(undefined)).toBeNull();
  });

  it.each([0, -1, 1.5, "2", null, undefined])("una cantidad %j no arma pedido", (cantidad) => {
    expect(buildOrderItems([{ id: ID_CAFE, cantidad }])).toBeNull();
  });
});

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({ ok, status, json: async () => body }));
}

const base = {
  url: "https://x.supabase.co",
  key: "sb_publishable_abc",
  slug: "ana",
  customer: "Ana Pérez",
  delivery: "retiro",
  payment: "efectivo",
  notes: "Sin sal",
  items: [{ id: ID_CAFE, kind: "product", quantity: 2 }],
};

describe("createOrder — SEGUIMIENTO-1 y 7", () => {
  it("llama a create_public_order con los datos del pedido", async () => {
    const fetchImpl = fakeFetch({ code: "0123456789abcdef0123", number: 7, total: 2000 });

    const r = await createOrder({ ...base, fetchImpl });

    expect(r).toEqual({ ok: true, code: "0123456789abcdef0123", number: 7, total: 2000 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/create_public_order");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("sb_publishable_abc");
    expect(JSON.parse(init.body)).toEqual({
      p_slug: "ana",
      p_customer_name: "Ana Pérez",
      p_delivery: "retiro",
      p_payment: "efectivo",
      p_notes: "Sin sal",
      p_items: [{ id: ID_CAFE, kind: "product", quantity: 2 }],
    });
  });

  it("manda la hora programada como p_scheduled_for, y sin ella no manda la clave (PUBLICO-30)", async () => {
    const programado = fakeFetch({ code: "0123456789abcdef0123", number: 1, total: 1 });
    await createOrder({ ...base, scheduledFor: "2026-01-05T23:30:00.000Z", fetchImpl: programado });
    expect(JSON.parse(programado.mock.calls[0][1].body).p_scheduled_for).toBe("2026-01-05T23:30:00.000Z");

    const ahora = fakeFetch({ code: "0123456789abcdef0123", number: 1, total: 1 });
    await createOrder({ ...base, fetchImpl: ahora });
    expect(JSON.parse(ahora.mock.calls[0][1].body)).not.toHaveProperty("p_scheduled_for");
  });

  it("un pedido anticipado manda p_preorder, y sin él no manda la clave (PUBLICO-33)", async () => {
    const anticipado = fakeFetch({ code: "0123456789abcdef0123", number: 1, total: 1 });
    await createOrder({ ...base, preorder: true, fetchImpl: anticipado });
    expect(JSON.parse(anticipado.mock.calls[0][1].body).p_preorder).toBe(true);

    const normal = fakeFetch({ code: "0123456789abcdef0123", number: 1, total: 1 });
    await createOrder({ ...base, fetchImpl: normal });
    expect(JSON.parse(normal.mock.calls[0][1].body)).not.toHaveProperty("p_preorder");
  });

  it("solo manda Authorization con claves en formato JWT", async () => {
    const jwt = fakeFetch({ code: "0123456789abcdef0123", number: 1, total: 1 });
    await createOrder({ ...base, key: "eyJhbGciOi.payload.firma", fetchImpl: jwt });
    expect(jwt.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJhbGciOi.payload.firma");
  });

  it.each([
    ["P0005", "closed"],
    ["P0007", "invalid_delivery"],
    ["P0008", "invalid_payment"],
    ["P0009", "out_of_stock"],
    ["P0011", "scheduling_disabled"],
    ["P0012", "invalid_schedule"],
    ["P0013", "preorder_closed"],
    ["P0003", "busy"],
    ["P0001", "unavailable"],
    ["P0002", "unavailable"],
    ["22023", "invalid"],
    ["XX000", "unknown"],
  ])("el error %s de la base es '%s'", async (code, reason) => {
    const fetchImpl = fakeFetch({ code, message: "texto técnico" }, { ok: false, status: 400 });

    const r = await createOrder({ ...base, fetchImpl });

    expect(r).toMatchObject({ ok: false, reason });
    expect(JSON.stringify(r)).not.toContain("texto técnico");
  });

  it("si la red falla, el pedido no se guardó ('unknown'), sin lanzar", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("sin conexión");
    });
    expect(await createOrder({ ...base, fetchImpl })).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("una respuesta sin código no se toma como pedido guardado", async () => {
    expect(await createOrder({ ...base, fetchImpl: fakeFetch({ number: 1 }) })).toMatchObject({ ok: false, reason: "unknown" });
    expect(await createOrder({ ...base, fetchImpl: fakeFetch(null) })).toMatchObject({ ok: false, reason: "unknown" });
    expect(await createOrder({ ...base, fetchImpl: fakeFetch({ code: "no-es-un-codigo", number: 1 }) })).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("sin configuración o sin ítems no hace ninguna llamada", async () => {
    const fetchImpl = fakeFetch({});
    expect((await createOrder({ ...base, url: "", key: "", fetchImpl })).ok).toBe(false);
    expect((await createOrder({ ...base, items: null, fetchImpl })).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("trackingLink — SEGUIMIENTO-5", () => {
  it("es la misma dirección del menú más /pedido/<código>", () => {
    expect(trackingLink("https://ana.smaalacarta.com.ar", "0123456789abcdef0123")).toBe(
      "https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123",
    );
  });

  it("no deja una doble barra", () => {
    expect(trackingLink("https://ana.smaalacarta.com.ar/", "0123456789abcdef0123")).toBe(
      "https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123",
    );
  });

  it("agrega ?lang= solo si el idioma es es, en o pt (IDIOMA-12)", () => {
    const base = "https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123";
    expect(trackingLink("https://ana.smaalacarta.com.ar", "0123456789abcdef0123", "en")).toBe(`${base}?lang=en`);
    expect(trackingLink("https://ana.smaalacarta.com.ar", "0123456789abcdef0123", "pt")).toBe(`${base}?lang=pt`);
    expect(trackingLink("https://ana.smaalacarta.com.ar", "0123456789abcdef0123", "fr")).toBe(base);
    expect(trackingLink("https://ana.smaalacarta.com.ar", "0123456789abcdef0123", undefined)).toBe(base);
    expect(trackingLink("https://ana.smaalacarta.com.ar", "0123456789abcdef0123", "en&x=1")).toBe(base);
  });

  it("nunca repite ?lang= (IDIOMA-12)", () => {
    const link = trackingLink("https://ana.smaalacarta.com.ar/", "0123456789abcdef0123", "es");
    expect(link.match(/lang=/g)).toHaveLength(1);
  });
});

describe("whatsappOrderUrl", () => {
  it("arma el enlace con el teléfono y el mensaje codificado", () => {
    expect(whatsappOrderUrl("5493510000001", "Hola & chau\nlínea")).toBe(
      "https://api.whatsapp.com/send?phone=5493510000001&text=Hola%20%26%20chau%0Al%C3%ADnea",
    );
  });

  it("solo deja los dígitos del teléfono", () => {
    expect(whatsappOrderUrl("+54 9 351 000-0001", "x")).toContain("phone=5493510000001&");
  });
});

describe("enviar por WhatsApp desde el seguimiento — SEGUIMIENTO-10", () => {
  const CODE = "0123456789abcdef0123";
  const URL = "https://api.whatsapp.com/send?phone=5493510000001&text=Hola";

  function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
      get length() { return data.size; },
      key: (i) => [...data.keys()][i] ?? null,
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => void data.set(k, String(v)),
      removeItem: (k) => void data.delete(k),
    };
  }

  it("un pedido recién hecho queda pendiente de enviar", () => {
    const storage = fakeStorage();
    rememberHandoff(storage, CODE, URL);
    expect(pendingHandoff(storage, CODE)).toEqual({ url: URL });
  });

  it("una vez enviado ya no está pendiente", () => {
    const storage = fakeStorage();
    rememberHandoff(storage, CODE, URL);
    markHandoffSent(storage, CODE);
    expect(pendingHandoff(storage, CODE)).toBeNull();
  });

  it("de otro pedido, o sin nada guardado, no hay pendiente", () => {
    const storage = fakeStorage();
    rememberHandoff(storage, CODE, URL);
    expect(pendingHandoff(storage, "f".repeat(20))).toBeNull();
    expect(pendingHandoff(fakeStorage(), CODE)).toBeNull();
  });

  it("solo guarda y devuelve links de WhatsApp (nunca otra dirección)", () => {
    const storage = fakeStorage();
    rememberHandoff(storage, CODE, "https://evil.com/?x=1");
    rememberHandoff(storage, CODE, "javascript:alert(1)");
    expect(pendingHandoff(storage, CODE)).toBeNull();

    // Aunque alguien edite el almacenamiento a mano.
    storage.setItem("sma-wa:" + CODE, JSON.stringify({ url: "javascript:alert(1)", sent: false }));
    expect(pendingHandoff(storage, CODE)).toBeNull();
  });

  it("no guarda con un código que no tiene el formato", () => {
    const storage = fakeStorage();
    rememberHandoff(storage, "../../x", URL);
    expect(storage.length).toBe(0);
  });

  it("guarda solo los últimos 5 pedidos", () => {
    const storage = fakeStorage();
    for (let i = 0; i < 8; i++) rememberHandoff(storage, String(i).repeat(20).slice(0, 20).replace(/[^0-9a-f]/g, "a"), URL, 1000 + i);
    expect(storage.length).toBe(5);
  });

  it("si el almacenamiento falla, no rompe", () => {
    const broken = {
      length: 0,
      key: () => null,
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
      removeItem: () => {},
    };
    expect(() => rememberHandoff(broken, CODE, URL)).not.toThrow();
    expect(pendingHandoff(broken, CODE)).toBeNull();
    expect(() => markHandoffSent(broken, CODE)).not.toThrow();
  });
});

describe("motivo de rechazo por horario — SEGUIMIENTO-9", () => {
  it("P0006 (fuera del horario) se distingue del cierre temporal", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ code: "P0006" }) }));
    const r = await createOrder({
      url: "https://x.supabase.co",
      key: "sb_publishable_x",
      slug: "ana",
      customer: "X",
      delivery: "",
      payment: "",
      notes: "",
      items: [{ id: "d1000000-0000-0000-0000-000000000001", kind: "product", quantity: 1 }],
      fetchImpl,
    });
    expect(r).toEqual({ ok: false, reason: "outside_hours" });
  });
});

describe("cierre del pedido — SEGUIMIENTO-10", () => {
  const CODE = "0123456789abcdef0123";
  const URL = "https://api.whatsapp.com/send?phone=5493510000001&text=Hola";
  const LINK = "https://demo.smaalacarta.com.ar/pedido/" + CODE;

  function fakeStorage() {
    const data = new Map();
    return {
      get length() { return data.size; },
      key: (i) => [...data.keys()][i] ?? null,
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => void data.set(k, String(v)),
      removeItem: (k) => void data.delete(k),
    };
  }

  it("el mensaje lleva el número en el título y el link de seguimiento", () => {
    const out = finalizeOrderMessage("🍔 *Nuevo pedido*\n\nCliente", { number: 12, link: LINK });
    expect(out).toContain("*Nuevo pedido #12*");
    expect(out.endsWith(`🔎 Seguí tu pedido: ${LINK}`)).toBe(true);
  });

  it("sin número ni link (pedido no guardado) el mensaje queda igual", () => {
    const msg = "🍔 *Nuevo pedido*\n\nCliente";
    expect(finalizeOrderMessage(msg)).toBe(msg);
    expect(finalizeOrderMessage(msg, {})).toBe(msg);
  });

  it("el último pedido se recuerda y se olvida", () => {
    const storage = fakeStorage();
    rememberLastOrder(storage, { code: CODE, number: 7 });
    expect(lastOrder(storage)).toEqual({ code: CODE, number: 7 });
    forgetLastOrder(storage);
    expect(lastOrder(storage)).toBeNull();
  });

  it("el último pedido recuerda el pago elegido, para mostrar los datos de la transferencia al volver (PUBLICO-20)", () => {
    const storage = fakeStorage();
    rememberLastOrder(storage, { code: CODE, number: 7, payment: "transferencia" });
    expect(lastOrder(storage)).toEqual({ code: CODE, number: 7, payment: "transferencia" });
  });

  it("un pago desconocido no se guarda", () => {
    const storage = fakeStorage();
    rememberLastOrder(storage, { code: CODE, number: 7, payment: "<b>x</b>" });
    expect(lastOrder(storage)).toEqual({ code: CODE, number: 7 });
  });

  it("el último pedido vence a las 2 horas", () => {
    const storage = fakeStorage();
    rememberLastOrder(storage, { code: CODE, number: 7 }, 1000);
    expect(lastOrder(storage, 1000 + 2 * 60 * 60 * 1000 - 1)).not.toBeNull();
    expect(lastOrder(storage, 1000 + 2 * 60 * 60 * 1000)).toBeNull();
  });

  it("no guarda un código o un número inválidos", () => {
    const storage = fakeStorage();
    rememberLastOrder(storage, { code: "../x", number: 7 });
    rememberLastOrder(storage, { code: CODE, number: "7" });
    expect(lastOrder(storage)).toBeNull();
  });

  it("handoffUrl devuelve el link aunque ya se haya enviado", () => {
    const storage = fakeStorage();
    rememberHandoff(storage, CODE, URL);
    markHandoffSent(storage, CODE);
    expect(handoffUrl(storage, CODE)).toBe(URL);
    expect(handoffUrl(storage, "ffffffffffffffffffff")).toBeNull();
  });
});
