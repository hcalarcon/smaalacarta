import { describe, expect, it } from "vitest";

import {
  activePreorder,
  preorderLabels,
  preorderMessageLine,
  preorderNotice,
  preorderThanks,
  preorderWindow,
} from "./preorders.js";

// Argentina es UTC-3 todo el año. Lunes 5 de octubre de 2026 (a las hh:mm hora argentina).
const at = (day, hh, mm = 0) => new Date(Date.UTC(2026, 9, 4 + day, hh + 3, mm));
const LUN = 1, MIE = 3, VIE = 5, SAB = 6, DOM = 7;

const sabado = { sabado: ["12:00-23:00"] };
const corteViernes = { sabado: { dia: "viernes", hora: "20:00" } };
const iso = (d) => d.toISOString();

describe("preorderWindow — PUBLICO-32", () => {
  it("cerrado, devuelve la próxima apertura y su corte", () => {
    const w = preorderWindow(sabado, corteViernes, at(MIE, 12));
    expect(iso(w.opensAt)).toBe("2026-10-10T15:00:00.000Z"); // sábado 12:00
    expect(iso(w.cutoffAt)).toBe("2026-10-09T23:00:00.000Z"); // viernes 20:00
    expect(w.day).toBe("sabado");
  });

  it("el corte se incluye en el cierre: a las 20:00 ya no, a las 19:59 sí", () => {
    expect(preorderWindow(sabado, corteViernes, at(VIE, 19, 59))).not.toBeNull();
    expect(preorderWindow(sabado, corteViernes, at(VIE, 20))).toBeNull();
  });

  it("después del corte y hasta que abre no toma nada; al abrir, pedido normal", () => {
    expect(preorderWindow(sabado, corteViernes, at(SAB, 11, 59))).toBeNull();
    expect(preorderWindow(sabado, corteViernes, at(SAB, 12))).toBeNull();
  });

  it("sin corte cargado para ese día no hay pedidos anticipados", () => {
    expect(preorderWindow(sabado, {}, at(MIE, 12))).toBeNull();
    expect(preorderWindow(sabado, { viernes: { dia: "jueves", hora: "20:00" } }, at(MIE, 12))).toBeNull();
    expect(preorderWindow(sabado, undefined, at(MIE, 12))).toBeNull();
  });

  it("sin horarios el negocio está siempre abierto: no hay anticipados", () => {
    expect(preorderWindow({}, corteViernes, at(MIE, 12))).toBeNull();
    expect(preorderWindow(undefined, corteViernes, at(MIE, 12))).toBeNull();
  });

  it("un corte del mismo día de venta, antes de abrir, vale ese día", () => {
    const cortes = { sabado: { dia: "sabado", hora: "08:00" } };
    expect(iso(preorderWindow(sabado, cortes, at(SAB, 7, 59)).cutoffAt)).toBe("2026-10-10T11:00:00.000Z");
    expect(preorderWindow(sabado, cortes, at(SAB, 8))).toBeNull();
  });

  it("un corte con una hora mayor a la apertura del mismo día cuenta de la semana anterior", () => {
    const cortes = { sabado: { dia: "sabado", hora: "14:00" } };
    // Sábado 10/10 12:00 → corte el sábado 3/10 14:00: ya pasó.
    expect(preorderWindow(sabado, cortes, at(MIE, 12))).toBeNull();
  });

  it("la próxima apertura puede ser de otra semana: el aviso corre hasta el corte", () => {
    const w = preorderWindow(sabado, corteViernes, at(DOM, 10)); // domingo 11/10, cerrado
    expect(iso(w.opensAt)).toBe("2026-10-17T15:00:00.000Z");
    expect(iso(w.cutoffAt)).toBe("2026-10-16T23:00:00.000Z");
  });

  it("usa la primera apertura del día para el corte; entre turnos ya pasó", () => {
    const dos = { sabado: ["12:00-15:00", "20:00-23:00"] };
    expect(iso(preorderWindow(dos, corteViernes, at(MIE, 12)).opensAt)).toBe("2026-10-10T15:00:00.000Z");
    // Sábado 16:00, cerrado entre turnos: el corte de ese día pasó.
    expect(preorderWindow(dos, corteViernes, at(SAB, 16))).toBeNull();
  });

  it("un rango nocturno que sigue en la madrugada es estar abierto", () => {
    const noche = { sabado: ["20:00-02:00"] };
    expect(preorderWindow(noche, corteViernes, at(DOM, 1))).toBeNull();
    expect(preorderWindow(noche, corteViernes, at(DOM, 3))).not.toBeNull();
  });

  it("el día de la apertura sale de la hora de Argentina, no de UTC", () => {
    // Domingo 00:30 en Argentina es 03:30 UTC del mismo día; sábado 22:00 argentino ya es domingo UTC.
    const noche = { domingo: ["00:30-03:00"] };
    const cortes = { domingo: { dia: "viernes", hora: "20:00" } };
    const w = preorderWindow(noche, cortes, at(MIE, 12));
    expect(iso(w.opensAt)).toBe("2026-10-11T03:30:00.000Z");
    expect(w.day).toBe("domingo");
  });
});

