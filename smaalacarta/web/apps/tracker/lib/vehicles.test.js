import { describe, expect, it } from "vitest";

import { DICTIONARY, LANGS } from "../../menu-app/lib/i18n.js";
import { ICON_KEYS } from "./icons.js";
import { normalizeVehicles, vehicleLabel } from "./vehicles.js";

// ENVIO-178: el vehículo del repartidor en el seguimiento.
describe("normalizeVehicles", () => {
  it("deja solo moto y auto, en ese orden, sin repetir", () => {
    expect(normalizeVehicles(["auto", "moto", "auto"])).toEqual(["moto", "auto"]);
    expect(normalizeVehicles(["moto"])).toEqual(["moto"]);
  });

  it("descarta lo desconocido (no hay bici)", () => {
    expect(normalizeVehicles(["bici", "auto"])).toEqual(["auto"]);
    expect(normalizeVehicles(["bici"])).toEqual([]);
  });

  it("lo que no es una lista no se muestra", () => {
    expect(normalizeVehicles(undefined)).toEqual([]);
    expect(normalizeVehicles(null)).toEqual([]);
    expect(normalizeVehicles("moto")).toEqual([]);
    expect(normalizeVehicles([{ moto: true }])).toEqual([]);
  });
});

describe("vehicleLabel — es/en/pt", () => {
  it("dice el vehículo en cada idioma", () => {
    expect(vehicleLabel(["moto"], "es")).toBe("Moto");
    expect(vehicleLabel(["auto"], "es")).toBe("Auto");
    expect(vehicleLabel(["moto", "auto"], "es")).toBe("Moto y auto");
    expect(vehicleLabel(["moto"], "en")).toBe("Motorbike");
    expect(vehicleLabel(["auto"], "en")).toBe("Car");
    expect(vehicleLabel(["moto", "auto"], "en")).toBe("Motorbike and car");
    expect(vehicleLabel(["moto"], "pt")).toBe("Moto");
    expect(vehicleLabel(["auto"], "pt")).toBe("Carro");
    expect(vehicleLabel(["moto", "auto"], "pt")).toBe("Moto e carro");
  });

  it("sin vehículos no hay texto", () => {
    expect(vehicleLabel([], "es")).toBe("");
  });

  it("las tres claves existen en los tres idiomas", () => {
    for (const lang of LANGS) {
      for (const key of ["tracker.vehicle.moto", "tracker.vehicle.auto", "tracker.vehicle.both"]) {
        expect(DICTIONARY[lang][key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});

describe("íconos propios", () => {
  it("hay uno para la moto y otro para el auto", () => {
    expect(ICON_KEYS).toContain("vehicleMoto");
    expect(ICON_KEYS).toContain("vehicleAuto");
  });
});
