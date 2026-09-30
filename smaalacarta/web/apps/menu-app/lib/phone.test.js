import { describe, expect, it } from "vitest";

import { whatsappDigits } from "./phone.js";

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
