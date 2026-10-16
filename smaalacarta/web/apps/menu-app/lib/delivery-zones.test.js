import { describe, expect, it, vi } from "vitest";

import {
  courierOrderFields,
  courierWhatsappLines,
  deliveryProblem,
  fetchDeliveryZones,
  findZone,
  isValidPhone,
  needsCourier,
  normalizeZones,
  zoneNoticeVars,
} from "./delivery-zones.js";
import { formatPrice } from "./price.js";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

// Desde la etapa 2 el servidor no manda repartidor ni WhatsApp al pedir (ENVIO-75): todavía no hay uno.
const RESPUESTA = {
  zonas: [
    { id: ID_A, nombre: "Centro (hasta Av. Koessler)", precio: 4500 },
    { id: ID_B, nombre: "Cantera", precio: 5000 },
  ],
};

describe("normalizeZones — ENVIO-20", () => {
  it("deja los barrios en el orden recibido, sin repartidor", () => {
    expect(normalizeZones(RESPUESTA)).toEqual({
      courier: null,
      whatsapp: null,
      zones: [
        { id: ID_A, name: "Centro (hasta Av. Koessler)", price: 4500 },
        { id: ID_B, name: "Cantera", price: 5000 },
      ],
    });
  });

  it("acepta el precio como texto numérico (numeric de la base)", () => {
    const data = { ...RESPUESTA, zonas: [{ id: ID_A, nombre: "Oasis", precio: "5500.00" }] };
    expect(normalizeZones(data)?.zones[0].price).toBe(5500);
  });

  it.each([
    ["null", null],
    ["un texto", "hola"],
    ["sin zonas", {}],
    ["zonas vacías", { zonas: [] }],
    ["zonas que no son una lista", { zonas: "Cantera" }],
  ])("da null con %s", (_nombre, data) => {
    expect(normalizeZones(data)).toBeNull();
  });

  it("descarta barrios mal formados y, si no queda ninguno, da null", () => {
    const malos = [
      { id: "no-es-uuid", nombre: "A", precio: 1 },
      { id: ID_A, nombre: "", precio: 1 },
      { id: ID_A, nombre: "B", precio: -1 },
      { id: ID_A, nombre: "C", precio: "mucho" },
    ];
    const sucio = { zonas: [...malos, { id: ID_B, nombre: "Válido", precio: 10 }] };

    expect(normalizeZones(sucio)?.zones).toEqual([{ id: ID_B, name: "Válido", price: 10 }]);
    expect(normalizeZones({ zonas: malos })).toBeNull();
  });

  it("el repartidor es opcional: si un servidor sin actualizar lo manda, se lee sin romper", () => {
    expect(normalizeZones({ ...RESPUESTA, repartidor: "Repartos al Toque" })?.courier).toBe("Repartos al Toque");
    expect(normalizeZones({ ...RESPUESTA, repartidor: "  " })?.courier).toBeNull();
    expect(normalizeZones({ ...RESPUESTA, repartidor: 7 })?.courier).toBeNull();
  });
});

describe("WhatsApp del repartidor — opcional", () => {
  it("si viene, lo deja con 8 a 15 dígitos", () => {
    expect(normalizeZones({ ...RESPUESTA, whatsapp: "5493644277105" })?.whatsapp).toBe("5493644277105");
  });

  it.each([
    ["sin la clave", undefined],
    ["null", null],
    ["con letras", "54936442+7105"],
    ["con espacios", "549 3644 277105"],
    ["muy corto", "1234567"],
    ["muy largo", "1234567890123456"],
    ["un número", 5493644277105],
  ])("lo descarta %s", (_nombre, whatsapp) => {
    const data = whatsapp === undefined ? RESPUESTA : { ...RESPUESTA, whatsapp };
    expect(normalizeZones(data)?.whatsapp).toBeNull();
  });
});

