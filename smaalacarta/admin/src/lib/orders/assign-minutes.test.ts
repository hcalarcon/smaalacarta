import { describe, expect, it } from "vitest";

import { ASSIGN_MINUTES_DEFAULT, parseAssignMinutes } from "./assign-minutes";

// ENVIO-241 y 244
describe("tiempo para asignar a mano", () => {
  it("arranca en 5", () => {
    expect(ASSIGN_MINUTES_DEFAULT).toBe(5);
  });

  it("acepta enteros de 1 a 30, escritos o numéricos", () => {
    expect(parseAssignMinutes("1")).toBe(1);
    expect(parseAssignMinutes(" 5 ")).toBe(5);
    expect(parseAssignMinutes(30)).toBe(30);
  });

  it("rechaza lo que está fuera de rango o no es un entero", () => {
    for (const bad of ["0", "31", "-3", "2.5", "", "abc", "1e1", 0, 31, null, undefined, NaN]) {
      expect(parseAssignMinutes(bad)).toBeNull();
    }
  });
});
