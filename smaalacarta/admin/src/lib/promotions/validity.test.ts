import { describe, expect, it } from "vitest";

import {
  argentinaDate,
  endShortcuts,
  endsAtIso,
  formatEnd,
  promotionStatus,
  splitEnd,
} from "./validity";

// Argentina es UTC-3 todo el año: las 23:59 argentinas son las 02:59 UTC del día siguiente.
describe("fecha y hora de fin — ADMIN-PROMO-5", () => {
  it("sin hora, termina a las 23:59 de Argentina", () => {
    expect(endsAtIso("2026-10-20")).toBe("2026-10-21T02:59:00.000Z");
  });

  it("con hora, la toma como hora de Argentina", () => {
    expect(endsAtIso("2026-10-20", "18:30")).toBe("2026-10-20T21:30:00.000Z");
    expect(endsAtIso("2026-10-20", "")).toBe("2026-10-21T02:59:00.000Z");
  });

  it.each([
    ["", "23:59"],
    ["20/10/2026", "23:59"],
    ["2026-13-01", "23:59"],
    ["2026-02-31", "23:59"],
    ["2026-10-20", "25:00"],
    ["2026-10-20", "9:5"],
  ])("rechaza %j %j", (date, time) => {
    expect(endsAtIso(date, time)).toBeNull();
  });

  it("splitEnd devuelve la fecha y la hora de Argentina de un instante", () => {
    expect(splitEnd("2026-10-21T02:59:00.000Z")).toEqual({ date: "2026-10-20", time: "23:59" });
    expect(splitEnd("2026-10-20T21:30:00Z")).toEqual({ date: "2026-10-20", time: "18:30" });
  });

  it("splitEnd de nada o de algo roto es vacío", () => {
    expect(splitEnd(null)).toEqual({ date: "", time: "" });
    expect(splitEnd("no es una fecha")).toEqual({ date: "", time: "" });
  });

  it("ida y vuelta", () => {
    const iso = endsAtIso("2026-12-31", "00:00");
    expect(splitEnd(iso)).toEqual({ date: "2026-12-31", time: "00:00" });
  });

  it("formatEnd muestra día/mes y hora", () => {
    expect(formatEnd("2026-10-21T02:59:00Z")).toBe("20/10 a las 23:59");
    expect(formatEnd(null)).toBe("");
  });
});

describe("la fecha de hoy y los atajos — ADMIN-PROMO-5", () => {
  it("hoy es el día de Argentina, no el de UTC", () => {
    // 01:00 UTC del 21 son las 22:00 del 20 en Argentina.
    expect(argentinaDate(new Date("2026-10-21T01:00:00Z"))).toBe("2026-10-20");
    expect(argentinaDate(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-21");
  });

  it("el fin de semana es el próximo domingo", () => {
    // Martes 20/10/2026.
    expect(endShortcuts(new Date("2026-10-20T15:00:00Z"))).toEqual({ today: "2026-10-20", weekend: "2026-10-25" });
  });

  it("un sábado, el fin de semana es mañana; un domingo, hoy", () => {
    expect(endShortcuts(new Date("2026-10-24T15:00:00Z"))).toEqual({ today: "2026-10-24", weekend: "2026-10-25" });
    expect(endShortcuts(new Date("2026-10-25T15:00:00Z"))).toEqual({ today: "2026-10-25", weekend: "2026-10-25" });
  });
});

describe("estado en la lista — ADMIN-PROMO-11", () => {
  const now = new Date("2026-10-20T15:00:00Z"); // martes 12:00 en Argentina

  const status = (validUntil: string | null, remaining: number | null = null) =>
    promotionStatus({ validUntil, remaining, now }).key;

  it("sin vigencia ni stock es vigente", () => {
    expect(status(null)).toBe("vigente");
  });

  it("con fin dentro de unos días es vigente", () => {
    expect(status(endsAtIso("2026-10-25"))).toBe("vigente");
  });

  it("vence hoy y vence mañana, por día de Argentina", () => {
    expect(status(endsAtIso("2026-10-20"))).toBe("vence_hoy");
    expect(status(endsAtIso("2026-10-21"))).toBe("vence_manana");
  });

  it("vencida cuando ya pasó la hora", () => {
    expect(status("2026-10-20T14:59:59Z")).toBe("vencida");
  });

  it("agotada cuando no queda ninguna", () => {
    expect(status(null, 0)).toBe("agotada");
    expect(status(null, 3)).toBe("vigente");
  });

  it("vencida gana a agotada, y agotada a 'vence hoy'", () => {
    expect(status("2026-10-20T14:00:00Z", 0)).toBe("vencida");
    expect(status(endsAtIso("2026-10-20"), 0)).toBe("agotada");
  });

  it("lleva su texto", () => {
    expect(promotionStatus({ validUntil: endsAtIso("2026-10-21"), remaining: null, now }).label).toBe("Vence mañana");
    expect(promotionStatus({ validUntil: null, remaining: 0, now }).label).toBe("Agotada");
  });
});
