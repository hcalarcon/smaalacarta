import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PREP_MAX,
  PREP_MIN,
  PREP_QUICK_MINUTES,
  PREP_WINDOW_MINUTES,
  acceptsPrepTime,
  adjustMinutes,
  prepBadge,
  prepSelectorDefault,
  validatePrepMinutes,
} from "./prep";

// 21:00 en Argentina (UTC-3).
const AT_21 = new Date("2026-10-12T00:00:00Z");
const at = (minutes: number) => new Date(AT_21.getTime() + minutes * 60_000).toISOString();

describe("rango del tiempo — ADMIN-PEDIDOS-36", () => {
  it("acepta de 5 a 180 minutos enteros", () => {
    expect(validatePrepMinutes(PREP_MIN)).toEqual({ ok: true, minutes: 5 });
    expect(validatePrepMinutes(PREP_MAX)).toEqual({ ok: true, minutes: 180 });
    expect(validatePrepMinutes("25")).toEqual({ ok: true, minutes: 25 });
  });

  it("rechaza lo que queda afuera, lo que no es entero y lo que no es un número", () => {
    for (const bad of [4, 181, 0, -5, 12.5, "", "abc", null, undefined, Number.NaN]) {
      const result = validatePrepMinutes(bad);
      expect(result.ok, String(bad)).toBe(false);
    }
  });

  it("los botones rápidos están todos dentro del rango", () => {
    expect(PREP_QUICK_MINUTES).toEqual([10, 15, 20, 30, 45]);
    for (const m of PREP_QUICK_MINUTES) expect(validatePrepMinutes(m).ok).toBe(true);
  });
});

describe("cuándo se pregunta el tiempo — ADMIN-PEDIDOS-31", () => {
  it("no en pedidos programados ni anticipados: ya tienen su hora", () => {
    expect(acceptsPrepTime({ scheduled_for: null, preorder: false })).toBe(true);
    expect(acceptsPrepTime({ scheduled_for: at(120), preorder: false })).toBe(false);
    expect(acceptsPrepTime({ scheduled_for: at(2000), preorder: true })).toBe(false);
    expect(acceptsPrepTime({ scheduled_for: null, preorder: true })).toBe(false);
  });
});

describe("valor preseleccionado — ADMIN-PEDIDOS-32", () => {
  it("usa la sugerencia si hay y, si no, el tiempo por defecto del negocio", () => {
    expect(prepSelectorDefault(22, 20)).toEqual({ minutes: 22, suggested: true });
    expect(prepSelectorDefault(null, 20)).toEqual({ minutes: 20, suggested: false });
  });

  it("una sugerencia fuera de rango no se usa", () => {
    expect(prepSelectorDefault(400, 25)).toEqual({ minutes: 25, suggested: false });
  });

  it("sin nada válido cae a 20", () => {
    expect(prepSelectorDefault(null, 0)).toEqual({ minutes: 20, suggested: false });
  });
});

describe("la tarjeta — ADMIN-PEDIDOS-34", () => {
  const order = (readyIn: number | null, status = "confirmed") => ({
    status,
    prep_ready_at: readyIn === null ? null : at(readyIn),
    scheduled_for: null,
    preorder: false,
  });

  it("dice a qué hora estará listo y en cuánto, en hora de Argentina", () => {
    expect(prepBadge(order(35), AT_21)).toEqual({ text: "Listo 21:35 (en 35 min)", late: false });
  });

  it("redondea hacia arriba los segundos que faltan", () => {
    const now = new Date(AT_21.getTime() + 30_000); // faltan 34 min y 30 s
    expect(prepBadge(order(35), now)?.text).toBe("Listo 21:35 (en 35 min)");
  });

  it("pasada la hora, avisa cuánto se atrasó y queda en alerta", () => {
    const now = new Date(AT_21.getTime() + 39 * 60_000);
    expect(prepBadge(order(35), now)).toEqual({ text: "Listo 21:35 (atrasado 4 min)", late: true });
  });

  it("en el minuto exacto todavía no está atrasado", () => {
    const now = new Date(AT_21.getTime() + 35 * 60_000);
    expect(prepBadge(order(35), now)).toEqual({ text: "Listo 21:35 (ahora)", late: false });
  });

  it("no muestra nada sin tiempo, fuera de Confirmado y En preparación, o en un programado", () => {
    expect(prepBadge(order(null), AT_21)).toBeNull();
    expect(prepBadge(order(35, "pending"), AT_21)).toBeNull();
    expect(prepBadge(order(35, "ready"), AT_21)).toBeNull();
    expect(prepBadge({ ...order(35), scheduled_for: at(180) }, AT_21)).toBeNull();
    expect(prepBadge({ ...order(35), preorder: true }, AT_21)).toBeNull();
  });

  it("una fecha inválida no rompe", () => {
    expect(prepBadge({ ...order(35), prep_ready_at: "no es una fecha" }, AT_21)).toBeNull();
  });
});

describe("demorar — ADMIN-PEDIDOS-35", () => {
  it("suma 10 minutos a lo que falta", () => {
    expect(adjustMinutes(at(8), AT_21, 10)).toBe(18);
  });

  it("si ya pasó la hora, son 10 desde ahora y nunca un número negativo", () => {
    expect(adjustMinutes(at(-12), AT_21, 10)).toBe(10);
    expect(adjustMinutes(at(0), AT_21, 10)).toBe(10);
  });

  it("sin hora cargada, 10 desde ahora", () => {
    expect(adjustMinutes(null, AT_21, 10)).toBe(10);
  });

  it("no pasa del máximo", () => {
    expect(adjustMinutes(at(175), AT_21, 10)).toBe(PREP_MAX);
  });

  it("también baja: resta a lo que falta, sin irse del mínimo", () => {
    expect(adjustMinutes(at(20), AT_21, -5)).toBe(15);
    expect(adjustMinutes(at(8), AT_21, -5)).toBe(5);
    expect(adjustMinutes(at(-3), AT_21, -5)).toBe(5);
  });
});

describe("la ventana — SEGUIMIENTO-38", () => {
  it("es de 10 minutos y es la misma que usa el seguimiento", () => {
    expect(PREP_WINDOW_MINUTES).toBe(10);

    const web = readFileSync(
      join(process.cwd(), "..", "web", "apps", "tracker", "lib", "prep.js"),
      "utf8",
    );
    const match = /export const PREP_WINDOW_MINUTES = (\d+);/.exec(web);

    expect(match, "web/apps/tracker/lib/prep.js exporta PREP_WINDOW_MINUTES").not.toBeNull();
    expect(Number(match![1])).toBe(PREP_WINDOW_MINUTES);
  });
});
