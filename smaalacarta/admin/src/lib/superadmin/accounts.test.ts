import { describe, expect, it, vi } from "vitest";

import {
  addMemberByEmail,
  createBusinessWithOwner,
  resetMemberPassword,
  type AccountDeps,
} from "./accounts";

function makeDeps(overrides: Partial<AccountDeps> = {}) {
  const deps = {
    isSuperAdmin: vi.fn(async () => true),
    findProfileIdByEmail: vi.fn(async () => null as string | null),
    slugExists: vi.fn(async () => false),
    createAccount: vi.fn(async () => ({ id: "nuevo-usuario" })),
    createBusiness: vi.fn(async () => ({ id: "nuevo-negocio" })),
    addMember: vi.fn(async () => ({})),
    getMemberEmail: vi.fn(async () => "miembro@x.com" as string | null),
    isSuperAdminUser: vi.fn(async () => false),
    setTemporaryPassword: vi.fn(async () => ({})),
    generatePassword: vi.fn(() => "Clave-Temporal-1"),
    ...overrides,
  };
  return deps as typeof deps & AccountDeps;
}

const negocio = {
  name: "Panadería",
  slug: "panaderia",
  whatsapp: "+54 9 351 000-0001",
  ownerEmail: "  Dueno@Negocio.com ",
  ownerName: "Ana",
};

