import { describe, expect, it } from "vitest";

import { DICTIONARY, LANGS } from "../../menu-app/lib/i18n.js";
import { PREP_WINDOW_MINUTES, arrivalView, prepView } from "./prep.js";

// 21:30 y 21:40 en Argentina (UTC-3).
const DESDE = "2026-10-13T00:30:00Z";
const HASTA = "2026-10-13T00:40:00Z";
const prep = (extra = {}) => ({ desde: DESDE, hasta: HASTA, actualizado: "2026-10-13T00:10:00Z", ...extra });
const at = (iso) => new Date(iso);

describe("la ventana — SEGUIMIENTO-38", () => {
  it("es de 10 minutos", () => {
    expect(PREP_WINDOW_MINUTES).toBe(10);
  });
});

describe("antes de la ventana — SEGUIMIENTO-39", () => {
  it("dice entre qué horas estará listo (aprox.) y en cuántos minutos, en hora de Argentina", () => {
    const view = prepView(prep(), { now: at("2026-10-13T00:18:00Z"), lang: "es" });

    expect(view.kind).toBe("range");
    expect(view.text).toBe("Listo aprox. 21:30");
    expect(view.hint).toBe("faltan 12 min");
  });

  it("para retirar, dice desde qué hora puede pasar", () => {
    const view = prepView(prep(), { now: at("2026-10-13T00:18:00Z"), lang: "es", pickup: true });

    expect(view.text).toBe("Podés pasar a retirar desde las 21:30 (aprox.)");
    expect(view.hint).toBe("faltan 12 min");
  });

  it("la cuenta se actualiza con la hora y redondea hacia arriba", () => {
    const early = prepView(prep(), { now: at("2026-10-13T00:29:01Z"), lang: "es" });
    expect(early.hint).toBe("faltan 1 min");

    const before = prepView(prep(), { now: at("2026-10-13T00:00:00Z"), lang: "es" });
    expect(before.hint).toBe("faltan 30 min");
  });

  it("dentro de la ventana no muestra un número: dice que falta poco", () => {
    const view = prepView(prep(), { now: at("2026-10-13T00:34:00Z"), lang: "es" });

    expect(view.kind).toBe("range");
    expect(view.hint).toBe("Falta poco");
  });

  it("en inglés y en portugués, con la hora de Argentina", () => {
    const en = prepView(prep(), { now: at("2026-10-13T00:18:00Z"), lang: "en" });
    expect(en.text).toBe("Ready around 21:30");
    expect(en.hint).toBe("12 min to go");

    const pt = prepView(prep(), { now: at("2026-10-13T00:18:00Z"), lang: "pt" });
    expect(pt.text).toBe("Pronto por volta das 21:30");
    expect(pt.hint).toBe("faltam 12 min");
  });
});

describe("pasada la ventana — SEGUIMIENTO-40", () => {
  it("dice que se demora, sin horas ni números", () => {
    const view = prepView(prep(), { now: at("2026-10-13T00:55:00Z"), lang: "es" });

    expect(view.kind).toBe("late");
    expect(view.text).toBe("Unos minutos más");
    expect(view.hint).toBeNull();
    expect(view.text).not.toMatch(/\d/);
  });

  it("también en un pedido para retirar", () => {
    const view = prepView(prep(), { now: at("2026-10-13T00:40:00Z"), lang: "es", pickup: true });
    expect(view.kind).toBe("late");
  });
});

describe("el motivo — SEGUIMIENTO-41", () => {
  it("lo cuenta como texto amable", () => {
    const view = prepView(prep({ motivo: "busy" }), { now: at("2026-10-13T00:18:00Z"), lang: "es" });
    expect(view.reason).toBe("Ajustamos el horario por mucho movimiento.");

    expect(
      prepView(prep({ motivo: "weather" }), { now: at("2026-10-13T00:18:00Z"), lang: "es" }).reason,
    ).toBe("Ajustamos el horario por el clima.");
    expect(
      prepView(prep({ motivo: "supply" }), { now: at("2026-10-13T00:18:00Z"), lang: "es" }).reason,
    ).toBe("Ajustamos el horario por falta de un insumo.");
  });

  it("lo mantiene cuando ya se está demorando", () => {
    const view = prepView(prep({ motivo: "busy" }), { now: at("2026-10-13T01:00:00Z"), lang: "es" });
    expect(view.kind).toBe("late");
    expect(view.reason).toBe("Ajustamos el horario por mucho movimiento.");
  });

  it("'otro', un motivo desconocido o la falta de motivo no agregan nada", () => {
    for (const motivo of ["other", "lluvia", 42, null, undefined]) {
      const view = prepView(prep({ motivo }), { now: at("2026-10-13T00:18:00Z"), lang: "es" });
      expect(view.reason, String(motivo)).toBeNull();
    }
  });
});

describe("lo que no es válido — SEGUIMIENTO-42", () => {
  it("sin prep no muestra nada", () => {
    for (const bad of [undefined, null, {}, "x", 5]) {
      expect(prepView(bad, { now: new Date(), lang: "es" }), String(bad)).toBeNull();
    }
  });

  it("con fechas inválidas, o un hasta anterior al desde, no muestra nada", () => {
    expect(prepView({ desde: "nope", hasta: HASTA }, { now: new Date(), lang: "es" })).toBeNull();
    expect(prepView({ desde: DESDE, hasta: "nope" }, { now: new Date(), lang: "es" })).toBeNull();
    expect(prepView({ desde: HASTA, hasta: DESDE }, { now: new Date(), lang: "es" })).toBeNull();
  });

  it("los textos están en los tres idiomas", () => {
    const keys = Object.keys(DICTIONARY.es).filter((key) => key.startsWith("tracker.prep."));
    expect(keys.length).toBeGreaterThan(0);

    for (const lang of LANGS) {
      for (const key of keys) {
        expect(DICTIONARY[lang][key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});

describe("la hora de llegada del repartidor — SEGUIMIENTO-45", () => {
  // Llega a las 21:55 (Argentina).
  const LLEGA = Date.parse("2026-10-13T00:55:00Z");

  it("dice a qué hora llega y cuánto falta, y se va descontando", () => {
    const view = arrivalView(LLEGA, { now: at("2026-10-13T00:43:00Z"), lang: "es" });
    expect(view).toEqual({ kind: "range", text: "Llega aprox. 21:55", hint: "faltan 12 min" });

    expect(arrivalView(LLEGA, { now: at("2026-10-13T00:54:30Z"), lang: "es" }).hint).toBe("faltan 1 min");
  });

  it("pasada la hora dice 'Unos minutos más', sin números negativos", () => {
    for (const now of ["2026-10-13T00:55:00Z", "2026-10-13T01:20:00Z"]) {
      const view = arrivalView(LLEGA, { now: at(now), lang: "es" });
      expect(view).toEqual({ kind: "late", text: "Unos minutos más", hint: null });
      expect(view.text).not.toMatch(/[-d]/);
    }
  });

  it("sin hora válida no muestra nada, y está en los tres idiomas", () => {
    expect(arrivalView(null, { now: new Date(), lang: "es" })).toBeNull();
    expect(arrivalView(Number.NaN, { now: new Date(), lang: "es" })).toBeNull();
    expect(arrivalView(LLEGA, { now: at("2026-10-13T00:43:00Z"), lang: "en" }).text).toBe("Arrives around 21:55");
    expect(arrivalView(LLEGA, { now: at("2026-10-13T00:43:00Z"), lang: "pt" }).hint).toBe("faltam 12 min");
  });
});
