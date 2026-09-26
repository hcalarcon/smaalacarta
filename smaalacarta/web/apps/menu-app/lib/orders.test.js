import { describe, expect, it, vi } from "vitest";

import { buildOrderItems, createOrder, trackingLink, whatsappOrderUrl } from "./orders.js";

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

  it("solo manda Authorization con claves en formato JWT", async () => {
    const jwt = fakeFetch({ code: "0123456789abcdef0123", number: 1, total: 1 });
    await createOrder({ ...base, key: "eyJhbGciOi.payload.firma", fetchImpl: jwt });
    expect(jwt.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJhbGciOi.payload.firma");
  });

  it.each([
    ["P0005", "closed"],
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
