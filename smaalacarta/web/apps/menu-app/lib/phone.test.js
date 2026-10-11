import { describe, expect, it } from "vitest";

import { isValidPhone, whatsappDigits } from "./phone.js";

describe("whatsappDigits", () => {
  it("agrega 549 a un número argentino sin código de país", () => {
    expect(whatsappDigits("3644277105")).toBe("5493644277105");
    expect(whatsappDigits("0364 427-7105")).toBe("5493644277105");
  });

  it("deja igual el que ya trae código de país", () => {
    expect(whatsappDigits("5493644277105")).toBe("5493644277105");
    expect(whatsappDigits("+54 9 364 427-7105")).toBe("5493644277105");
  });

  it("devuelve vacío si no hay número", () => {
    expect(whatsappDigits(undefined)).toBe("");
    expect(whatsappDigits("")).toBe("");
  });
});

describe("isValidPhone — ENVIO-87", () => {
  it("vale con 8 a 15 dígitos, con o sin separadores", () => {
    expect(isValidPhone("3644 27-7105")).toBe(true);
    expect(isValidPhone("+54 9 364 4277105")).toBe(true);
    expect(isValidPhone("12345678")).toBe(true);
  });

  it("no vale con menos de 8, más de 15 o sin números", () => {
    expect(isValidPhone("1234567")).toBe(false);
    expect(isValidPhone("1234567890123456")).toBe(false);
    expect(isValidPhone("sin números")).toBe(false);
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone(undefined)).toBe(false);
  });
});
