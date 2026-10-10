import { describe, expect, it } from "vitest";

import { parsePrice, validateZone } from "./zones";

const existing = [
  { id: "1", name: "Cantera" },
  { id: "2", name: "Centro (hasta Av. Koessler)" },
];

describe("parsePrice — ENVIO-37", () => {
  it.each([
    ["4500", 4500],
    ["4.500", 4500],
    ["$ 4.500", 4500],
    ["4500,50", 4500.5],
    [" 0 ", 0],
    [4500, 4500],
  ])("%s → %s", (text, expected) => {
    expect(parsePrice(text)).toBe(expected);
  });

  it.each(["", "   ", "mucho", "-5", "1,234,5", "1e5", "100000000", "4500,555"])("%s no es un precio", (text) => {
    expect(parsePrice(text)).toBeNull();
  });
});

describe("validateZone — ENVIO-37", () => {
  it("un barrio válido se normaliza", () => {
    expect(validateZone({ name: "  Oasis ", price: "5.500" }, existing)).toEqual({
      ok: true,
      name: "Oasis",
      price: 5500,
    });
  });

  it("el precio puede ser cero", () => {
    expect(validateZone({ name: "Gratis", price: "0" }, existing)).toMatchObject({ ok: true, price: 0 });
  });

  it("el nombre es obligatorio y admite hasta 60 caracteres", () => {
    expect(validateZone({ name: "   ", price: "1" }, existing)).toMatchObject({
      ok: false,
      errors: { name: expect.stringMatching(/nombre/i) },
    });
    expect(validateZone({ name: "x".repeat(60), price: "1" }, existing).ok).toBe(true);
    expect(validateZone({ name: "x".repeat(61), price: "1" }, existing)).toMatchObject({
      ok: false,
      errors: { name: expect.stringMatching(/60/) },
    });
  });

  it("el nombre no se repite, sin mirar mayúsculas ni espacios de más", () => {
    expect(validateZone({ name: " cantera ", price: "1" }, existing)).toMatchObject({
      ok: false,
      errors: { name: expect.stringMatching(/ya existe/i) },
    });
  });

  it("al editar, el barrio puede conservar su propio nombre", () => {
    expect(validateZone({ name: "Cantera", price: "6000" }, existing, "1")).toMatchObject({ ok: true });
    expect(validateZone({ name: "Cantera", price: "6000" }, existing, "2")).toMatchObject({ ok: false });
  });

  it("el precio tiene que ser un número de 0 en adelante", () => {
    for (const price of ["", "-1", "caro"]) {
      expect(validateZone({ name: "Oasis", price }, existing)).toMatchObject({
        ok: false,
        errors: { price: expect.stringMatching(/precio/i) },
      });
    }
  });

  it("junta los errores de nombre y de precio", () => {
    const r = validateZone({ name: "", price: "x" }, existing);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["name", "price"]);
  });
});
