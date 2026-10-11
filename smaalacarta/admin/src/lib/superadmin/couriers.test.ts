import { describe, expect, it, vi } from "vitest";

import {
  createCourierWithAccount,
  resetCourierPassword,
  validateCourierProfile,
  validateNewCourier,
  type AccountUse,
  type CourierAccountDeps,
} from "./couriers";

function makeDeps(overrides: Partial<CourierAccountDeps> = {}) {
  const deps = {
    isSuperAdmin: vi.fn(async () => true),
    findProfileIdByEmail: vi.fn(async () => null as string | null),
    slugExists: vi.fn(async () => false),
    createAccount: vi.fn(async () => ({ id: "usuario-nuevo" })),
    createBusiness: vi.fn(async () => ({ id: "negocio" })),
    addMember: vi.fn(async () => ({})),
    getMemberEmail: vi.fn(async () => null as string | null),
    isSuperAdminUser: vi.fn(async () => false),
    setTemporaryPassword: vi.fn(async () => ({})),
    generatePassword: vi.fn(() => "Clave-Temporal-1"),
    accountUse: vi.fn(async () => "free" as AccountUse),
    createCourier: vi.fn(async () => ({ id: "repartidor-nuevo" })),
    getCourierAccount: vi.fn(
      async () => ({ userId: "u-repa", email: "repa@x.com" }) as { userId: string; email: string } | null,
    ),
    ...overrides,
  };
  return deps as typeof deps & CourierAccountDeps;
}

const repartidor = { name: " Moto Express ", whatsapp: "351 555-1234", email: "  Moto@Express.com " };

