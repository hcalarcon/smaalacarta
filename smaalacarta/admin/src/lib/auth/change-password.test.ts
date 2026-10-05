import { describe, expect, it, vi } from "vitest";

import {
  changePassword,
  resetPassword,
  type ChangePasswordDeps,
} from "./change-password";

function makeDeps(overrides: Partial<ChangePasswordDeps> = {}) {
  const deps = {
    matchesCurrentPassword: vi.fn(async () => true),
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
  currentPassword: "LaTemporal9",
  password: "MiClavePropia9",
  confirm: "MiClavePropia9",
};

describe("changePassword — ADMIN-SUPER-10 y ADMIN-AUTH-5 y 10", () => {
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
    expect(deps.matchesCurrentPassword).toHaveBeenCalledWith(
      "ana@x.com",
      "LaTemporal9",
    );
    expect(deps.updateTemporaryPassword).toHaveBeenCalledWith(
      "u1",
      "MiClavePropia9",
    );
    expect(deps.updateOwnPassword).not.toHaveBeenCalled();
  });

  it("rechaza que la 'nueva' sea igual a la actual", async () => {
    const deps = makeDeps();

    const result = await changePassword(deps, {
      ...temporal,
      password: temporal.currentPassword,
      confirm: temporal.currentPassword,
    });

    expect(!result.ok && result.fieldErrors?.password).toMatch(/distinta/i);
    expect(deps.updateTemporaryPassword).not.toHaveBeenCalled();
    expect(deps.updateOwnPassword).not.toHaveBeenCalled();
  });

  it("si la contraseña actual no es correcta, no cambia nada (ADMIN-AUTH-10)", async () => {
    const deps = makeDeps({ matchesCurrentPassword: vi.fn(async () => false) });

    const result = await changePassword(deps, {
      ...temporal,
      isTemporary: false,
    });

    expect(!result.ok && result.fieldErrors?.currentPassword).toBeTruthy();
    expect(deps.updateOwnPassword).not.toHaveBeenCalled();
    expect(deps.updateTemporaryPassword).not.toHaveBeenCalled();
  });

  it("sin contraseña temporal: cambio común, verificando la actual", async () => {
    const deps = makeDeps();

    const result = await changePassword(deps, {
      ...temporal,
      isTemporary: false,
    });

    expect(result).toEqual({ ok: true });
    expect(deps.matchesCurrentPassword).toHaveBeenCalledWith(
      "ana@x.com",
      "LaTemporal9",
    );
    expect(deps.updateOwnPassword).toHaveBeenCalledWith("MiClavePropia9");
    expect(deps.updateTemporaryPassword).not.toHaveBeenCalled();
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
      password: "OtraDistinta9",
      confirm: "OtraDistinta9",
    });

    expect(!result.ok && result.error).toMatch(/distinta/i);
  });
});

describe("resetPassword — ADMIN-AUTH-13", () => {
  const input = { userId: "u1", isTemporary: false, password: "MiClavePropia9", confirm: "MiClavePropia9" };

  it("no pide la contraseña actual: con la nueva y su repetición cambia la contraseña", async () => {
    const deps = makeDeps();
    expect(await resetPassword(deps, input)).toEqual({ ok: true });
    expect(deps.updateOwnPassword).toHaveBeenCalledWith("MiClavePropia9");
    expect(deps.matchesCurrentPassword).not.toHaveBeenCalled();
  });

  it("con datos inválidos informa los campos y no toca nada", async () => {
    const deps = makeDeps();
    const corta = await resetPassword(deps, { ...input, password: "corta", confirm: "corta" });
    const distinta = await resetPassword(deps, { ...input, confirm: "OtraDistinta9" });

    expect(!corta.ok && corta.fieldErrors?.password).toBeTruthy();
    expect(!distinta.ok && distinta.fieldErrors?.confirm).toBeTruthy();
    expect(deps.updateOwnPassword).not.toHaveBeenCalled();
    expect(deps.updateTemporaryPassword).not.toHaveBeenCalled();
  });

  it("si la cuenta tenía una contraseña temporal, la cambia y borra la marca en el mismo paso", async () => {
    const deps = makeDeps();
    expect(await resetPassword(deps, { ...input, isTemporary: true })).toEqual({ ok: true });
    expect(deps.updateTemporaryPassword).toHaveBeenCalledWith("u1", "MiClavePropia9");
    expect(deps.updateOwnPassword).not.toHaveBeenCalled();
  });

  it("si Supabase falla, devuelve el error en español", async () => {
    const deps = makeDeps({ updateOwnPassword: vi.fn(async () => ({ error: { code: "weak_password" } })) });
    const r = await resetPassword(deps, input);
    expect(!r.ok && r.error).toBeTruthy();
  });
});
