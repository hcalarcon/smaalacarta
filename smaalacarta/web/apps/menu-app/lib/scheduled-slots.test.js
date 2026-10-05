import { describe, expect, it } from "vitest";

import { scheduledSlots } from "./scheduled-slots.js";

// Argentina es UTC-3 todo el año. Lunes 5 de enero de 2026 (a las hh:mm hora argentina).
const at = (day, hh, mm = 0, ss = 0) => new Date(Date.UTC(2026, 0, 4 + day, hh + 3, mm, ss));
const LUN = 1, MAR = 2;

const values = (slots) => slots.map((s) => s.value);

describe("scheduledSlots — PUBLICO-29", () => {
  it("ofrece una hora cada 15 minutos desde ahora más la anticipación", () => {
    const slots = scheduledSlots({ lunes: ["09:00-12:00"] }, 30, at(LUN, 10, 0));
    expect(values(slots)).toEqual(["10:30", "10:45", "11:00", "11:15", "11:30", "11:45"]);
  });

  it("redondea hacia arriba: nunca ofrece una hora que quede antes de la anticipación", () => {
    expect(values(scheduledSlots({ lunes: ["09:00-12:00"] }, 30, at(LUN, 10, 1)))[0]).toBe("10:45");
    // Con segundos de más, las 10:30 ya no llegan a media hora de anticipación.
    expect(values(scheduledSlots({ lunes: ["09:00-12:00"] }, 30, at(LUN, 10, 0, 30)))[0]).toBe("10:45");
  });

  it("el cierre del rango no se ofrece y el inicio sí", () => {
    const slots = values(scheduledSlots({ lunes: ["18:00-19:00"] }, 15, at(LUN, 8)));
    expect(slots).toEqual(["18:00", "18:15", "18:30", "18:45"]);
  });

  it("con dos turnos salta el cierre entre ellos", () => {
    const slots = values(scheduledSlots({ lunes: ["12:00-13:00", "20:00-21:00"] }, 15, at(LUN, 12, 30)));
    expect(slots).toEqual(["12:45", "20:00", "20:15", "20:30", "20:45"]);
  });

  it("un rango nocturno llega hasta el final del día y no pasa a mañana", () => {
    const slots = values(scheduledSlots({ martes: ["20:00-02:00"] }, 15, at(MAR, 22)));
    expect(slots).toEqual(["22:15", "22:30", "22:45", "23:00", "23:15", "23:30", "23:45"]);
  });

  it("la madrugada de hoy cuenta con el rango nocturno de ayer", () => {
    const slots = values(scheduledSlots({ lunes: ["20:00-02:00"] }, 15, at(MAR, 0, 10)));
    expect(slots).toEqual(["00:30", "00:45", "01:00", "01:15", "01:30", "01:45"]);
  });

  it("sin horarios cargados ofrece todo lo que queda de hoy", () => {
    const slots = values(scheduledSlots({}, 60, at(LUN, 21, 50)));
    expect(slots).toEqual(["23:00", "23:15", "23:30", "23:45"]);
    expect(values(scheduledSlots(undefined, 60, at(LUN, 21, 50)))).toEqual(slots);
  });

  it("si ya no queda ninguna hora, devuelve una lista vacía", () => {
    expect(scheduledSlots({ lunes: ["09:00-12:00"] }, 30, at(LUN, 11, 40))).toEqual([]);
    expect(scheduledSlots({ lunes: ["09:00-12:00"] }, 30, at(MAR, 10))).toEqual([]);
    expect(scheduledSlots({}, 240, at(LUN, 23, 0))).toEqual([]);
  });

  it("usa la hora de Argentina sin importar la zona del equipo", () => {
    // 02:30 UTC del martes 6 = lunes 5 a las 23:30 en Argentina.
    const slots = values(scheduledSlots({}, 15, new Date("2026-01-06T02:30:00Z")));
    expect(slots).toEqual(["23:45"]);
  });

  it("cada opción trae el instante exacto (ISO) para mandar al servidor", () => {
    const [first] = scheduledSlots({ lunes: ["09:00-12:00"] }, 30, at(LUN, 10, 0));
    expect(first).toEqual({ value: "10:30", iso: "2026-01-05T13:30:00.000Z" });
  });

  it("una anticipación inválida usa 30 minutos", () => {
    const base = values(scheduledSlots({}, 30, at(LUN, 10, 0)));
    expect(values(scheduledSlots({}, undefined, at(LUN, 10, 0)))).toEqual(base);
    expect(values(scheduledSlots({}, "x", at(LUN, 10, 0)))).toEqual(base);
  });
});
