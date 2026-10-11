import { describe, expect, it } from "vitest";

import {
  deliveryInputChanged,
  favoriteCandidates,
  initialDeliveryInput,
  normalizeDeliveryInput,
  parseMinutes,
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
  favorite_minutes: 5,
};

describe("parseMinutes — ENVIO-58", () => {
  it.each([
    ["5", 5],
    [" 60 ", 60],
    ["1", 1],
  ])("%s → %s", (text, expected) => {
    expect(parseMinutes(text)).toBe(expected);
  });

  it.each(["", "0", "61", "-1", "5,5", "abc", "1000"])("%s no es válido", (text) => {
    expect(parseMinutes(text)).toBeNull();
  });
});

describe("repartidores que se pueden elegir — ENVIO-58", () => {
  it("solo los que cubren alguna zona marcada", () => {
    expect(favoriteCandidates(options, ["centro"]).map((c) => c.id)).toEqual(["toque"]);
    expect(favoriteCandidates(options, ["cantera"]).map((c) => c.id)).toEqual(["toque", "moto"]);
    expect(favoriteCandidates(options, ["lolog"]).map((c) => c.id)).toEqual(["moto", "otro"]);
    expect(favoriteCandidates(options, [])).toEqual([]);
  });
});

describe("estado inicial y normalización — ENVIO-58", () => {
  it("arranca con las zonas marcadas, sin favorito y 5 minutos", () => {
    expect(initialDeliveryInput(options)).toEqual({
      zoneIds: ["centro", "cantera"],
      favoriteId: null,
      minutes: "5",
    });
  });

  it("conserva el favorito guardado si todavía cubre una zona marcada", () => {
    const input = initialDeliveryInput({ ...options, favorite_id: "moto", favorite_minutes: 12 });
    expect(input).toEqual({ zoneIds: ["centro", "cantera"], favoriteId: "moto", minutes: "12" });
  });

  it("al desmarcar las zonas de un favorito, vuelve a Sin favorito", () => {
    const input = normalizeDeliveryInput({ zoneIds: ["centro"], favoriteId: "moto", minutes: "5" }, options);
    expect(input.favoriteId).toBeNull();
  });

  it("ordena las zonas como la lista y descarta las que no existen", () => {
    const input = normalizeDeliveryInput({ zoneIds: ["cantera", "fantasma", "centro"], favoriteId: null, minutes: "5" }, options);
    expect(input.zoneIds).toEqual(["centro", "cantera"]);
  });
});

describe("validateDeliveryInput — ENVIO-58", () => {
  it("sin favorito, los minutos no cuentan", () => {
    expect(validateDeliveryInput({ zoneIds: ["centro"], favoriteId: null, minutes: "" }, options)).toEqual({
      ok: true,
      zoneIds: ["centro"],
      favoriteId: null,
      minutes: 5,
    });
  });

  it("con favorito pide minutos de 1 a 60", () => {
    const base = { zoneIds: ["cantera"], favoriteId: "moto" };

    expect(validateDeliveryInput({ ...base, minutes: "10" }, options)).toMatchObject({ ok: true, minutes: 10 });
    expect(validateDeliveryInput({ ...base, minutes: "0" }, options)).toMatchObject({
      ok: false,
      errors: { minutes: expect.any(String) },
    });
    expect(validateDeliveryInput({ ...base, minutes: "61" }, options)).toMatchObject({ ok: false });
  });

  it("un favorito que no cubre ninguna zona marcada se rechaza", () => {
    expect(validateDeliveryInput({ zoneIds: ["centro"], favoriteId: "moto", minutes: "5" }, options)).toMatchObject({
      ok: false,
      errors: { favorite: expect.any(String) },
    });
  });

  it("un local puede quedar sin zonas", () => {
    expect(validateDeliveryInput({ zoneIds: [], favoriteId: null, minutes: "5" }, options)).toMatchObject({
      ok: true,
      zoneIds: [],
    });
  });
});

describe("deliveryInputChanged — ENVIO-58", () => {
  const saved = { zoneIds: ["centro", "cantera"], favoriteId: null, minutes: "5" };

  it("detecta cambios de zonas, favorito y minutos", () => {
    expect(deliveryInputChanged(saved, { ...saved })).toBe(false);
    expect(deliveryInputChanged(saved, { ...saved, zoneIds: ["centro"] })).toBe(true);
    expect(deliveryInputChanged(saved, { ...saved, favoriteId: "toque" })).toBe(true);
    expect(deliveryInputChanged(saved, { ...saved, minutes: "7" })).toBe(true);
    expect(deliveryInputChanged(saved, { ...saved, minutes: " 5 " })).toBe(false);
  });
});
