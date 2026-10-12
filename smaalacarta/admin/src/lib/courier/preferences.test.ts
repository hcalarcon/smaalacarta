import { describe, expect, it } from "vitest";

import {
  deliveryInputChanged,
  favoriteCandidates,
  initialDeliveryInput,
  normalizeDeliveryInput,
  validateDeliveryInput,
  type DeliveryOptions,
} from "./preferences";

const options: DeliveryOptions = {
  zones: [
    { id: "centro", name: "Centro", price: 4500, selected: true, covered: true },
    { id: "cantera", name: "Cantera", price: 5000, selected: true, covered: true },
    { id: "lolog", name: "Lolog", price: 25000, selected: false, covered: false },
  ],
  couriers: [
    { id: "toque", name: "Repartos al Toque", whatsapp: "5493644277105", zone_ids: ["centro", "cantera"] },
    { id: "moto", name: "Moto Express", whatsapp: null, zone_ids: ["cantera", "lolog"] },
    { id: "otro", name: "Otro", whatsapp: null, zone_ids: ["lolog"] },
  ],
  favorite_id: null,
};

describe("repartidores que se pueden elegir — ENVIO-58", () => {
  it("solo los que cubren alguna zona marcada", () => {
    expect(favoriteCandidates(options, ["centro"]).map((c) => c.id)).toEqual(["toque"]);
    expect(favoriteCandidates(options, ["cantera"]).map((c) => c.id)).toEqual(["toque", "moto"]);
    expect(favoriteCandidates(options, ["lolog"]).map((c) => c.id)).toEqual(["moto", "otro"]);
    expect(favoriteCandidates(options, [])).toEqual([]);
  });
});

describe("estado inicial y normalización — ENVIO-58", () => {
  it("arranca con las zonas marcadas y sin favorito", () => {
    expect(initialDeliveryInput(options)).toEqual({
      zoneIds: ["centro", "cantera"],
      favoriteId: null,
    });
  });

  it("conserva el favorito guardado si todavía cubre una zona marcada", () => {
    const input = initialDeliveryInput({ ...options, favorite_id: "moto" });
    expect(input).toEqual({ zoneIds: ["centro", "cantera"], favoriteId: "moto" });
  });

  it("al desmarcar las zonas de un favorito, vuelve a Sin elegir", () => {
    const input = normalizeDeliveryInput({ zoneIds: ["centro"], favoriteId: "moto" }, options);
    expect(input.favoriteId).toBeNull();
  });

  it("ordena las zonas como la lista y descarta las que no existen", () => {
    const input = normalizeDeliveryInput({ zoneIds: ["cantera", "fantasma", "centro"], favoriteId: null }, options);
    expect(input.zoneIds).toEqual(["centro", "cantera"]);
  });
});

describe("validateDeliveryInput — ENVIO-58", () => {
  it("sin favorito es válido", () => {
    expect(validateDeliveryInput({ zoneIds: ["centro"], favoriteId: null }, options)).toEqual({
      ok: true,
      zoneIds: ["centro"],
      favoriteId: null,
    });
  });

  it("con un favorito que cubre una zona marcada es válido", () => {
    expect(validateDeliveryInput({ zoneIds: ["cantera"], favoriteId: "moto" }, options)).toEqual({
      ok: true,
      zoneIds: ["cantera"],
      favoriteId: "moto",
    });
  });

  it("un favorito que no cubre ninguna zona marcada se rechaza", () => {
    expect(validateDeliveryInput({ zoneIds: ["centro"], favoriteId: "moto" }, options)).toMatchObject({
      ok: false,
      errors: { favorite: expect.any(String) },
    });
  });

  it("un local puede quedar sin zonas", () => {
    expect(validateDeliveryInput({ zoneIds: [], favoriteId: null }, options)).toMatchObject({
      ok: true,
      zoneIds: [],
    });
  });
});

describe("deliveryInputChanged — ENVIO-58", () => {
  const saved = { zoneIds: ["centro", "cantera"], favoriteId: null };

  it("detecta cambios de zonas y de favorito", () => {
    expect(deliveryInputChanged(saved, { ...saved })).toBe(false);
    expect(deliveryInputChanged(saved, { ...saved, zoneIds: ["centro"] })).toBe(true);
    expect(deliveryInputChanged(saved, { ...saved, favoriteId: "toque" })).toBe(true);
  });
});
