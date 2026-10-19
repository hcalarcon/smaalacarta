import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_TEXTS,
  availableCountText,
  businessFromRow,
  isFreshActivity,
  orderZoneIsEmpty,
  pickAvailabilityLang,
  statusFromRow,
} from "./availability";

// ENVIO-191 a 202: reglas puras de la disponibilidad de los repartidores.
describe("statusFromRow — ENVIO-191", () => {
  it("lee lo que dice la base", () => {
    expect(
      statusFromRow({ enabled: true, available: true, since: "2026-10-19T15:00:00+00:00", expires_at: "2026-10-19T19:00:00+00:00" }),
    ).toEqual({
      enabled: true,
      available: true,
      since: "2026-10-19T15:00:00+00:00",
      expiresAt: "2026-10-19T19:00:00+00:00",
    });
  });

  it("ante datos raros queda sin interruptor y no disponible", () => {
    expect(statusFromRow(null)).toEqual({ enabled: false, available: false, since: null, expiresAt: null });
  });
});

describe("textos — ENVIO-191", () => {
  it("las tres lenguas tienen las mismas claves y el texto de la hora", () => {
    for (const lang of ["es", "en", "pt"] as const) {
      const t = AVAILABILITY_TEXTS[lang];
      expect(Object.keys(t).sort()).toEqual(Object.keys(AVAILABILITY_TEXTS.es).sort());
      expect(t.since("14:05")).toContain("14:05");
    }
    expect(AVAILABILITY_TEXTS.es.on).toBe("Conectado");
    expect(AVAILABILITY_TEXTS.es.off).toBe("No conectado");
    expect(AVAILABILITY_TEXTS.es.since("14:05")).toBe("Disponible desde las 14:05");
  });

  it("elige por el idioma del navegador y cae al español", () => {
    expect(pickAvailabilityLang("pt-BR,pt;q=0.9")).toBe("pt");
    expect(pickAvailabilityLang("en-US")).toBe("en");
    expect(pickAvailabilityLang("fr")).toBe("es");
    expect(pickAvailabilityLang(null)).toBe("es");
  });
});

describe("el local — ENVIO-200", () => {
  it("lee el conteo y las zonas vacías", () => {
    expect(businessFromRow({ enabled: true, total: 3, empty_zone_ids: ["z1"] })).toEqual({
      enabled: true,
      total: 3,
      emptyZoneIds: ["z1"],
    });
  });

  it("apagado o roto, no muestra nada", () => {
    expect(businessFromRow({ enabled: false })).toEqual({ enabled: false, total: 0, emptyZoneIds: [] });
    expect(businessFromRow(null).enabled).toBe(false);
  });

  it("el texto: la cantidad, o ámbar con 0", () => {
    expect(availableCountText(2)).toBe("Repartidores disponibles ahora: 2");
    expect(availableCountText(0)).toBe("Ningún repartidor disponible");
  });

  it("marca el pedido con envío sin repartidor cuya zona está en 0", () => {
    const a = { enabled: true, total: 0, emptyZoneIds: ["z1"] };

    expect(orderZoneIsEmpty({ delivery_zone_id: "z1", courier_status: "searching", courier_id: null }, a)).toBe(true);
    expect(orderZoneIsEmpty({ delivery_zone_id: "z1", courier_status: "waiting", courier_id: null }, a)).toBe(true);
    // Con repartidor, o en otra zona, o ya entregado, o con el interruptor apagado: nada.
    expect(orderZoneIsEmpty({ delivery_zone_id: "z1", courier_status: "accepted", courier_id: "c" }, a)).toBe(false);
    expect(orderZoneIsEmpty({ delivery_zone_id: "z2", courier_status: "searching", courier_id: null }, a)).toBe(false);
    expect(orderZoneIsEmpty({ delivery_zone_id: "z1", courier_status: null, courier_id: null }, a)).toBe(false);
    expect(
      orderZoneIsEmpty({ delivery_zone_id: "z1", courier_status: "searching", courier_id: null }, { ...a, enabled: false }),
    ).toBe(false);
  });
});

describe("actividad reciente — ENVIO-201", () => {
  const now = new Date("2026-10-19T20:00:00Z");

  it("cuenta si pasaron menos de 4 horas", () => {
    expect(isFreshActivity("2026-10-19T16:30:00Z", now)).toBe(true);
    expect(isFreshActivity("2026-10-19T15:59:00Z", now)).toBe(false);
    expect(isFreshActivity(null, now)).toBe(false);
    expect(isFreshActivity("basura", now)).toBe(false);
  });
});
