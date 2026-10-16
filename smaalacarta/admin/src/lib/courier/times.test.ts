import { describe, expect, it } from "vitest";

import { ETA_QUICK_MINUTES, etaLabel, readyChange, readyLine, validateEta } from "./times";

// 2026-10-12T00:35:00Z es 21:35 en Argentina (UTC-3).
const READY = "2026-10-12T00:35:00Z";

describe("tiempos del repartidor — ENVIO-157 y 163", () => {
  it("los botones rápidos son 5, 10, 15, 20 y 30", () => {
    expect([...ETA_QUICK_MINUTES]).toEqual([5, 10, 15, 20, 30]);
  });

  it("el campo libre va de 1 a 120, entero", () => {
    expect(validateEta(1)).toEqual({ ok: true, minutes: 1 });
    expect(validateEta("120")).toEqual({ ok: true, minutes: 120 });
    for (const bad of [0, 121, -3, 7.5, "", "abc", null, undefined]) {
      expect(validateEta(bad).ok).toBe(false);
    }
  });

  it("la línea del pedido disponible lleva la hora y la demora", () => {
    expect(readyLine(READY, 45)).toBe("Listo para retirar a las 21:35 · Demora 45 min");
    expect(readyLine(READY, null)).toBe("Listo para retirar a las 21:35");
    expect(readyLine(null, 45)).toBeNull();
  });

  it("marca 'Cambió' solo si la hora cambió", () => {
    expect(readyChange({ listo_a: READY, listo_antes: "2026-10-12T00:05:00Z" })).toEqual({ now: "21:35", before: "21:05" });
    expect(readyChange({ listo_a: READY, listo_antes: null })).toBeNull();
    expect(readyChange({ listo_a: READY, listo_antes: READY })).toBeNull();
  });

  it("dice a qué hora llega", () => {
    expect(etaLabel("pickup", READY)).toBe("Llegás al local a las 21:35");
    expect(etaLabel("dropoff", READY)).toBe("Llegás al cliente a las 21:35");
    expect(etaLabel("pickup", null)).toBeNull();
  });
});