function nothingWasCalled(deps: ReturnType<typeof makeDeps>) {
  for (const fn of [
    deps.findProfileIdByEmail,
    deps.slugExists,
    deps.createAccount,
    deps.createBusiness,
    deps.addMember,
    deps.getMemberEmail,
    deps.isSuperAdminUser,
    deps.setTemporaryPassword,
    deps.generatePassword,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

describe("createBusinessWithOwner", () => {
  it("ADMIN-SUPER-8: sin ser superadmin no se usa la clave de servicio ni se toca nada", async () => {
    const deps = makeDeps({ isSuperAdmin: vi.fn(async () => false) });

    const result = await createBusinessWithOwner(deps, negocio);

    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toMatch(/permiso/i);
    nothingWasCalled(deps);
  });

  it("ADMIN-SUPER-8: comprueba el permiso antes de validar", async () => {
    const deps = makeDeps({ isSuperAdmin: vi.fn(async () => false) });

    const result = await createBusinessWithOwner(deps, { ...negocio, name: "" });

    expect(!result.ok && result.fieldErrors).toBeUndefined();
    nothingWasCalled(deps);
  });

  it("con datos inválidos informa los campos y no toca nada", async () => {
    const deps = makeDeps();

    const result = await createBusinessWithOwner(deps, {
      ...negocio,
      slug: "Slug Malo",
    });

    expect(!result.ok && result.fieldErrors?.slug).toBeTruthy();
    nothingWasCalled(deps);
  });

  it("ADMIN-SUPER-6: con un email nuevo crea la cuenta con una contraseña temporal y la devuelve", async () => {
    const deps = makeDeps();

    const result = await createBusinessWithOwner(deps, negocio);

    expect(result).toEqual({
      ok: true,
      businessId: "nuevo-negocio",
      credentials: { email: "dueno@negocio.com", password: "Clave-Temporal-1" },
    });
    expect(deps.createAccount).toHaveBeenCalledTimes(1);
    expect(deps.createAccount).toHaveBeenCalledWith(
      "dueno@negocio.com",
      "Ana",
      "Clave-Temporal-1",
    );
    expect(deps.createBusiness).toHaveBeenCalledWith({
      name: "Panadería",
      slug: "panaderia",
      whatsapp: "5493510000001",
      ownerId: "nuevo-usuario",
    });
  });

  it("ADMIN-SUPER-6: si el email ya tiene cuenta la reutiliza y no genera contraseña", async () => {
    const deps = makeDeps({
      findProfileIdByEmail: vi.fn(async () => "usuario-existente"),
    });

    const result = await createBusinessWithOwner(deps, negocio);

    expect(result).toEqual({
      ok: true,
      businessId: "nuevo-negocio",
      credentials: null,
    });
    expect(deps.createAccount).not.toHaveBeenCalled();
    expect(deps.generatePassword).not.toHaveBeenCalled();
    expect(deps.createBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "usuario-existente" }),
    );
  });

  it("busca la cuenta por el email normalizado", async () => {
    const deps = makeDeps();
    await createBusinessWithOwner(deps, negocio);
    expect(deps.findProfileIdByEmail).toHaveBeenCalledWith("dueno@negocio.com");
  });

  it("si el slug ya existe avisa en el campo y no crea la cuenta", async () => {
    const deps = makeDeps({ slugExists: vi.fn(async () => true) });

    const result = await createBusinessWithOwner(deps, negocio);

    expect(!result.ok && result.fieldErrors?.slug).toMatch(/slug/i);
    expect(deps.createAccount).not.toHaveBeenCalled();
    expect(deps.createBusiness).not.toHaveBeenCalled();
  });

  it("si crear la cuenta falla no crea el negocio", async () => {
    const deps = makeDeps({
      createAccount: vi.fn(async () => ({
        error: { code: "email_exists", message: "exists" },
      })),
    });

    const result = await createBusinessWithOwner(deps, negocio);

    expect(result).toMatchObject({ ok: false });
    expect(deps.createBusiness).not.toHaveBeenCalled();
  });

  it("si la base rechaza el negocio devuelve un mensaje en español, sin mostrar la contraseña", async () => {
    const deps = makeDeps({
      createBusiness: vi.fn(async () => ({
        error: {
          code: "23505",
          message: 'unique constraint "businesses_slug_key"',
        },
      })),
    });

    const result = await createBusinessWithOwner(deps, negocio);

    expect(!result.ok && result.error).toMatch(/slug/i);
    expect(JSON.stringify(result)).not.toContain("Clave-Temporal-1");
  });
});

describe("addMemberByEmail — ADMIN-SUPER-4", () => {
  const miembro = { businessId: "n1", email: " Ana@X.com", role: "staff" };

  it("ADMIN-SUPER-8: sin ser superadmin no se toca nada", async () => {
    const deps = makeDeps({ isSuperAdmin: vi.fn(async () => false) });

    const result = await addMemberByEmail(deps, miembro);

    expect(result).toMatchObject({ ok: false });
    nothingWasCalled(deps);
  });

  it("con una cuenta existente la asigna sin crear otra ni generar contraseña", async () => {
    const deps = makeDeps({ findProfileIdByEmail: vi.fn(async () => "u1") });

    const result = await addMemberByEmail(deps, miembro);

    expect(result).toEqual({ ok: true, credentials: null });
    expect(deps.createAccount).not.toHaveBeenCalled();
    expect(deps.addMember).toHaveBeenCalledWith({
      businessId: "n1",
      userId: "u1",
      role: "staff",
    });
  });

  it("con un email nuevo crea la cuenta con contraseña temporal y después asigna", async () => {
    const deps = makeDeps();

    const result = await addMemberByEmail(deps, miembro);

    expect(result).toEqual({
      ok: true,
      credentials: { email: "ana@x.com", password: "Clave-Temporal-1" },
    });
    expect(deps.createAccount).toHaveBeenCalledWith(
      "ana@x.com",
      "",
      "Clave-Temporal-1",
    );
    expect(deps.addMember).toHaveBeenCalledWith({
      businessId: "n1",
      userId: "nuevo-usuario",
      role: "staff",
    });
  });

  it("rechaza un rol desconocido sin tocar nada", async () => {
    const deps = makeDeps();

    const result = await addMemberByEmail(deps, { ...miembro, role: "admin" });

    expect(!result.ok && result.fieldErrors?.role).toBeTruthy();
    nothingWasCalled(deps);
  });

  it("si la base rechaza la asignación devuelve un mensaje en español", async () => {
    const deps = makeDeps({
      findProfileIdByEmail: vi.fn(async () => "u1"),
      addMember: vi.fn(async () => ({
        error: {
          code: "23505",
          message: 'unique "business_users_business_id_user_id_key"',
        },
      })),
    });

    const result = await addMemberByEmail(deps, miembro);

    expect(!result.ok && result.error).toMatch(/ya es miembro/i);
  });
});

describe("resetMemberPassword — ADMIN-SUPER-11", () => {
  const objetivo = { businessId: "n1", userId: "u1" };

  it("ADMIN-SUPER-8: sin ser superadmin no se toca nada", async () => {
    const deps = makeDeps({ isSuperAdmin: vi.fn(async () => false) });

    const result = await resetMemberPassword(deps, objetivo);

    expect(result).toMatchObject({ ok: false });
    nothingWasCalled(deps);
  });

  it("genera una contraseña temporal nueva y la devuelve una vez", async () => {
    const deps = makeDeps();

    const result = await resetMemberPassword(deps, objetivo);

    expect(result).toEqual({
      ok: true,
      credentials: { email: "miembro@x.com", password: "Clave-Temporal-1" },
    });
    expect(deps.setTemporaryPassword).toHaveBeenCalledWith(
      "u1",
      "Clave-Temporal-1",
    );
  });

  it("no restablece a quien no es miembro de ese negocio", async () => {
    const deps = makeDeps({ getMemberEmail: vi.fn(async () => null) });

    const result = await resetMemberPassword(deps, objetivo);

    expect(result).toMatchObject({ ok: false });
    expect(deps.getMemberEmail).toHaveBeenCalledWith("n1", "u1");
    expect(deps.setTemporaryPassword).not.toHaveBeenCalled();
    expect(deps.generatePassword).not.toHaveBeenCalled();
  });

  it("no restablece la contraseña de otro superadmin", async () => {
    const deps = makeDeps({ isSuperAdminUser: vi.fn(async () => true) });

    const result = await resetMemberPassword(deps, objetivo);

    expect(!result.ok && result.error).toMatch(/superadmin/i);
    expect(deps.setTemporaryPassword).not.toHaveBeenCalled();
  });

  it("si Supabase falla devuelve un mensaje en español, sin la contraseña", async () => {
    const deps = makeDeps({
      setTemporaryPassword: vi.fn(async () => ({
        error: { code: "service_key_missing" },
      })),
    });

    const result = await resetMemberPassword(deps, objetivo);

    expect(!result.ok && result.error).toMatch(/clave de servicio/i);
    expect(JSON.stringify(result)).not.toContain("Clave-Temporal-1");
  });
});
