// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCourier, courierDb, ordersDb } = vi.hoisted(() => ({
  requireCourier: vi.fn(),
  courierDb: {
    createZone: vi.fn(),
    courierSetStatus: vi.fn(),
    deleteZone: vi.fn(),
    listZones: vi.fn(),
    saveZoneOrder: vi.fn(),
    updateZone: vi.fn(),
  },
  ordersDb: { setOrderCourier: vi.fn() },
}));

vi.mock("@/lib/auth/courier", () => ({ requireCourier: () => requireCourier() }));
vi.mock("@/lib/db/courier", () => courierDb);
vi.mock("@/lib/db/orders", () => ordersDb);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  advanceOrderAction,
  createZoneAction,
  deleteZoneAction,
  reorderZonesAction,
  respondOrderAction,
  updateZoneAction,
} from "./actions";

const COURIER = "7a0c0e00-0000-4000-8000-000000000001";
const ORDER = "11111111-1111-1111-1111-111111111111";
const input = { note: "", fee: "", reason: "" };

beforeEach(() => {
  vi.clearAllMocks();
  requireCourier.mockResolvedValue({ user: { id: "u" }, courierId: COURIER });
  courierDb.listZones.mockResolvedValue([{ id: "z1", name: "Cantera", price: 5000, sort_order: 1, active: true }]);
  for (const fn of [
    courierDb.createZone,
    courierDb.courierSetStatus,
    courierDb.deleteZone,
    courierDb.saveZoneOrder,
    courierDb.updateZone,
    ordersDb.setOrderCourier,
  ]) {
    fn.mockResolvedValue({ ok: true });
  }
});

describe("quien no es el repartidor no llega a la base — ENVIO-30", () => {
  beforeEach(() => {
    requireCourier.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it.each([
    ["responder", () => respondOrderAction(ORDER, "accept", input, 5000)],
    ["avanzar", () => advanceOrderAction(ORDER, "on_the_way")],
    ["crear barrio", () => createZoneAction({ name: "Oasis", price: "5500" })],
    ["editar barrio", () => updateZoneAction("z1", { name: "Oasis", price: "5500" })],
    ["borrar barrio", () => deleteZoneAction("z1")],
    ["ordenar barrios", () => reorderZonesAction(["z1"])],
  ])("%s", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");

    for (const fn of [...Object.values(courierDb), ...Object.values(ordersDb)]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("responder un pedido — ENVIO-32", () => {
  it("acepta con nota y precio igual: no manda precio ni motivo", async () => {
    const r = await respondOrderAction(ORDER, "accept", { note: " Juan, 21:30 ", fee: "5000", reason: "" }, 5000);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderCourier).toHaveBeenCalledWith(ORDER, {
      action: "accept",
      note: "Juan, 21:30",
      fee: null,
      feeReason: null,
    });
  });

  it("un precio distinto sin motivo se rechaza antes de llamar a la base", async () => {
    const r = await respondOrderAction(ORDER, "accept", { note: "", fee: "26000", reason: "" }, 5000);

    expect(r).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(ordersDb.setOrderCourier).not.toHaveBeenCalled();
  });

  it("un precio distinto con motivo se manda", async () => {
    await respondOrderAction(ORDER, "accept", { note: "", fee: "26.000", reason: "Fuera de zona" }, 5000);

    expect(ordersDb.setOrderCourier).toHaveBeenCalledWith(ORDER, {
      action: "accept",
      note: null,
      fee: 26000,
      feeReason: "Fuera de zona",
    });
  });

  it("No puedo ignora cualquier precio", async () => {
    await respondOrderAction(ORDER, "reject", { note: "Sin moto", fee: "9999", reason: "" }, 5000);

    expect(ordersDb.setOrderCourier).toHaveBeenCalledWith(ORDER, {
      action: "reject",
      note: "Sin moto",
      fee: null,
      feeReason: null,
    });
  });

  it("una acción desconocida no llega a la base", async () => {
    const r = await respondOrderAction(ORDER, "request" as never, input, 5000);
    expect(r).toMatchObject({ ok: false });
    expect(ordersDb.setOrderCourier).not.toHaveBeenCalled();
  });

  it("traduce el error de la base, sin texto técnico", async () => {
    ordersDb.setOrderCourier.mockResolvedValue({ error: { code: "P0004", message: "boom" } });
    const r = await respondOrderAction(ORDER, "accept", input, 5000);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no está permitido/i) });
  });
});

describe("avanzar un pedido — ENVIO-32", () => {
  it("manda En camino y Entregado a courier_set_status", async () => {
    await advanceOrderAction(ORDER, "on_the_way");
    await advanceOrderAction(ORDER, "delivered");

    expect(courierDb.courierSetStatus).toHaveBeenNthCalledWith(1, ORDER, "on_the_way");
    expect(courierDb.courierSetStatus).toHaveBeenNthCalledWith(2, ORDER, "delivered");
  });

  it("un estado que no es del repartidor no llega a la base", async () => {
    const r = await advanceOrderAction(ORDER, "confirmed" as never);
    expect(r).toMatchObject({ ok: false });
    expect(courierDb.courierSetStatus).not.toHaveBeenCalled();
  });
});

describe("barrios — ENVIO-36 y 37", () => {
  it("el repartidor sale de la sesión: las funciones reciben ese id, no uno del navegador", async () => {
    await createZoneAction({ name: " Oasis ", price: "5.500" });
    await deleteZoneAction("z1");
    await reorderZonesAction(["z1", "z2"]);

    expect(courierDb.createZone).toHaveBeenCalledWith(COURIER, { name: "Oasis", price: 5500 });
    expect(courierDb.deleteZone).toHaveBeenCalledWith(COURIER, "z1");
    expect(courierDb.saveZoneOrder).toHaveBeenCalledWith(COURIER, ["z1", "z2"]);
  });

  it("rechaza un nombre repetido o un precio inválido sin llamar a la base", async () => {
    const repetido = await createZoneAction({ name: "cantera", price: "1" });
    expect(repetido).toMatchObject({ ok: false, fieldErrors: { name: expect.stringMatching(/ya existe/i) } });

    const caro = await createZoneAction({ name: "Oasis", price: "-1" });
    expect(caro).toMatchObject({ ok: false, fieldErrors: { price: expect.any(String) } });

    expect(courierDb.createZone).not.toHaveBeenCalled();
  });

  it("editar un barrio le deja su propio nombre", async () => {
    const r = await updateZoneAction("z1", { name: "Cantera", price: "6000" });

    expect(r).toEqual({ ok: true });
    expect(courierDb.updateZone).toHaveBeenCalledWith(COURIER, "z1", { name: "Cantera", price: 6000 });
  });

  it("un nombre repetido que la base rechaza (23505) se dice como error del campo", async () => {
    courierDb.createZone.mockResolvedValue({ error: { code: "23505" } });
    const r = await createZoneAction({ name: "Oasis", price: "1" });
    expect(r).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
  });
});
