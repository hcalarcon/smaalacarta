import { describe, expect, it } from "vitest";

import { startOfTodayInArgentina } from "./dates";

describe("startOfTodayInArgentina — ADMIN-RESUMEN-1", () => {
  it("a la tarde argentina, hoy empezó a las 03:00 UTC de ese día", () => {
    expect(startOfTodayInArgentina(new Date("2026-03-10T18:30:00Z")).toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("de madrugada en UTC todavía es el día anterior en Argentina", () => {
    // 01:00 UTC del 10 = 22:00 del 9 en Argentina.
    expect(startOfTodayInArgentina(new Date("2026-03-10T01:00:00Z")).toISOString()).toBe("2026-03-09T03:00:00.000Z");
  });

  it("justo a las 00:00 argentinas empieza el día nuevo", () => {
    expect(startOfTodayInArgentina(new Date("2026-03-10T03:00:00Z")).toISOString()).toBe("2026-03-10T03:00:00.000Z");
    expect(startOfTodayInArgentina(new Date("2026-03-10T02:59:59Z")).toISOString()).toBe("2026-03-09T03:00:00.000Z");
  });

  it("cruza bien el cambio de año", () => {
    expect(startOfTodayInArgentina(new Date("2026-01-01T02:00:00Z")).toISOString()).toBe("2025-12-31T03:00:00.000Z");
  });
});