describe("fetchDeliveryZones — ENVIO-20", () => {
  const cfg = { url: "https://x.supabase.co", key: "sb_publishable_abc", slug: "ana" };
  const ok = (body) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

  it("llama a public_delivery_zones con el slug", async () => {
    const fetchImpl = ok(RESPUESTA);
    const r = await fetchDeliveryZones({ ...cfg, fetchImpl });

    expect(r?.zones).toHaveLength(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/public_delivery_zones");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("sb_publishable_abc");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init.body)).toEqual({ p_slug: "ana" });
  });

  it("manda Authorization solo con claves JWT", async () => {
    const fetchImpl = ok(RESPUESTA);
    await fetchDeliveryZones({ ...cfg, key: "eyJhbGciOi.payload.firma", fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJhbGciOi.payload.firma");
  });

  it("si viene null, falla o no hay configuración, da null y el checkout queda como hoy", async () => {
    const fallo = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const sinRed = vi.fn().mockRejectedValue(new Error("red"));

    expect(await fetchDeliveryZones({ ...cfg, fetchImpl: ok(null) })).toBeNull();
    expect(await fetchDeliveryZones({ ...cfg, fetchImpl: fallo })).toBeNull();
    expect(await fetchDeliveryZones({ ...cfg, fetchImpl: sinRed })).toBeNull();
    expect(await fetchDeliveryZones({ ...cfg, url: "", fetchImpl: ok(RESPUESTA) })).toBeNull();
    expect(await fetchDeliveryZones({ ...cfg, slug: "", fetchImpl: ok(RESPUESTA) })).toBeNull();
  });
});

describe("campos de envío en el checkout — ENVIO-20", () => {
  const zones = normalizeZones(RESPUESTA);

  it("solo hacen falta con entrega delivery y barrios disponibles", () => {
    expect(needsCourier(zones, "delivery")).toBe(true);
    expect(needsCourier(zones, "retiro")).toBe(false);
    expect(needsCourier(zones, "")).toBe(false);
    expect(needsCourier(null, "delivery")).toBe(false);
  });

  it("encuentra el barrio elegido y arma las variables del aviso con el precio formateado", () => {
    expect(findZone(zones, ID_B)).toEqual({ id: ID_B, name: "Cantera", price: 5000 });
    expect(findZone(zones, "nada")).toBeNull();
    expect(zoneNoticeVars(findZone(zones, ID_A), formatPrice)).toEqual({
      barrio: "Centro (hasta Av. Koessler)",
      precio: "4.500",
    });
  });

  it("el teléfono vale con 8 a 15 dígitos, con o sin separadores", () => {
    expect(isValidPhone("3644 27-7105")).toBe(true);
    expect(isValidPhone("+54 9 364 4277105")).toBe(true);
    expect(isValidPhone("1234567")).toBe(false);
    expect(isValidPhone("1234567890123456")).toBe(false);
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone(null)).toBe(false);
  });
});

describe("courierOrderFields — ENVIO-21 y 87", () => {
  const zones = normalizeZones(RESPUESTA);

  it("con envío manda barrio y dirección sin espacios de más, y no el teléfono", () => {
    expect(
      courierOrderFields({
        zones,
        delivery: "delivery",
        zoneId: ID_B,
        phone: " 3644277105 ",
        address: "  Av. Siempre Viva 742 ",
      }),
    ).toEqual({ deliveryZone: ID_B, deliveryAddress: "Av. Siempre Viva 742" });
  });

  it("sin envío, o con un barrio que no está en la lista, no manda nada", () => {
    const base = { address: "Calle 123" };
    expect(courierOrderFields({ ...base, zones, delivery: "retiro", zoneId: ID_B })).toEqual({});
    expect(courierOrderFields({ ...base, zones: null, delivery: "delivery", zoneId: ID_B })).toEqual({});
    expect(courierOrderFields({ ...base, zones, delivery: "delivery", zoneId: "otro" })).toEqual({});
  });
});

describe("courierWhatsappLines — ENVIO-22 y 88", () => {
  const zone = { id: ID_B, name: "Cantera", price: 5000 };

  it("dice barrio, envío (se paga al repartidor) y dirección, en español, sin nombrar al repartidor", () => {
    const text = courierWhatsappLines(zone, { address: "Av. Siempre Viva 742" }, formatPrice);

    expect(text).toBe(
      [
        "📍 Barrio: Cantera",
        "🛵 Envío: $5.000, se paga al repartidor",
        "🏠 Dirección: Av. Siempre Viva 742",
        "",
      ].join("\n"),
    );
  });

  it("no lleva el teléfono del cliente ni el de ningún repartidor (el del cliente va aparte)", () => {
    const text = courierWhatsappLines(zone, { address: "Calle 123", phone: "3644277105" }, formatPrice);

    expect(text).not.toMatch(/Tel/);
    expect(text).not.toContain("3644277105");
    expect(text).not.toContain("Repartos al Toque");
  });
});


describe("deliveryProblem — PUBLICO-82", () => {
  const zones = { zones: [{ id: "a", name: "Centro", price: 1000 }] };

  it("el envío a una zona de la lista no tiene problema", () => {
    expect(deliveryProblem({ zones, delivery: "delivery", zoneId: "a" })).toBeNull();
  });

  it("el envío sin zona, o a una que ya no está, no deja confirmar", () => {
    expect(deliveryProblem({ zones, delivery: "delivery", zoneId: "" })).toBe("invalid_zone");
    expect(deliveryProblem({ zones, delivery: "delivery", zoneId: "z" })).toBe("invalid_zone");
  });

  it("'Mi barrio no está' no deja confirmar con envío aunque la zona sea válida", () => {
    expect(deliveryProblem({ zones, delivery: "delivery", zoneId: "a", blocked: true })).toBe("no_delivery");
  });

  it("bloqueado y sin entrega elegida (local solo con envío) tampoco deja confirmar", () => {
    expect(deliveryProblem({ zones, delivery: "", zoneId: "", blocked: true })).toBe("no_delivery");
    expect(deliveryProblem({ zones, delivery: null, zoneId: "", blocked: true })).toBe("no_delivery");
  });

  it("el retiro nunca tiene problema, ni con el envío bloqueado", () => {
    expect(deliveryProblem({ zones, delivery: "retiro", zoneId: "", blocked: true })).toBeNull();
  });

  it("sin barrios cargados no se exige zona", () => {
    expect(deliveryProblem({ zones: { zones: [] }, delivery: "delivery", zoneId: "" })).toBeNull();
    expect(deliveryProblem({ zones: null, delivery: "delivery", zoneId: "" })).toBeNull();
  });
});
