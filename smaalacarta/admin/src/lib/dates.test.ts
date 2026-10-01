import { describe, expect, it } from "vitest";

import { argentinaHour, argentinaWeekday, startOfDayInArgentina, startOfTodayInArgentina } from "./dates";

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

describe("startOfDayInArgentina — ADMIN-METRICAS-1", () => {
  it("sin días atrás es el comienzo de hoy", () => {
    expect(startOfDayInArgentina(new Date("2026-03-10T18:30:00Z")).toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("retrocede días enteros, cruzando el cambio de mes", () => {
    expect(startOfDayInArgentina(new Date("2026-03-02T18:30:00Z"), 3).toISOString()).toBe("2026-02-27T03:00:00.000Z");
  });

  it("de madrugada en UTC sigue contando desde el día argentino anterior", () => {
    expect(startOfDayInArgentina(new Date("2026-03-10T01:00:00Z"), 1).toISOString()).toBe("2026-03-08T03:00:00.000Z");
  });
});

describe("argentinaHour — ADMIN-METRICAS-1", () => {
  it("las 02:30 UTC son las 23 en Argentina", () => {
    expect(argentinaHour(new Date("2026-03-11T02:30:00Z"))).toBe(23);
  });

  it("las 03:00 UTC son las 0", () => {
    expect(argentinaHour(new Date("2026-03-11T03:00:00Z"))).toBe(0);
  });

  it("las 12:00 UTC son las 9", () => {
    expect(argentinaHour(new Date("2026-03-11T12:00:00Z"))).toBe(9);
  });
});

describe("argentinaWeekday — ADMIN-METRICAS-1", () => {
  it("0 es lunes", () => {
    expect(argentinaWeekday(new Date("2026-03-09T15:00:00Z"))).toBe(0); // lunes 9
  });

  it("6 es domingo", () => {
    expect(argentinaWeekday(new Date("2026-03-15T15:00:00Z"))).toBe(6);
  });

  it("a las 02:30 UTC todavía es el día anterior", () => {
    // martes 10 02:30 UTC = lunes 9 23:30 en Argentina.
    expect(argentinaWeekday(new Date("2026-03-10T02:30:00Z"))).toBe(0);
  });
});
