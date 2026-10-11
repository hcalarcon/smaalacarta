// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSuperAdmin, couriers, rules } = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  couriers: { updateCourier: vi.fn() },
  rules: { createCourierWithAccount: vi.fn(), resetCourierPassword: vi.fn() },
}));

vi.mock("@/lib/auth/superadmin", () => ({ requireSuperAdmin: () => requireSuperAdmin() }));
vi.mock("@/lib/db/couriers", () => couriers);
vi.mock("@/lib/superadmin/courier-deps", () => ({ buildCourierDeps: vi.fn(async () => ({ deps: true })) }));
vi.mock("@/lib/superadmin/couriers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/superadmin/couriers")>()),
  ...rules,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCourierAction, resetCourierPasswordAction, updateCourierAction } from "./actions";

const ID = "11111111-1111-1111-1111-111111111111";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "super" });
  couriers.updateCourier.mockResolvedValue({ ok: true });
});

describe("repartidores en el superadmin — ENVIO-55", () => {
  it("el alta delega en las reglas (que comprueban superadmin) y devuelve las credenciales", async () => {
    rules.createCourierWithAccount.mockResolvedValue({
      ok: true,
      courierId: ID,
      credentials: { email: "a@x.com", password: "Clave-1" },
    });

    const state = await createCourierAction(
      {},
      form({ name: "Moto", whatsapp: "3515551234", email: "a@x.com" }),
    );

    expect(rules.createCourierWithAccount).toHaveBeenCalledWith(
      { deps: true },
      { name: "Moto", whatsapp: "3515551234", email: "a@x.com" },
    );
    expect(state).toEqual({ courierId: ID, credentials: { email: "a@x.com", password: "Clave-1" } });
  });

  it("si el alta falla, devuelve el error y conserva lo escrito", async () => {
    rules.createCourierWithAccount.mockResolvedValue({
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: { email: "Ya está en uso." },
    });

    const values = { name: "Moto", whatsapp: "3515551234", email: "a@x.com" };
    const state = await createCourierAction({}, form(values));

    expect(state).toMatchObject({ error: expect.any(String), fieldErrors: { email: "Ya está en uso." }, values });
    expect(state.credentials).toBeUndefined();
  });

  it("editar: quien no es superadmin no llega a la base", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      updateCourierAction({}, form({ courierId: ID, name: "Moto", whatsapp: "3515551234", active: "on" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(couriers.updateCourier).not.toHaveBeenCalled();
  });

  it("editar: guarda nombre, WhatsApp normalizado y activo", async () => {
    const state = await updateCourierAction(
      {},
      form({ courierId: ID, name: " Moto ", whatsapp: "351 555-1234", active: "on" }),
    );

    expect(couriers.updateCourier).toHaveBeenCalledWith(ID, {
      name: "Moto",
      whatsapp: "5493515551234",
      active: true,
    });
    expect(state.message).toMatch(/actualizado/i);

    await updateCourierAction({}, form({ courierId: ID, name: "Moto", whatsapp: "3515551234" }));
    expect(couriers.updateCourier).toHaveBeenLastCalledWith(ID, expect.objectContaining({ active: false }));
  });

  it("editar: datos inválidos no llegan a la base", async () => {
    const state = await updateCourierAction({}, form({ courierId: ID, name: "", whatsapp: "12" }));

    expect(state).toMatchObject({ fieldErrors: { name: expect.any(String), whatsapp: expect.any(String) } });
    expect(couriers.updateCourier).not.toHaveBeenCalled();
  });

  it("restablecer contraseña: devuelve las credenciales nuevas o el error", async () => {
    rules.resetCourierPassword.mockResolvedValue({
      ok: true,
      credentials: { email: "a@x.com", password: "Clave-2" },
    });
    const ok = await resetCourierPasswordAction({}, form({ courierId: ID }));
    expect(rules.resetCourierPassword).toHaveBeenCalledWith({ deps: true }, { courierId: ID });
    expect(ok.credentials).toEqual({ email: "a@x.com", password: "Clave-2" });

    rules.resetCourierPassword.mockResolvedValue({ ok: false, error: "No tenés permiso para hacer esto." });
    const fail = await resetCourierPasswordAction({}, form({ courierId: ID }));
    expect(fail).toEqual({ error: "No tenés permiso para hacer esto." });
  });
});
