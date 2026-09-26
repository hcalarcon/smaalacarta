import { describe, expect, it, vi } from "vitest";

import { changePassword, type ChangePasswordDeps } from "./change-password";

function makeDeps(overrides: Partial<ChangePasswordDeps> = {}) {
  const deps = {
    matchesCurrentPassword: vi.fn(async () => false),
    updateOwnPassword: vi.fn(async () => ({})),
    updateTemporaryPassword: vi.fn(async () => ({})),
    ...overrides,
  };
  return deps as typeof deps & ChangePasswordDeps;
}

const temporal = {
  userId: "u1",
  email: "ana@x.com",
  isTemporary: true,
  password: "MiClavePropia9",
  confirm: "MiClavePropia9",
};

describe("changePassword — ADMIN-SUPER-10 y ADMIN-AUTH-5", () => {
  it("con datos inválidos informa los campos y no toca nada", async () => {
    const deps = makeDeps();

    const corta = await changePassword(deps, {
      ...temporal,
      password: "corta",
      confirm: "corta",
    });
    const distinta = await changePassword(deps, {
      ...temporal,
      confirm: "OtraDistinta9",
    });

    expect(!corta.ok && corta.fieldErrors?.password).toBeTruthy();
    expect(!distinta.ok && distinta.fieldErrors?.confirm).toBeTruthy();
    expect(deps.matchesCurrentPassword).not.toHaveBeenCalled();
    expect(deps.updateOwnPassword).not.toHaveBeenCalled();
    expect(deps.updateTemporaryPassword).not.toHaveBeenCalled();
  });

  it("con contraseña temporal: la cambia y borra la marca en un solo paso", async () => {
    const deps = makeDeps();

    const result = await changePassword(deps, temporal);

    expect(result).toEqual({ ok: true });
    expect(deps.updateTemporaryPassword).toHaveBeenCalledWith(
      "u1",
      "MiClavePropia9",
    );
    expect(deps.updateOwnPassword).not.toHaveBeenCalled();
  });

  it("con contraseña temporal: rechaza que la 'nueva' sea la misma temporal", async () => {
    const deps = makeDeps({ matchesCurrentPassword: vi.fn(async () => true) });

    const result = await changePassword(deps, temporal);

    expect(!result.ok && result.fieldErrors?.password).toMatch(/distinta/i);
    expect(deps.matchesCurrentPassword).toHaveBeenCalledWith(
      "ana@x.com",
      "MiClavePropia9",
    );
    expect(deps.updateTemporaryPassword).not.toHaveBeenCalled();
  });

  it("sin contraseña temporal: cambio común, sin clave de servicio", async () => {
    const deps = makeDeps();

    const result = await changePassword(deps, {
      ...temporal,
      isTemporary: false,
    });

    expect(result).toEqual({ ok: true });
    expect(deps.updateOwnPassword).toHaveBeenCalledWith("MiClavePropia9");
    expect(deps.updateTemporaryPassword).not.toHaveBeenCalled();
    expect(deps.matchesCurrentPassword).not.toHaveBeenCalled();
  });

  it("si Supabase falla devuelve un mensaje en español", async () => {
    const deps = makeDeps({
      updateTemporaryPassword: vi.fn(async () => ({
        error: { code: "service_key_missing" },
      })),
    });

    const result = await changePassword(deps, temporal);

    expect(!result.ok && result.error).toMatch(/clave de servicio/i);
  });

  it("si la contraseña nueva es igual a la actual (cambio común) lo explica", async () => {
    const deps = makeDeps({
      updateOwnPassword: vi.fn(async () => ({ error: { code: "same_password" } })),
    });

    const result = await changePassword(deps, {
      ...temporal,
      isTemporary: false,
    });

    expect(!result.ok && result.error).toMatch(/distinta/i);
  });
});
