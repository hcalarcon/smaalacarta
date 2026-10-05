import { describe, expect, it } from "vitest";

import { normalizePreorders, validatePreorders, type PreordersInput } from "./preorders";
import { DEFAULT_SETTINGS, validateSettings } from "./validation";

const base: PreordersInput = {
  preordersEnabled: true,
  preorderCutoffs: { sabado: { dia: "viernes", hora: "20:00" } },
  schedule: { sabado: ["12:00-23:00"] },
};

const errorOf = (input: PreordersInput) => {
  const r = validatePreorders(input);
  return r.ok ? null : r.errors.preorderCutoffs;
};

describe("validatePreorders — ADMIN-CONFIG-19", () => {
  it("un corte de días antes es válido", () => {
    expect(validatePreorders(base)).toEqual({ ok: true });
  });

  it("un corte el mismo día es válido si es antes de la primera apertura", () => {
    const cutoffs = { sabado: { dia: "sabado", hora: "11:59" } } as const;
    expect(validatePreorders({ ...base, preorderCutoffs: cutoffs })).toEqual({ ok: true });
  });

  it("un corte el mismo día a la hora de apertura o después se rechaza", () => {
    for (const hora of ["12:00", "18:30"]) {
      const cutoffs = { sabado: { dia: "sabado", hora } } as const;
      expect(errorOf({ ...base, preorderCutoffs: cutoffs })).toContain("anterior a la apertura");
    }
  });

  it("con dos turnos cuenta la primera apertura del día", () => {
    const input: PreordersInput = {
      ...base,
      schedule: { sabado: ["20:00-23:00", "12:00-15:00"] },
      preorderCutoffs: { sabado: { dia: "sabado", hora: "13:00" } },
    };
    expect(errorOf(input)).toContain("anterior a la apertura");
  });

  it("el corte es un día y una hora HH:MM", () => {
    for (const hora of ["8:00", "24:00", "20:60", "", "20h"]) {
      const cutoffs = { sabado: { dia: "viernes", hora } } as const;
      expect(errorOf({ ...base, preorderCutoffs: cutoffs })).toContain("HH:MM");
    }
    const sinDia = { sabado: { dia: "viernez", hora: "20:00" } } as unknown as PreordersInput["preorderCutoffs"];
    expect(errorOf({ ...base, preorderCutoffs: sinDia })).toContain("día");
  });

  it("solo se carga el corte de un día con horario", () => {
    const cutoffs = { domingo: { dia: "viernes", hora: "20:00" } } as const;
    expect(errorOf({ ...base, preorderCutoffs: cutoffs })).toContain("sin horario");
    expect(errorOf({ ...base, schedule: { sabado: [] } })).toContain("sin horario");
  });

  it("encendido sin ningún corte pide cargar uno", () => {
    expect(errorOf({ ...base, preorderCutoffs: {} })).toContain("al menos un día");
  });

  it("apagado no valida nada: la sección está oculta", () => {
    expect(validatePreorders({ ...base, preordersEnabled: false, preorderCutoffs: {} })).toEqual({ ok: true });
  });
});

describe("normalizePreorders", () => {
  it("saca los cortes de días que ya no tienen horario", () => {
    const input: PreordersInput = {
      ...base,
      preorderCutoffs: { ...base.preorderCutoffs, domingo: { dia: "viernes", hora: "20:00" } },
    };
    expect(normalizePreorders(input).preorderCutoffs).toEqual(base.preorderCutoffs);
  });

  it("apagado, descarta cortes inválidos para que no lleguen a la base", () => {
    const input: PreordersInput = {
      ...base,
      preordersEnabled: false,
      preorderCutoffs: { sabado: { dia: "viernes", hora: "mal" } },
    };
    expect(normalizePreorders(input).preorderCutoffs).toEqual({});
  });

  it("encendido, no toca un corte inválido: la validación lo marca", () => {
    const input: PreordersInput = { ...base, preorderCutoffs: { sabado: { dia: "viernes", hora: "mal" } } };
    expect(normalizePreorders(input).preorderCutoffs).toEqual(input.preorderCutoffs);
  });
});

describe("validateSettings con pedidos anticipados — ADMIN-CONFIG-19", () => {
  it("por defecto están apagados y la configuración es válida", () => {
    expect(DEFAULT_SETTINGS.preordersEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.preorderCutoffs).toEqual({});
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({ ok: true });
  });

  it("un corte inválido marca el campo en la configuración", () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, ...base, preorderCutoffs: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.preorderCutoffs).toBeTruthy();
  });
});
