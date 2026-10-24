import { describe, expect, it } from "vitest";

import type { DeliveryOptions } from "@/lib/courier/preferences";

import { manualDeliveryContext } from "./manual-context";

const options: DeliveryOptions = {
  zones: [
    { id: "z1", name: "Centro", price: 3000, selected: true, covered: true },
    { id: "z2", name: "Cantera", price: 5000, selected: true, covered: true },
    { id: "z3", name: "Oasis", price: 7000, selected: false, covered: true }, // el local no la tildó
    { id: "z4", name: "Lejos", price: 9000, selected: true, covered: false }, // nadie la cubre
  ],
  couriers: [
    { id: "toque", name: "Repartos al Toque", whatsapp: null, zone_ids: ["z1", "z2", "z3"] },
    { id: "moto", name: "Moto Express", whatsapp: null, zone_ids: ["z1"] },
  ],
  favorite_id: null,
};

describe("contexto del envío para el pedido manual — ENVIO-137 y 139", () => {
  it("ofrece solo los barrios tildados por el local y cubiertos por algún repartidor", () => {
    const { zones } = manualDeliveryContext(options);

    expect(zones.map((zone) => [zone.name, zone.price])).toEqual([
      ["Centro", 3000],
      ["Cantera", 5000],
    ]);
  });

  it("sin favorito elegido no hay favorito: no se ofrece asignar a nadie — ENVIO-254", () => {
    const context = manualDeliveryContext(options);

    expect(context.favorite).toBeNull();
    expect(context.zones.every((zone) => !zone.favoriteCovers)).toBe(true);
  });

  it("con otro favorito elegido, vale ese y solo cubre sus barrios", () => {
    const context = manualDeliveryContext({ ...options, favorite_id: "moto" });

    expect(context.favorite).toEqual({ id: "moto", name: "Moto Express" });
    expect(context.zones.map((zone) => [zone.name, zone.favoriteCovers])).toEqual([
      ["Centro", true],
      ["Cantera", false],
    ]);
  });

  it("un favorito que ya no está entre los repartidores activos no se ofrece", () => {
    const context = manualDeliveryContext({ ...options, favorite_id: "fantasma" });

    expect(context.favorite).toBeNull();
    expect(context.zones.every((zone) => !zone.favoriteCovers)).toBe(true);
  });

  it("sin datos de envío no ofrece nada", () => {
    expect(manualDeliveryContext(null)).toEqual({
      zones: [],
      favorite: null,
      kind: "free",
      coordinate: false,
      ownCourier: null,
    });
  });
});

describe("envío propio y a coordinar — ENVIO-250 a 252", () => {
  const own = (courier: { id: string; name: string; active: boolean } | null) => ({
    delivery: { delivery_type: "own" as const, courier, zones_with_price: 1, zones_total: 3 },
    zones: [
      { id: "a", name: "Norte", price: 1500, active: true, sort_order: 1 },
      { id: "b", name: "Apagada", price: 900, active: false, sort_order: 2 },
      { id: "c", name: "Sin precio", price: null, active: true, sort_order: 3 },
    ],
  });

  it("con envío propio ofrece sus zonas activas y con precio, su repartidor propio y el envío a coordinar", () => {
    const context = manualDeliveryContext(null, own({ id: "r", name: "Rita", active: true }));

    expect(context.kind).toBe("own");
    expect(context.zones.map((zone) => [zone.name, zone.price])).toEqual([["Norte", 1500]]);
    expect(context.ownCourier).toEqual({ id: "r", name: "Rita" });
    expect(context.coordinate).toBe(true);
    expect(context.favorite).toBeNull();
  });

  it("sin repartidor propio activo no hay a quién asignar", () => {
    expect(manualDeliveryContext(null, own(null)).ownCourier).toBeNull();
    expect(manualDeliveryContext(null, own({ id: "r", name: "Rita", active: false })).ownCourier).toBeNull();
  });

  it("con envío libre se puede coordinar solo si no tildó ninguna zona", () => {
    expect(manualDeliveryContext(options).coordinate).toBe(false);

    const sinZonas = { ...options, zones: options.zones.map((zone) => ({ ...zone, selected: false })) };
    expect(manualDeliveryContext(sinZonas).coordinate).toBe(true);
    expect(manualDeliveryContext(sinZonas).kind).toBe("free");
  });
});