describe("activePreorder y etiquetas — PUBLICO-33", () => {
  const anticipados = {
    activo: true,
    proximaApertura: "2026-10-10T15:00:00.000Z",
    corte: "2026-10-09T23:00:00.000Z",
  };

  it("sin la clave del servidor o apagada, no hay pedido anticipado", () => {
    expect(activePreorder({}, at(MIE, 12))).toBeNull();
    expect(activePreorder({ anticipados: { ...anticipados, activo: false } }, at(MIE, 12))).toBeNull();
    expect(activePreorder({ anticipados: { activo: true, proximaApertura: "x", corte: "y" } }, at(MIE, 12))).toBeNull();
  });

  it("vale hasta el corte; con la página abierta de antes, pasado el corte ya no", () => {
    expect(activePreorder({ anticipados }, at(VIE, 19, 59))).not.toBeNull();
    expect(activePreorder({ anticipados }, at(VIE, 20))).toBeNull();
  });

  it("arma las fechas en hora de Argentina y en el idioma del cliente", () => {
    const w = activePreorder({ anticipados }, at(MIE, 12));
    expect(preorderLabels(w, "es")).toEqual({ date: "sábado 10/10", cutoff: "viernes 20:00" });
    expect(preorderLabels(w, "en")).toEqual({ date: "Saturday 10/10", cutoff: "Friday 20:00" });
    expect(preorderLabels(w, "pt")).toEqual({ date: "sábado 10/10", cutoff: "sexta 20:00" });
  });
});

describe("textos del pedido anticipado — PUBLICO-33 y 34", () => {
  const win = {
    opensAt: new Date("2026-10-10T15:00:00.000Z"),
    cutoffAt: new Date("2026-10-09T23:00:00.000Z"),
  };

  it("el aviso dice cuándo es y hasta cuándo se puede dejar el pedido", () => {
    expect(preorderNotice(win, "es")).toBe(
      "Cerrado ahora. Podés dejar tu pedido para el sábado 10/10 (hasta el viernes 20:00)",
    );
    expect(preorderNotice(win, "en")).toBe(
      "Closed now. You can leave your order for Saturday 10/10 (until Friday 20:00)",
    );
    expect(preorderNotice(win, "pt")).toBe(
      "Fechado agora. Você pode deixar seu pedido para sábado 10/10 (até sexta 20:00)",
    );
  });

  it("la pantalla de gracias dice para qué día es el pedido, en el idioma del cliente", () => {
    expect(preorderThanks(win, "es")).toBe("Tu pedido es para el sábado 10/10");
    expect(preorderThanks(win, "en")).toBe("Your order is for Saturday 10/10");
    expect(preorderThanks(win, "pt")).toBe("Seu pedido é para sábado 10/10");
  });

  it("el mensaje de WhatsApp para el negocio va siempre en español", () => {
    expect(preorderMessageLine(win)).toBe("📅 Pedido para el sábado 10/10");
  });
});
