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
  default_courier: { id: "toque", name: "Repartos al Toque" },
};

describe("contexto del envío para el pedido manual — ENVIO-137 y 139", () => {
  it("ofrece solo los barrios tildados por el local y cubiertos por algún repartidor", () => {
    const { zones } = manualDeliveryContext(options);

    expect(zones.map((zone) => [zone.name, zone.price])).toEqual([
      ["Centro", 3000],
      ["Cantera", 5000],
    ]);
  });

  it("sin favorito elegido, el favorito es Repartos al Toque y cubre lo que cubre", () => {
    const context = manualDeliveryContext(options);

    expect(context.favorite).toEqual({ id: "toque", name: "Repartos al Toque" });
    expect(context.zones.map((zone) => zone.favoriteCovers)).toEqual([true, true]);
  });

  it("con otro favorito elegido, vale ese y solo cubre sus barrios", () => {
    const context = manualDeliveryContext({ ...options, favorite_id: "moto" });

    expect(context.favorite).toEqual({ id: "moto", name: "Moto Express" });
    expect(context.zones.map((zone) => [zone.name, zone.favoriteCovers])).toEqual([
      ["Centro", true],
      ["Cantera", false],
    ]);
  });

  it("sin favorito y con Repartos al Toque inactivo no hay favorito", () => {
    const context = manualDeliveryContext({ ...options, default_courier: null });

    expect(context.favorite).toBeNull();
    expect(context.zones.every((zone) => !zone.favoriteCovers)).toBe(true);
  });

  it("un favorito que ya no está entre los repartidores activos no se ofrece", () => {
    const context = manualDeliveryContext({ ...options, favorite_id: "fantasma" });

    expect(context.favorite).toBeNull();
    expect(context.zones.every((zone) => !zone.favoriteCovers)).toBe(true);
  });

  it("sin datos de envío no ofrece nada", () => {
    expect(manualDeliveryContext(null)).toEqual({ zones: [], favorite: null });
  });
});
