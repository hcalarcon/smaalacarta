// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCourier, courierDb } = vi.hoisted(() => ({
  requireCourier: vi.fn(),
  courierDb: {
    courierSetStatus: vi.fn(),
    courierMarkSettled: vi.fn(),
    setZoneCoverage: vi.fn(),
    courierTakeOrder: vi.fn(),
    courierDeclineOrder: vi.fn(),
    courierReturnOrder: vi.fn(),
  },
}));

vi.mock("@/lib/auth/courier", () => ({ requireCourier: () => requireCourier() }));
vi.mock("@/lib/db/courier", () => courierDb);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  advanceOrderAction,
  declineOrderAction,
  returnOrderAction,
  setZoneCoverageAction,
  takeOrderAction,
} from "./actions";

const COURIER = "7a0c0e00-0000-4000-8000-000000000001";
const ORDER = "11111111-1111-1111-1111-111111111111";
const input = { note: "", fee: "", reason: "" };

beforeEach(() => {
  vi.clearAllMocks();
  requireCourier.mockResolvedValue({ user: { id: "u" }, courierId: COURIER });
  for (const fn of Object.values(courierDb)) {
    fn.mockResolvedValue({ ok: true });
  }
});

describe("quien no es el repartidor no llega a la base — ENVIO-30 y 79", () => {
  beforeEach(() => {
    requireCourier.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it.each([
    ["tomar", () => takeOrderAction(ORDER, input, 5000)],
    ["rechazar", () => declineOrderAction(ORDER)],
    ["devolver", () => returnOrderAction(ORDER, "Motivo")],
    ["avanzar", () => advanceOrderAction(ORDER, "on_the_way")],
    ["marcar una zona", () => setZoneCoverageAction("22222222-2222-2222-2222-222222222222", true)],
  ])("%s", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");

    for (const fn of Object.values(courierDb)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("tomar un pedido — ENVIO-77", () => {
  it("toma con nota y precio igual: no manda precio ni motivo", async () => {
    const r = await takeOrderAction(ORDER, { note: " Juan, 21:30 ", fee: "5000", reason: "" }, 5000);

    expect(r).toEqual({ ok: true });
    expect(courierDb.courierTakeOrder).toHaveBeenCalledWith(ORDER, {
      note: "Juan, 21:30",
      fee: null,
      feeReason: null,
    });
  });

  it("un precio distinto sin motivo se rechaza antes de llamar a la base", async () => {
    const r = await takeOrderAction(ORDER, { note: "", fee: "26000", reason: "" }, 5000);

    expect(r).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(courierDb.courierTakeOrder).not.toHaveBeenCalled();
  });

  it("un precio distinto con motivo se manda", async () => {
    await takeOrderAction(ORDER, { note: "", fee: "26.000", reason: "Fuera de zona" }, 5000);

    expect(courierDb.courierTakeOrder).toHaveBeenCalledWith(ORDER, {
      note: null,
      fee: 26000,
      feeReason: "Fuera de zona",
    });
  });

  it("si ya lo tomó otro (P0019), la respuesta lo marca para que el panel lo saque", async () => {
    courierDb.courierTakeOrder.mockResolvedValue({ error: { code: "P0019", message: "boom" } });

    const r = await takeOrderAction(ORDER, input, 5000);
    expect(r).toMatchObject({ ok: false, taken: true, error: expect.stringMatching(/otro repartidor/i) });
  });

  it("traduce otros errores de la base, sin texto técnico ni `taken`", async () => {
    courierDb.courierTakeOrder.mockResolvedValue({ error: { code: "P0004", message: "boom" } });

    const r = await takeOrderAction(ORDER, input, 5000);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no está permitido/i) });
    expect(r).not.toHaveProperty("taken");
  });
});

describe("rechazar un pedido — ENVIO-65", () => {
  it("llama a la base con el pedido", async () => {
    expect(await declineOrderAction(ORDER)).toEqual({ ok: true });
    expect(courierDb.courierDeclineOrder).toHaveBeenCalledWith(ORDER);
  });

  it("si ya no estaba disponible, lo marca como tomado", async () => {
    courierDb.courierDeclineOrder.mockResolvedValue({ error: { code: "P0019" } });
    expect(await declineOrderAction(ORDER)).toMatchObject({ ok: false, taken: true });
  });
});

describe("devolver un pedido — ENVIO-66", () => {
  it("manda el motivo recortado", async () => {
    expect(await returnOrderAction(ORDER, "  Se pinchó la moto ")).toEqual({ ok: true });
    expect(courierDb.courierReturnOrder).toHaveBeenCalledWith(ORDER, "Se pinchó la moto");
  });

  it("sin motivo no llega a la base", async () => {
    const r = await returnOrderAction(ORDER, "   ");

    expect(r).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(courierDb.courierReturnOrder).not.toHaveBeenCalled();
  });

  it("traduce el error de la base", async () => {
    courierDb.courierReturnOrder.mockResolvedValue({ error: { code: "P0004", message: "boom" } });
    const r = await returnOrderAction(ORDER, "Motivo");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no está permitido/i) });
  });
});

describe("avanzar un pedido — ENVIO-77", () => {
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

describe("Mis zonas — ENVIO-57", () => {
  const ZONE = "22222222-2222-2222-2222-222222222222";

  it("el repartidor sale de la sesión: la base recibe ese id, no uno del navegador", async () => {
    const on = await setZoneCoverageAction(ZONE, true);
    const off = await setZoneCoverageAction(ZONE, false);

    expect(on).toEqual({ ok: true });
    expect(off).toEqual({ ok: true });
    expect(courierDb.setZoneCoverage).toHaveBeenNthCalledWith(1, COURIER, ZONE, true);
    expect(courierDb.setZoneCoverage).toHaveBeenNthCalledWith(2, COURIER, ZONE, false);
  });

  it("un id que no es una zona no llega a la base", async () => {
    const r = await setZoneCoverageAction("no-es-un-uuid", true);

    expect(r).toMatchObject({ ok: false });
    expect(courierDb.setZoneCoverage).not.toHaveBeenCalled();
  });

  it("si la base falla, devuelve un mensaje sin texto técnico", async () => {
    courierDb.setZoneCoverage.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });

    const r = await setZoneCoverageAction(ZONE, true);
    expect(r).toMatchObject({ ok: false, error: expect.not.stringMatching(/permission/) });
  });

  it("quien no es repartidor no llega a la base", async () => {
    requireCourier.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(setZoneCoverageAction(ZONE, true)).rejects.toThrow("NEXT_REDIRECT");
    expect(courierDb.setZoneCoverage).not.toHaveBeenCalled();
  });
});
