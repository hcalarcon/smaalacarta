import { describe, expect, it } from "vitest";

import {
  LEAD_MAX,
  LEAD_MIN,
  normalizeScheduledOrders,
  validateScheduledOrders,
} from "./scheduled";
import { DEFAULT_SETTINGS, validateSettings } from "./validation";

describe("validateScheduledOrders — ADMIN-CONFIG-17", () => {
  it("lo habitual es válido", () => {
    expect(validateScheduledOrders({ allowScheduledOrders: true, scheduledLeadMinutes: 30 })).toEqual({
      ok: true,
    });
  });

  it.each([LEAD_MIN, LEAD_MAX, 45])("acepta %i minutos", (scheduledLeadMinutes) => {
    expect(validateScheduledOrders({ allowScheduledOrders: true, scheduledLeadMinutes })).toEqual({
      ok: true,
    });
  });

  it.each([14, 241, 0, -30, 20.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza %s minutos con un mensaje en español",
    (scheduledLeadMinutes) => {
      const r = validateScheduledOrders({ allowScheduledOrders: true, scheduledLeadMinutes });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.scheduledLeadMinutes).toBe("Ingresá un número entero de 15 a 240 minutos.");
    },
  );

  it("sin permitir pedidos programados no valida los minutos: el campo está oculto", () => {
    expect(validateScheduledOrders({ allowScheduledOrders: false, scheduledLeadMinutes: 3 })).toEqual({
      ok: true,
    });
  });
});

describe("normalizeScheduledOrders", () => {
  it("con los pedidos programados apagados, unos minutos inválidos vuelven a 30 (la base los exige entre 15 y 240)", () => {
    expect(normalizeScheduledOrders({ allowScheduledOrders: false, scheduledLeadMinutes: 3 })).toEqual({
      allowScheduledOrders: false,
      scheduledLeadMinutes: 30,
    });
  });

  it("deja como están los minutos válidos, o los inválidos si está encendido (para que la validación los marque)", () => {
    expect(normalizeScheduledOrders({ allowScheduledOrders: false, scheduledLeadMinutes: 90 }).scheduledLeadMinutes).toBe(90);
    expect(normalizeScheduledOrders({ allowScheduledOrders: true, scheduledLeadMinutes: 3 }).scheduledLeadMinutes).toBe(3);
  });
});

describe("validateSettings con pedidos programados — ADMIN-CONFIG-17", () => {
  it("un negocio nuevo arranca aceptándolos con 30 minutos", () => {
    expect(DEFAULT_SETTINGS.allowScheduledOrders).toBe(true);
    expect(DEFAULT_SETTINGS.scheduledLeadMinutes).toBe(30);
  });

  it("el error sale junto a su campo", () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, scheduledLeadMinutes: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.scheduledLeadMinutes).toBeTruthy();
  });
});
