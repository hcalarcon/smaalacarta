import { describe, expect, it } from "vitest";

import { DAYS, normalizeSchedule, parseRange, validateSchedule } from "./schedule";

describe("DAYS", () => {
  it("van de lunes a domingo, con las claves del menú web (sin tildes)", () => {
    expect(DAYS.map((d) => d.key)).toEqual([
      "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
    ]);
  });
});

describe("parseRange — ADMIN-CONFIG-2", () => {
  it("lee un rango en minutos", () => {
    expect(parseRange("12:00-15:30")).toEqual({ start: 720, end: 930 });
  });

  it("un rango que cruza la medianoche termina al día siguiente", () => {
    expect(parseRange("20:00-02:00")).toEqual({ start: 1200, end: 1560 });
  });

  it.each(["", "9:00-10:00", "09:00-10", "09:00 - 10:00", "24:00-01:00", "09:60-10:00", "abc", "10:00-10:00"])(
    "rechaza %j",
    (value) => {
      expect(parseRange(value)).toBeNull();
    },
  );
});

describe("validateSchedule — ADMIN-CONFIG-2", () => {
  it("acepta un horario normal con días cerrados", () => {
    expect(
      validateSchedule({
        lunes: ["12:00-15:00", "20:00-23:30"],
        viernes: ["20:00-01:00"],
        domingo: [],
      }),
    ).toEqual({ ok: true });
  });

  it("acepta no tener horarios cargados", () => {
    expect(validateSchedule({})).toEqual({ ok: true });
  });

  it("informa el día con un rango inválido", () => {
    const r = validateSchedule({ lunes: ["12:00-15:00"], martes: ["25:00-26:00"] });
    expect(r.ok === false && Object.keys(r.errors)).toEqual(["martes"]);
  });

  it("rechaza un rango de duración cero", () => {
    const r = validateSchedule({ lunes: ["10:00-10:00"] });
    expect(r.ok === false && r.errors.lunes).toBeTruthy();
  });

  it("rechaza rangos superpuestos en un mismo día", () => {
    const r = validateSchedule({ lunes: ["12:00-15:00", "14:00-16:00"] });
    expect(r.ok === false && r.errors.lunes).toMatch(/superpon/i);
  });

  it("detecta la superposición con un rango que cruza la medianoche", () => {
    const r = validateSchedule({ sabado: ["22:00-02:00", "23:00-23:30"] });
    expect(r.ok === false && r.errors.sabado).toBeTruthy();
  });

  it("la madrugada del mismo día no se superpone con un rango que cruza la medianoche", () => {
    // 22:00-02:00 termina a la madrugada del día siguiente; 01:00-03:00 es la de hoy.
    expect(validateSchedule({ sabado: ["22:00-02:00", "01:00-03:00"] })).toEqual({ ok: true });
  });

  it("rangos consecutivos que se tocan no se superponen", () => {
    expect(validateSchedule({ lunes: ["12:00-15:00", "15:00-18:00"] })).toEqual({ ok: true });
  });

  it("no importa en qué orden se cargaron", () => {
    const r = validateSchedule({ lunes: ["20:00-23:00", "12:00-15:00"] });
    expect(r).toEqual({ ok: true });
  });

  it("rechaza un día desconocido", () => {
    const r = validateSchedule({ lunez: ["10:00-12:00"] } as never);
    expect(r.ok === false && r.errors.lunez).toBeTruthy();
  });
});

describe("normalizeSchedule", () => {
  it("ordena los rangos de cada día por hora de inicio", () => {
    expect(normalizeSchedule({ lunes: ["20:00-23:00", "12:00-15:00"] })).toEqual({
      lunes: ["12:00-15:00", "20:00-23:00"],
    });
  });

  it("conserva los días cerrados (lista vacía)", () => {
    expect(normalizeSchedule({ domingo: [] })).toEqual({ domingo: [] });
  });

  it("descarta rangos vacíos que quedaron de un formulario a medias", () => {
    expect(normalizeSchedule({ lunes: ["", "12:00-15:00", "  "] })).toEqual({
      lunes: ["12:00-15:00"],
    });
  });

  it("no modifica lo que recibe", () => {
    const input = { lunes: ["20:00-23:00", "12:00-15:00"] };
    normalizeSchedule(input);
    expect(input.lunes).toEqual(["20:00-23:00", "12:00-15:00"]);
  });
});