function nothingWasCalled(deps: ReturnType<typeof makeDeps>) {
  for (const fn of [
    deps.findProfileIdByEmail,
    deps.createAccount,
    deps.createCourier,
    deps.accountUse,
    deps.getCourierAccount,
    deps.isSuperAdminUser,
    deps.setTemporaryPassword,
    deps.generatePassword,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

describe("validateCourierProfile y validateNewCourier — ENVIO-55", () => {
  it("pide nombre y un WhatsApp de 8 a 15 dígitos", () => {
    expect(validateCourierProfile({ name: "Juan", whatsapp: "3515551234" })).toEqual({ ok: true });
    expect(validateCourierProfile({ name: " ", whatsapp: "3515551234" })).toMatchObject({
      ok: false,
      errors: { name: expect.any(String) },
    });
    expect(validateCourierProfile({ name: "Juan", whatsapp: "" })).toMatchObject({
      ok: false,
      errors: { whatsapp: expect.any(String) },
    });
    expect(validateCourierProfile({ name: "Juan", whatsapp: "12ab" })).toMatchObject({
      ok: false,
      errors: { whatsapp: expect.any(String) },
    });
    expect(validateCourierProfile({ name: "x".repeat(81), whatsapp: "3515551234" })).toMatchObject({
      ok: false,
      errors: { name: expect.any(String) },
    });
  });

  it("el alta suma el email", () => {
    expect(validateNewCourier({ name: "Juan", whatsapp: "3515551234", email: "juan@x.com" })).toEqual({ ok: true });
    expect(validateNewCourier({ name: "Juan", whatsapp: "3515551234", email: "juan" })).toMatchObject({
      ok: false,
      errors: { email: expect.any(String) },
    });
  });
});

describe("createCourierWithAccount — ENVIO-55", () => {
  it("sin ser superadmin no se usa la clave de servicio ni se toca nada", async () => {
    const deps = makeDeps({ isSuperAdmin: vi.fn(async () => false) });

    const result = await createCourierWithAccount(deps, repartidor);

    expect(result).toMatchObject({ ok: false });
    nothingWasCalled(deps);
  });

  it("datos inválidos: no crea nada", async () => {
    const deps = makeDeps();

    const result = await createCourierWithAccount(deps, { name: "", whatsapp: "1", email: "no" });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String), whatsapp: expect.any(String), email: expect.any(String) },
    });
    nothingWasCalled(deps);
  });

  it("crea la cuenta con contraseña temporal, el repartidor y su usuario, y devuelve las credenciales", async () => {
    const deps = makeDeps();

    const result = await createCourierWithAccount(deps, repartidor);

    expect(result).toEqual({
      ok: true,
      courierId: "repartidor-nuevo",
      credentials: { email: "moto@express.com", password: "Clave-Temporal-1" },
    });
    expect(deps.createAccount).toHaveBeenCalledWith("moto@express.com", "Moto Express", "Clave-Temporal-1");
    expect(deps.createCourier).toHaveBeenCalledWith({
      name: "Moto Express",
      whatsapp: "5493515551234",
      userId: "usuario-nuevo",
    });
  });

  it.each<AccountUse>(["business", "courier", "super_admin"])(
    "un email con una cuenta %s se rechaza sin tocar la cuenta",
    async (use) => {
      const deps = makeDeps({
        findProfileIdByEmail: vi.fn(async () => "existente"),
        accountUse: vi.fn(async () => use),
      });

      const result = await createCourierWithAccount(deps, repartidor);

      expect(result).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
      expect(deps.setTemporaryPassword).not.toHaveBeenCalled();
      expect(deps.createAccount).not.toHaveBeenCalled();
      expect(deps.createCourier).not.toHaveBeenCalled();
    },
  );

  it("reutiliza una cuenta huérfana (el alta anterior falló): le da contraseña nueva y crea el repartidor", async () => {
    const deps = makeDeps({ findProfileIdByEmail: vi.fn(async () => "huerfana") });

    const result = await createCourierWithAccount(deps, repartidor);

    expect(result).toMatchObject({ ok: true, credentials: { password: "Clave-Temporal-1" } });
    expect(deps.createAccount).not.toHaveBeenCalled();
    expect(deps.setTemporaryPassword).toHaveBeenCalledWith("huerfana", "Clave-Temporal-1");
    expect(deps.createCourier).toHaveBeenCalledWith(expect.objectContaining({ userId: "huerfana" }));
  });

  it("si no se pudo crear la cuenta, no crea el repartidor", async () => {
    const deps = makeDeps({
      createAccount: vi.fn(async () => ({ error: { code: "service_key_missing" } })),
    });

    const result = await createCourierWithAccount(deps, repartidor);

    expect(result).toMatchObject({ ok: false });
    expect(deps.createCourier).not.toHaveBeenCalled();
  });

  it("si falla el alta del repartidor, avisa que la cuenta ya se creó", async () => {
    const deps = makeDeps({
      createCourier: vi.fn(async () => ({ error: { code: "42501", message: "x" } })),
    });

    const result = await createCourierWithAccount(deps, repartidor);

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/cuenta ya se creó/i) });
  });
});

describe("resetCourierPassword — ENVIO-55", () => {
  it("sin ser superadmin no se toca nada", async () => {
    const deps = makeDeps({ isSuperAdmin: vi.fn(async () => false) });

    const result = await resetCourierPassword(deps, { courierId: "r" });

    expect(result).toMatchObject({ ok: false });
    nothingWasCalled(deps);
  });

  it("genera una contraseña temporal nueva para la cuenta del repartidor", async () => {
    const deps = makeDeps();

    const result = await resetCourierPassword(deps, { courierId: "r" });

    expect(result).toEqual({ ok: true, credentials: { email: "repa@x.com", password: "Clave-Temporal-1" } });
    expect(deps.setTemporaryPassword).toHaveBeenCalledWith("u-repa", "Clave-Temporal-1");
  });

  it("un repartidor sin cuenta, o con la cuenta de un superadmin, se rechaza", async () => {
    const sin = makeDeps({ getCourierAccount: vi.fn(async () => null) });
    expect(await resetCourierPassword(sin, { courierId: "r" })).toMatchObject({ ok: false });
    expect(sin.setTemporaryPassword).not.toHaveBeenCalled();

    const sup = makeDeps({ isSuperAdminUser: vi.fn(async () => true) });
    expect(await resetCourierPassword(sup, { courierId: "r" })).toMatchObject({ ok: false });
    expect(sup.setTemporaryPassword).not.toHaveBeenCalled();
  });
});
