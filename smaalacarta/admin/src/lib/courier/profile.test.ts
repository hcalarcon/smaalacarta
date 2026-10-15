import { describe, expect, it } from "vitest";

import { EMPTY_PREFERENCES, NOTE_MAX, fromRow, validatePreferences } from "./profile";

describe("validatePreferences — ADMIN-REPARTIDOR-2", () => {
  it("recorta el texto y acepta las casillas", () => {
    expect(validatePreferences({ shopsOnTheWay: true, seeksOrders: false, note: "  Paso por la farmacia " })).toEqual({
      ok: true,
      value: { shopsOnTheWay: true, seeksOrders: false, note: "Paso por la farmacia" },
    });
  });

  it("el texto es opcional y tiene hasta 140 caracteres", () => {
    expect(NOTE_MAX).toBe(140);
    expect(validatePreferences({ shopsOnTheWay: false, seeksOrders: false })).toEqual({
      ok: true,
      value: EMPTY_PREFERENCES,
    });
    expect(validatePreferences({ note: "x".repeat(140) }).ok).toBe(true);
    expect(validatePreferences({ note: "x".repeat(141) }).ok).toBe(false);
  });

  it("lo que no es booleano o no es un objeto no cuenta como marcado", () => {
    expect(validatePreferences({ shopsOnTheWay: "true", seeksOrders: 1 })).toEqual({
      ok: true,
      value: EMPTY_PREFERENCES,
    });
    for (const bad of [null, undefined, "x", 5]) expect(validatePreferences(bad).ok, String(bad)).toBe(false);
  });
});

describe("fromRow", () => {
  it("sin fila, todo apagado", () => {
    expect(fromRow(null)).toEqual(EMPTY_PREFERENCES);
  });

  it("con fila, la traduce", () => {
    expect(fromRow({ shops_on_the_way: true, seeks_orders: false, note: null })).toEqual({
      shopsOnTheWay: true,
      seeksOrders: false,
      note: "",
    });
  });
});
