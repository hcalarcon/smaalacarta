import { describe, expect, it } from "vitest";

import { canTake, fromRow, parseVehicles, validateVehicles, vehiclesLabel } from "./vehicle";

// ENVIO-174 a 178: reglas puras del vehículo del repartidor.
describe("validateVehicles — ENVIO-174", () => {
  it("acepta moto, auto o los dos", () => {
    expect(validateVehicles({ moto: true, auto: false })).toEqual({ ok: true, value: { moto: true, auto: false } });
    expect(validateVehicles({ moto: false, auto: true })).toEqual({ ok: true, value: { moto: false, auto: true } });
    expect(validateVehicles({ moto: true, auto: true })).toEqual({ ok: true, value: { moto: true, auto: true } });
  });

  it("exige al menos uno", () => {
    expect(validateVehicles({ moto: false, auto: false }).ok).toBe(false);
    expect(validateVehicles({}).ok).toBe(false);
    expect(validateVehicles(null).ok).toBe(false);
  });

  it("solo toma booleanos de verdad", () => {
    expect(validateVehicles({ moto: "true", auto: 1 }).ok).toBe(false);
  });
});

describe("fromRow", () => {
  it("sin fila queda Moto", () => {
    expect(fromRow(null)).toEqual({ moto: true, auto: false });
    expect(fromRow({ moto: false, auto: true })).toEqual({ moto: false, auto: true });
  });
});

describe("parseVehicles / vehiclesLabel — ENVIO-178", () => {
  it("deja solo moto y auto, en ese orden", () => {
    expect(parseVehicles(["auto", "moto"])).toEqual(["moto", "auto"]);
    expect(parseVehicles(["bici", "auto"])).toEqual(["auto"]);
  });

  it("lo que no es una lista no se muestra", () => {
    expect(parseVehicles(undefined)).toEqual([]);
    expect(parseVehicles(null)).toEqual([]);
    expect(parseVehicles("moto")).toEqual([]);
  });

  it("arma el texto accesible", () => {
    expect(vehiclesLabel(["moto"])).toBe("Moto");
    expect(vehiclesLabel(["auto"])).toBe("Auto");
    expect(vehiclesLabel(["moto", "auto"])).toBe("Moto y auto");
    expect(vehiclesLabel([])).toBe("");
  });
});

describe("canTake — ENVIO-177", () => {
  it("un pedido que necesita auto solo lo lleva quien tiene auto", () => {
    expect(canTake(["moto"], { needs_car: true }, true)).toBe(false);
    expect(canTake(["moto", "auto"], { needs_car: true }, true)).toBe(true);
    expect(canTake(undefined, { needs_car: true }, true)).toBe(false);
  });

  it("un pedido normal lo lleva cualquiera", () => {
    expect(canTake(["moto"], { needs_car: false }, true)).toBe(true);
    expect(canTake(["moto"], {}, true)).toBe(true);
  });

  it("con el interruptor apagado no se filtra a nadie", () => {
    expect(canTake(["moto"], { needs_car: true }, false)).toBe(true);
  });
});
