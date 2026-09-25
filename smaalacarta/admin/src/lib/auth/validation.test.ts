import { describe, expect, it } from "vitest";

import { validateLogin, validateNewPassword } from "./validation";

describe("validateLogin — ADMIN-AUTH-4", () => {
  it("acepta un email válido y una contraseña", () => {
    expect(validateLogin({ email: "ana@negocio.com", password: "x" })).toEqual(
      { ok: true },
    );
  });

  it("ignora espacios alrededor del email", () => {
    expect(
      validateLogin({ email: "  ana@negocio.com ", password: "x" }),
    ).toEqual({ ok: true });
  });

  it.each(["", "ana", "ana@", "@negocio.com", "ana@negocio", "a b@c.com"])(
    "rechaza el email %j",
    (email) => {
      const result = validateLogin({ email, password: "x" });
      expect(result).toMatchObject({ ok: false });
      expect(result.ok === false && result.errors.email).toBeTruthy();
    },
  );

  it("rechaza una contraseña vacía", () => {
    const result = validateLogin({ email: "ana@negocio.com", password: "" });
    expect(result.ok === false && result.errors.password).toBeTruthy();
  });

  it("informa los dos errores a la vez", () => {
    const result = validateLogin({ email: "", password: "" });
    expect(result.ok === false && Object.keys(result.errors)).toEqual([
      "email",
      "password",
    ]);
  });
});

describe("validateNewPassword — ADMIN-AUTH-5", () => {
  it("acepta 8 caracteres que coinciden con la confirmación", () => {
    expect(validateNewPassword("12345678", "12345678")).toEqual({ ok: true });
  });

  it("rechaza menos de 8 caracteres", () => {
    const result = validateNewPassword("1234567", "1234567");
    expect(result.ok === false && result.errors.password).toBeTruthy();
  });

  it("rechaza una confirmación distinta", () => {
    const result = validateNewPassword("12345678", "12345679");
    expect(result.ok === false && result.errors.confirm).toBeTruthy();
    expect(result.ok === false && result.errors.password).toBeUndefined();
  });

  it("no exige composición: los espacios cuentan como caracteres", () => {
    expect(validateNewPassword("        ", "        ")).toEqual({ ok: true });
  });
});
