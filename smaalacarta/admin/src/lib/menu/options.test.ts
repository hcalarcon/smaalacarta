import { describe, expect, it } from "vitest";

import {
  describeGroupRule,
  hasRequiredGroup,
  MAX_GROUPS_PER_PRODUCT,
  MAX_OPTIONS_PER_GROUP,
  optionGroupErrorMessage,
  validateOptionGroup,
  validateProductGroupIds,
} from "./options";

const option = (name: string, priceDelta = 0) => ({
  name,
  priceDelta,
  active: true,
  soldOut: false,
});

const group = {
  name: "Extras",
  minSelect: 0,
  maxSelect: 2,
  allowRepeat: false,
  active: true,
  options: [option("Queso", 500), option("Panceta", 800), option("Huevo")],
};

function errorsOf(input: Parameters<typeof validateOptionGroup>[0]) {
  const r = validateOptionGroup(input);
  return r.ok ? {} : r.errors;
}

describe("validateOptionGroup — ADMIN-OPCIONES-1 a 5", () => {
  it("acepta un grupo opcional y uno obligatorio", () => {
    expect(validateOptionGroup(group)).toEqual({ ok: true });
    expect(validateOptionGroup({ ...group, minSelect: 1, maxSelect: 1 })).toEqual({ ok: true });
  });

  it.each(["", "   ", "a"])("rechaza el nombre %j", (name) => {
    expect(errorsOf({ ...group, name }).name).toBeTruthy();
  });

  it.each([-1, 1.5, Number.NaN])("rechaza un mínimo de %s", (minSelect) => {
    expect(errorsOf({ ...group, minSelect }).minSelect).toBeTruthy();
  });

  it.each([0, -1, 1.5, Number.NaN])("rechaza un máximo de %s", (maxSelect) => {
    expect(errorsOf({ ...group, maxSelect }).maxSelect).toBeTruthy();
  });

  it("rechaza un máximo menor que el mínimo", () => {
    expect(errorsOf({ ...group, minSelect: 3, maxSelect: 2, allowRepeat: true }).maxSelect)
      .toMatch(/mínimo/i);
  });

  it("exige al menos una opción", () => {
    expect(errorsOf({ ...group, options: [] }).options).toMatch(/al menos una/i);
  });

  it("acepta 30 opciones y rechaza 31", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => option(`Op ${i}`));
    expect(MAX_OPTIONS_PER_GROUP).toBe(30);
    expect(validateOptionGroup({ ...group, options: many(30) })).toEqual({ ok: true });
    expect(errorsOf({ ...group, options: many(31) }).options).toMatch(/30/);
  });

  it("rechaza una opción sin nombre o con precio negativo, pero acepta el precio 0", () => {
    expect(errorsOf({ ...group, options: [option(" ")] }).options).toMatch(/nombre/i);
    expect(errorsOf({ ...group, options: [option("Queso", -1)] }).options).toMatch(/precio/i);
    expect(validateOptionGroup({ ...group, options: [option("Queso", 0)] })).toEqual({ ok: true });
  });

  // Un mínimo mayor que las opciones disponibles no se puede cumplir nunca: el cliente
  // quedaría trabado sin poder pedir el producto.
  it("sin repetir, rechaza un mínimo mayor que la cantidad de opciones", () => {
    const g = { ...group, minSelect: 4, maxSelect: 4, options: group.options };
    expect(errorsOf(g).minSelect).toMatch(/opciones/i);
    expect(validateOptionGroup({ ...g, allowRepeat: true })).toEqual({ ok: true });
  });
});

describe("validateProductGroupIds — ADMIN-OPCIONES-6", () => {
  it("acepta hasta 6 grupos distintos y ninguno", () => {
    expect(MAX_GROUPS_PER_PRODUCT).toBe(6);
    expect(validateProductGroupIds([])).toEqual({ ok: true });
    expect(validateProductGroupIds(["a", "b", "c", "d", "e", "f"])).toEqual({ ok: true });
  });

  it("rechaza un séptimo grupo", () => {
    const r = validateProductGroupIds(["a", "b", "c", "d", "e", "f", "g"]);
    expect(!r.ok && r.errors.groups).toMatch(/6/);
  });

  it("rechaza un grupo repetido", () => {
    const r = validateProductGroupIds(["a", "a"]);
    expect(!r.ok && r.errors.groups).toBeTruthy();
  });
});

describe("hasRequiredGroup y describeGroupRule — ADMIN-OPCIONES-10 y 12", () => {
  it("un producto es 'con grupo obligatorio' si algún grupo pide al menos 1", () => {
    expect(hasRequiredGroup([{ min_select: 0 }, { min_select: 1 }])).toBe(true);
    expect(hasRequiredGroup([{ min_select: 0 }])).toBe(false);
    expect(hasRequiredGroup([])).toBe(false);
  });

  it.each([
    [{ min_select: 0, max_select: 1, allow_repeat: false }, "Opcional, hasta 1"],
    [{ min_select: 0, max_select: 3, allow_repeat: false }, "Opcional, hasta 3"],
    [{ min_select: 1, max_select: 1, allow_repeat: false }, "Obligatorio: elegí 1"],
    [{ min_select: 2, max_select: 2, allow_repeat: false }, "Obligatorio: elegí 2"],
    [{ min_select: 1, max_select: 3, allow_repeat: false }, "Obligatorio: elegí de 1 a 3"],
    [{ min_select: 3, max_select: 3, allow_repeat: true }, "Obligatorio: elegí 3 (se pueden repetir)"],
  ])("describe la regla %j", (g, text) => {
    expect(describeGroupRule(g)).toBe(text);
  });
});

describe("optionGroupErrorMessage — ADMIN-OPCIONES-10", () => {
  it("explica el choque con una promoción y no muestra el texto técnico", () => {
    const msg = optionGroupErrorMessage({ code: "P0014", message: "interno xyz" });
    expect(msg).toMatch(/promoci/i);
    expect(msg).not.toMatch(/xyz/);
  });

  it("traduce límites, suspensión y errores desconocidos", () => {
    expect(optionGroupErrorMessage({ code: "P0015" })).toMatch(/máximo|límite/i);
    expect(optionGroupErrorMessage({ code: "P0010" })).toMatch(/suspendida/i);
    expect(optionGroupErrorMessage({ code: "???" })).toMatch(/No pudimos/);
  });
});
