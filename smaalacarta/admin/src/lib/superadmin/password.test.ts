import { describe, expect, it } from "vitest";

import { validateNewPassword } from "@/lib/auth/validation";

import { generateTempPassword, TEMP_PASSWORD_LENGTH } from "./password";

describe("generateTempPassword — ADMIN-SUPER-6", () => {
  it("tiene el largo pactado", () => {
    expect(generateTempPassword()).toHaveLength(TEMP_PASSWORD_LENGTH);
  });

  it("la acepta el validador de contraseñas nuevas (ADMIN-AUTH-5)", () => {
    const password = generateTempPassword();
    expect(validateNewPassword(password, password)).toEqual({ ok: true });
  });

  it("no usa caracteres que se confunden al leerlos o dictarlos", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it("solo usa letras y números, para poder copiarla o dictarla", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("siempre mezcla mayúsculas, minúsculas y números", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTempPassword();
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it("no se repite entre llamadas", () => {
    const passwords = new Set(
      Array.from({ length: 500 }, () => generateTempPassword()),
    );
    expect(passwords.size).toBe(500);
  });
});
