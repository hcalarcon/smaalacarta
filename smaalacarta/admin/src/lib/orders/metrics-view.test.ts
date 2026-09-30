import { describe, expect, it } from "vitest";

import { barPercent, parseDays, peakHour, peakHourText, periodCopy } from "./metrics-view";

describe("parseDays — ADMIN-METRICAS-9", () => {
  it("acepta 7 y 30", () => {
    expect(parseDays("7")).toBe(7);
    expect(parseDays("30")).toBe(30);
  });

  it("cualquier otro valor es 7", () => {
    for (const value of ["", "15", "abc", "-7", "7.5", "30abc", undefined, ["30", "7"]]) {
      expect(parseDays(value as string | undefined)).toBe(7);
    }
  });
});

describe("periodCopy — ADMIN-METRICAS-9", () => {
  it("7 días se compara con la semana anterior", () => {
    expect(periodCopy(7)).toEqual({ label: "7 días", versus: "semana anterior" });
  });

  it("30 días se compara con los 30 días anteriores", () => {
    expect(periodCopy(30)).toEqual({ label: "30 días", versus: "30 días anteriores" });
  });
});

describe("barPercent — ADMIN-METRICAS-10", () => {
  it("el mayor llena la barra", () => {
    expect(barPercent(8, 8)).toBe(100);
  });

  it("los demás van en proporción, en enteros", () => {
    expect(barPercent(2, 8)).toBe(25);
    expect(barPercent(1, 3)).toBe(33);
  });

  it("sin máximo no hay barra, sin dividir por cero", () => {
    expect(barPercent(0, 0)).toBe(0);
  });

  it("un valor chico pero mayor que cero se sigue viendo", () => {
    expect(barPercent(1, 1000)).toBe(1);
  });
});

describe("peakHour y peakHourText — ADMIN-METRICAS-10", () => {
  const hours = (entries: Record<number, number>) =>
    Array.from({ length: 24 }, (_, h) => entries[h] ?? 0);

  it("es la hora con más pedidos", () => {
    expect(peakHour(hours({ 13: 4, 21: 9 }))).toBe(21);
    expect(peakHourText(hours({ 13: 4, 21: 9 }))).toBe("Tu hora fuerte: 21 h");
  });

  it("en empate gana la más temprana", () => {
    expect(peakHour(hours({ 12: 5, 20: 5 }))).toBe(12);
  });

  it("sin pedidos no hay hora fuerte", () => {
    expect(peakHour(hours({}))).toBeNull();
    expect(peakHourText(hours({}))).toBeNull();
  });
});
