import { describe, expect, it, vi } from "vitest";

import {
  courierOrderFields,
  courierWhatsappLines,
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

const RESPUESTA = {
  repartidor: "Repartos al Toque",
  zonas: [
    { id: ID_A, nombre: "Centro (hasta Av. Koessler)", precio: 4500 },
    { id: ID_B, nombre: "Cantera", precio: 5000 },
  ],
};

describe("normalizeZones — ENVIO-20", () => {
  it("deja el repartidor y los barrios en el orden recibido", () => {
    expect(normalizeZones(RESPUESTA)).toEqual({
      courier: "Repartos al Toque",
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
    ["sin repartidor", { zonas: RESPUESTA.zonas }],
    ["sin zonas", { repartidor: "X" }],
    ["zonas vacías", { repartidor: "X", zonas: [] }],
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
    const sucio = { repartidor: "X", zonas: [...malos, { id: ID_B, nombre: "Válido", precio: 10 }] };

    expect(normalizeZones(sucio)?.zones).toEqual([{ id: ID_B, name: "Válido", price: 10 }]);
    expect(normalizeZones({ repartidor: "X", zonas: malos })).toBeNull();
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

describe("courierOrderFields — ENVIO-21", () => {
  const zones = normalizeZones(RESPUESTA);

  it("con envío manda barrio, teléfono y dirección sin espacios de más", () => {
    expect(
      courierOrderFields({
        zones,
        delivery: "delivery",
        zoneId: ID_B,
        phone: " 3644277105 ",
        address: "  Av. Siempre Viva 742 ",
      }),
    ).toEqual({ deliveryZone: ID_B, customerPhone: "3644277105", deliveryAddress: "Av. Siempre Viva 742" });
  });

  it("sin envío, o con un barrio que no está en la lista, no manda nada", () => {
    const base = { phone: "3644277105", address: "Calle 123" };
    expect(courierOrderFields({ ...base, zones, delivery: "retiro", zoneId: ID_B })).toEqual({});
    expect(courierOrderFields({ ...base, zones: null, delivery: "delivery", zoneId: ID_B })).toEqual({});
    expect(courierOrderFields({ ...base, zones, delivery: "delivery", zoneId: "otro" })).toEqual({});
  });
});

describe("courierWhatsappLines — ENVIO-22", () => {
  it("dice barrio, envío (se paga al repartidor), dirección y teléfono, en español", () => {
    const text = courierWhatsappLines(
      { id: ID_B, name: "Cantera", price: 5000 },
      { address: "Av. Siempre Viva 742", phone: "3644277105" },
      formatPrice,
    );

    expect(text).toBe(
      [
        "📍 Barrio: Cantera",
        "🛵 Envío: $5.000 (se paga al repartidor)",
        "🏠 Dirección: Av. Siempre Viva 742",
        "📞 Teléfono: 3644277105",
        "",
      ].join("\n"),
    );
  });
});
