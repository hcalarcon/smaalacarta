// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSuperAdmin, db, platform } = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  db: {
    createDeliveryZone: vi.fn(),
    deleteDeliveryZone: vi.fn(),
    listDeliveryZones: vi.fn(),
    saveDeliveryZoneOrder: vi.fn(),
    updateDeliveryZone: vi.fn(),
  },
  platform: {
    setDeliveryMode: vi.fn(),
    setCourierAvailabilitySwitch: vi.fn(),
    setAssignMinutesSetting: vi.fn(),
    DELIVERY_MODES: ["fixed", "offers"],
  },
}));

vi.mock("@/lib/auth/superadmin", () => ({ requireSuperAdmin: () => requireSuperAdmin() }));
vi.mock("@/lib/db/delivery-zones", () => db);
vi.mock("@/lib/db/platform-settings", () => platform);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createZoneAction,
  deleteZoneAction,
  reorderZonesAction,
  setAssignMinutesAction,
  setCourierAvailabilitySwitchAction,
  setDeliveryModeAction,
  setZoneActiveAction,
  updateZoneAction,
} from "./actions";

const Z1 = "11111111-1111-1111-1111-111111111111";
const Z2 = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "super" });
  db.listDeliveryZones.mockResolvedValue([{ id: Z1, name: "Cantera", price: 5000, sort_order: 1, active: true }]);
  db.createDeliveryZone.mockResolvedValue({ ok: true });
  db.updateDeliveryZone.mockResolvedValue({ ok: true });
  db.saveDeliveryZoneOrder.mockResolvedValue({ ok: true });
  db.deleteDeliveryZone.mockResolvedValue({ ok: true, result: "deleted" });
});

describe("modo de envíos — ENVIO-145", () => {
  it("quien no es superadmin no llega a la base", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(setDeliveryModeAction("offers")).rejects.toThrow("NEXT_REDIRECT");
    expect(platform.setDeliveryMode).not.toHaveBeenCalled();
  });

  it("cambia el modo", async () => {
    platform.setDeliveryMode.mockResolvedValue({ ok: true });

    expect(await setDeliveryModeAction("offers")).toEqual({ ok: true });
    expect(platform.setDeliveryMode).toHaveBeenCalledWith("offers");
  });

  it("rechaza un modo desconocido sin tocar la base", async () => {
    const r = await setDeliveryModeAction("gratis" as never);

    expect(r.ok).toBe(false);
    expect(platform.setDeliveryMode).not.toHaveBeenCalled();
  });

  it("si la base lo rechaza, lo dice", async () => {
    platform.setDeliveryMode.mockResolvedValue({ error: { code: "42501" } });
    expect((await setDeliveryModeAction("fixed")).ok).toBe(false);
  });
});

