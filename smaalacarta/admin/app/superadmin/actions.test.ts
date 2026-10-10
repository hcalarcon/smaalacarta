// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSuperAdmin, db } = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  db: { updateBusinessPlan: vi.fn(), updateCourierDelivery: vi.fn(), removeMember: vi.fn() },
}));

vi.mock("@/lib/auth/superadmin", () => ({ requireSuperAdmin: () => requireSuperAdmin() }));
vi.mock("@/lib/db/superadmin", () => db);
vi.mock("@/lib/superadmin/accounts", () => ({}));
vi.mock("@/lib/superadmin/deps", () => ({ buildAccountDeps: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateCourierDeliveryAction } from "./actions";

const ID = "11111111-1111-1111-1111-111111111111";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "super" });
  db.updateCourierDelivery.mockResolvedValue({ ok: true });
});

describe("envío con Repartos al Toque por negocio — ENVIO-18", () => {
  it("quien no es superadmin no llega a la base", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      updateCourierDeliveryAction({}, form({ businessId: ID, courierDelivery: "on" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(db.updateCourierDelivery).not.toHaveBeenCalled();
  });

  it("lo habilita con el interruptor marcado", async () => {
    const result = await updateCourierDeliveryAction({}, form({ businessId: ID, courierDelivery: "on" }));

    expect(db.updateCourierDelivery).toHaveBeenCalledWith(ID, true);
    expect(result.error).toBeUndefined();
    expect(result.message).toMatch(/habilitado/i);
  });

  it("lo deshabilita con el interruptor desmarcado", async () => {
    const result = await updateCourierDeliveryAction({}, form({ businessId: ID }));

    expect(db.updateCourierDelivery).toHaveBeenCalledWith(ID, false);
    expect(result.message).toMatch(/deshabilitado/i);
  });

  it("devuelve el error de la base", async () => {
    db.updateCourierDelivery.mockResolvedValue({ ok: false, error: "No se pudo." });

    const result = await updateCourierDeliveryAction({}, form({ businessId: ID, courierDelivery: "on" }));
    expect(result.error).toBe("No se pudo.");
  });
});
