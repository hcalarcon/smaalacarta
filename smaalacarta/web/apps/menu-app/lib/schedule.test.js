import { describe, expect, it } from "vitest";

import { isOpenNow, localClock, nextOpening, openingText } from "./schedule.js";

// Argentina es UTC-3 todo el año. Lunes 5 de enero de 2026 (a las hh:mm hora argentina).
const at = (day, hh, mm = 0) => new Date(Date.UTC(2026, 0, 4 + day, hh + 3, mm));
const LUN = 1, MAR = 2, MIE = 3, DOM = 0;

const semana = {
  lunes: ["09:00-13:00", "18:00-23:00"],
  martes: ["20:00-02:00"],
  miercoles: [],
  jueves: ["10:00-14:00"],
};

describe("localClock — PUBLICO-12", () => {
  it("usa la hora de Argentina sin importar la zona del equipo", () => {
    expect(localClock(new Date("2026-01-05T02:30:00Z"))).toEqual({ day: 0, minutes: 23 * 60 + 30 }); // domingo 23:30
    expect(localClock(new Date("2026-01-05T03:00:00Z"))).toEqual({ day: 1, minutes: 0 }); // lunes 00:00
  });
});

describe("isOpenNow — PUBLICO-12", () => {
  it("sin horarios está siempre abierto", () => {
    expect(isOpenNow(undefined, at(LUN, 3))).toBe(true);
    expect(isOpenNow(null, at(LUN, 3))).toBe(true);
    expect(isOpenNow({}, at(LUN, 3))).toBe(true);
  });

  it("el inicio cuenta y el cierre no", () => {
    expect(isOpenNow(semana, at(LUN, 8, 59))).toBe(false);
    expect(isOpenNow(semana, at(LUN, 9, 0))).toBe(true);
    expect(isOpenNow(semana, at(LUN, 12, 59))).toBe(true);
    expect(isOpenNow(semana, at(LUN, 13, 0))).toBe(false);
  });

  it("con dos turnos, entre ellos está cerrado", () => {
    expect(isOpenNow(semana, at(LUN, 15))).toBe(false);
    expect(isOpenNow(semana, at(LUN, 19))).toBe(true);
  });

  it("un día con lista vacía o sin cargar está cerrado", () => {
    expect(isOpenNow(semana, at(MIE, 12))).toBe(false);
    expect(isOpenNow(semana, at(DOM, 12))).toBe(false);
  });

  it("un rango nocturno abre esa noche y sigue en la madrugada del día siguiente", () => {
    expect(isOpenNow(semana, at(MAR, 19, 59))).toBe(false);
    expect(isOpenNow(semana, at(MAR, 20))).toBe(true);
    expect(isOpenNow(semana, at(MAR, 23, 30))).toBe(true);
    expect(isOpenNow(semana, at(MIE, 1, 59))).toBe(true); // madrugada del miércoles: sigue el del martes
    expect(isOpenNow(semana, at(MIE, 2, 0))).toBe(false);
  });

  it("la madrugada usa el día anterior, no el de hoy", () => {
    // El martes a la 01:00 todavía no empezó el horario nocturno del martes.
    expect(isOpenNow(semana, at(MAR, 1))).toBe(false);
  });

  it("un rango que termina a las 00:00 llega hasta el fin del día", () => {
    const h = { lunes: ["12:00-00:00"] };
    expect(isOpenNow(h, at(LUN, 23, 59))).toBe(true);
    expect(isOpenNow(h, at(MAR, 0, 0))).toBe(false);
  });

  it("ignora rangos mal formados", () => {
    expect(isOpenNow({ lunes: ["basura", "9-13"] }, at(LUN, 10))).toBe(false);
  });
});

describe("nextOpening — PUBLICO-12", () => {
  it("el próximo turno del mismo día", () => {
    expect(nextOpening(semana, at(LUN, 15))).toEqual({ day: "hoy", time: "18:00" });
  });

  it("si hoy ya no abre, el primer turno de un día siguiente", () => {
    expect(nextOpening(semana, at(LUN, 23, 30))).toEqual({ day: "mañana", time: "20:00" });
  });

  it("después de un día cerrado nombra el día", () => {
    expect(nextOpening(semana, at(MAR, 22))).toEqual({ day: "jueves", time: "10:00" });
  });

  it("sin horarios, o sin ningún rango en la semana, no hay próximo horario", () => {
    expect(nextOpening({}, at(LUN, 15))).toBeNull();
    expect(nextOpening({ lunes: [], martes: [] }, at(LUN, 15))).toBeNull();
  });
});

describe("openingText — SEGUIMIENTO-9", () => {
  it("arma la frase del aviso", () => {
    expect(openingText({ day: "hoy", time: "18:00" })).toBe("Abrimos hoy a las 18:00");
    expect(openingText({ day: "mañana", time: "20:00" })).toBe("Abrimos mañana a las 20:00");
    expect(openingText({ day: "jueves", time: "10:00" })).toBe("Abrimos el jueves a las 10:00");
    expect(openingText(null)).toBe("");
  });
});