describe("zonas de la plataforma — ENVIO-56", () => {
  it.each([
    ["crear", () => createZoneAction({ name: "Oasis", price: "5500" })],
    ["editar", () => updateZoneAction(Z1, { name: "Oasis", price: "5500" })],
    ["activar", () => setZoneActiveAction(Z1, false)],
    ["borrar", () => deleteZoneAction(Z1)],
    ["ordenar", () => reorderZonesAction([Z1, Z2])],
  ])("%s: quien no es superadmin no llega a la base", async (_name, run) => {
    requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(run()).rejects.toThrow("NEXT_REDIRECT");

    for (const fn of Object.values(db)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("alta: normaliza el nombre y el precio", async () => {
    const r = await createZoneAction({ name: " Oasis ", price: "5.500" });

    expect(r).toEqual({ ok: true });
    expect(db.createDeliveryZone).toHaveBeenCalledWith({ name: "Oasis", price: 5500 });
  });

  it("rechaza un nombre repetido o un precio inválido sin llamar a la base", async () => {
    const repetido = await createZoneAction({ name: "cantera", price: "1" });
    expect(repetido).toMatchObject({ ok: false, fieldErrors: { name: expect.stringMatching(/ya existe/i) } });

    const caro = await createZoneAction({ name: "Oasis", price: "-1" });
    expect(caro).toMatchObject({ ok: false, fieldErrors: { price: expect.any(String) } });

    expect(db.createDeliveryZone).not.toHaveBeenCalled();
  });

  it("editar una zona le deja su propio nombre", async () => {
    const r = await updateZoneAction(Z1, { name: "Cantera", price: "6000" });

    expect(r).toEqual({ ok: true });
    expect(db.updateDeliveryZone).toHaveBeenCalledWith(Z1, { name: "Cantera", price: 6000 });
  });

  it("un nombre repetido que la base rechaza (23505) se dice como error del campo", async () => {
    db.createDeliveryZone.mockResolvedValue({ error: { code: "23505" } });

    const r = await createZoneAction({ name: "Oasis", price: "1" });
    expect(r).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
  });

  it("borrar una zona sin pedidos la borra", async () => {
    const r = await deleteZoneAction(Z1);

    expect(r).toEqual({ ok: true });
    expect(db.deleteDeliveryZone).toHaveBeenCalledWith(Z1);
  });

  it("borrar una zona que ya usan pedidos la desactiva y lo avisa", async () => {
    db.deleteDeliveryZone.mockResolvedValue({ ok: true, result: "deactivated" });

    const r = await deleteZoneAction(Z1);

    expect(r).toMatchObject({ ok: true, notice: expect.stringMatching(/desactivada/i) });
  });

  it("un id que no es una zona no llega a la base", async () => {
    expect(await deleteZoneAction("no-es-un-uuid")).toMatchObject({ ok: false });
    expect(await setZoneActiveAction("x", true)).toMatchObject({ ok: false });
    expect(await reorderZonesAction([Z1, "x"])).toMatchObject({ ok: false });

    expect(db.deleteDeliveryZone).not.toHaveBeenCalled();
    expect(db.updateDeliveryZone).not.toHaveBeenCalled();
    expect(db.saveDeliveryZoneOrder).not.toHaveBeenCalled();
  });
});

describe("setCourierAvailabilitySwitchAction — ENVIO-193", () => {
  it("exige superadmin antes de tocar la base", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("redirect"));

    await expect(setCourierAvailabilitySwitchAction(false)).rejects.toThrow();
    expect(platform.setCourierAvailabilitySwitch).not.toHaveBeenCalled();
  });

  it("solo acepta verdadero o falso", async () => {
    const r = await setCourierAvailabilitySwitchAction("no" as unknown as boolean);

    expect(r.ok).toBe(false);
    expect(platform.setCourierAvailabilitySwitch).not.toHaveBeenCalled();
  });

  it("guarda el valor", async () => {
    platform.setCourierAvailabilitySwitch.mockResolvedValue({ ok: true });

    expect(await setCourierAvailabilitySwitchAction(false)).toEqual({ ok: true });
    expect(platform.setCourierAvailabilitySwitch).toHaveBeenCalledWith(false);
  });

  it("si la base niega el cambio (no es superadmin), da error", async () => {
    platform.setCourierAvailabilitySwitch.mockResolvedValue({ error: { code: "42501" } });

    expect((await setCourierAvailabilitySwitchAction(false)).ok).toBe(false);
  });
});

describe("setAssignMinutesAction — ENVIO-241 y 244", () => {
  it("exige superadmin antes de tocar la base", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("redirect"));

    await expect(setAssignMinutesAction("5")).rejects.toThrow();
    expect(platform.setAssignMinutesSetting).not.toHaveBeenCalled();
  });

  it("rechaza lo que no es un entero de 1 a 30 sin llamar a la base", async () => {
    requireSuperAdmin.mockResolvedValue(undefined);

    for (const bad of ["0", "31", "2.5", "", "abc"]) {
      const r = await setAssignMinutesAction(bad);
      expect(r.ok).toBe(false);
    }
    expect(platform.setAssignMinutesSetting).not.toHaveBeenCalled();
  });

  it("guarda el valor", async () => {
    requireSuperAdmin.mockResolvedValue(undefined);
    platform.setAssignMinutesSetting.mockResolvedValue({ ok: true });

    expect(await setAssignMinutesAction("3")).toEqual({ ok: true });
    expect(platform.setAssignMinutesSetting).toHaveBeenCalledWith(3);
  });

  it("si la base niega el cambio, da error", async () => {
    requireSuperAdmin.mockResolvedValue(undefined);
    platform.setAssignMinutesSetting.mockResolvedValue({ error: { code: "42501" } });

    expect((await setAssignMinutesAction("3")).ok).toBe(false);
  });
});
