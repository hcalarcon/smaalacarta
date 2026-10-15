// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCourier, courierDb } = vi.hoisted(() => ({
  requireCourier: vi.fn(),
  courierDb: {
    courierSetStatus: vi.fn(),
    courierMarkSettled: vi.fn(),
    setZoneCoverage: vi.fn(),
    courierMakeOffer: vi.fn(),
    courierTakeOrder: vi.fn(),
    courierWithdrawOffer: vi.fn(),
    courierDeclineOrder: vi.fn(),
    courierReturnOrder: vi.fn(),
    courierSetEta: vi.fn(),
  },
}));

vi.mock("@/lib/auth/courier", () => ({ requireCourier: () => requireCourier() }));
vi.mock("@/lib/db/courier", () => courierDb);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  advanceOrderAction,
  declineOrderAction,
  makeOfferAction,
  returnOrderAction,
  setEtaAction,
  setZoneCoverageAction,
  takeOrderAction,
  withdrawOfferAction,
} from "./actions";

const COURIER = "7a0c0e00-0000-4000-8000-000000000001";
const ORDER = "11111111-1111-1111-1111-111111111111";
const input = { price: "5000", reason: "" };

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
    ["ofertar", () => makeOfferAction(ORDER, input, 5000)],
    ["tomar", () => takeOrderAction(ORDER)],
    ["retirar la oferta", () => withdrawOfferAction(ORDER)],
    ["rechazar", () => declineOrderAction(ORDER)],
    ["devolver", () => returnOrderAction(ORDER, "other", "Motivo")],
    ["avanzar", () => advanceOrderAction(ORDER, "on_the_way")],
    ["cargar el tiempo", () => setEtaAction(ORDER, "pickup", 10)],
    ["marcar una zona", () => setZoneCoverageAction("22222222-2222-2222-2222-222222222222", true)],
  ])("%s", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");

    for (const fn of Object.values(courierDb)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("ofertar por un pedido — ENVIO-98 y 113", () => {
  it("con el precio de lista manda el precio y ningún motivo", async () => {
    const r = await makeOfferAction(ORDER, { price: "5.000", reason: "no hace falta" }, 5000);

    expect(r).toEqual({ ok: true });
    expect(courierDb.courierMakeOffer).toHaveBeenCalledWith(ORDER, { price: 5000, reason: null });
  });

  it("un precio distinto sin motivo se rechaza antes de llamar a la base", async () => {
    const r = await makeOfferAction(ORDER, { price: "26000", reason: "" }, 5000);

    expect(r).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(courierDb.courierMakeOffer).not.toHaveBeenCalled();
  });

  it("un precio distinto con motivo se manda", async () => {
    await makeOfferAction(ORDER, { price: "26.000", reason: " Fuera de zona " }, 5000);

    expect(courierDb.courierMakeOffer).toHaveBeenCalledWith(ORDER, { price: 26000, reason: "Fuera de zona" });
  });

  it("si el pedido ya no recibe ofertas (P0020), la respuesta lo marca para que el panel lo saque", async () => {
    courierDb.courierMakeOffer.mockResolvedValue({ error: { code: "P0020", message: "boom" } });

    const r = await makeOfferAction(ORDER, input, 5000);
    expect(r).toMatchObject({ ok: false, closed: true, error: expect.stringMatching(/no recibe ofertas/i) });
  });

  it("traduce otros errores de la base, sin texto técnico ni `closed`", async () => {
    courierDb.courierMakeOffer.mockResolvedValue({ error: { code: "P0004", message: "boom" } });

    const r = await makeOfferAction(ORDER, input, 5000);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no está permitido/i) });
    expect(r).not.toHaveProperty("closed");
  });
});

describe("tomar un pedido de precio fijo — ENVIO-147", () => {
  it("llama a la base solo con el pedido: no manda precio ni motivo", async () => {
    expect(await takeOrderAction(ORDER)).toEqual({ ok: true });
    expect(courierDb.courierTakeOrder).toHaveBeenCalledWith(ORDER);
  });

  it("si lo tomó otro (P0019), lo dice y lo marca como cerrado", async () => {
    courierDb.courierTakeOrder.mockResolvedValue({ error: { code: "P0019", message: "boom" } });

    const r = await takeOrderAction(ORDER);
    expect(r).toMatchObject({ ok: false, closed: true, error: "Ya lo tomó otro repartidor." });
  });

  it("si el pedido es de ofertas (P0023), también lo marca como cerrado", async () => {
    courierDb.courierTakeOrder.mockResolvedValue({ error: { code: "P0023", message: "boom" } });
    expect(await takeOrderAction(ORDER)).toMatchObject({ ok: false, closed: true });
  });
});

describe("retirar la oferta — ENVIO-100", () => {
  it("llama a la base con el pedido", async () => {
    expect(await withdrawOfferAction(ORDER)).toEqual({ ok: true });
    expect(courierDb.courierWithdrawOffer).toHaveBeenCalledWith(ORDER);
  });

  it("si el cliente ya eligió, lo marca como cerrado", async () => {
    courierDb.courierWithdrawOffer.mockResolvedValue({ error: { code: "P0020" } });
    expect(await withdrawOfferAction(ORDER)).toMatchObject({ ok: false, closed: true });
  });
});

describe("rechazar un pedido — ENVIO-65", () => {
  it("llama a la base con el pedido", async () => {
    expect(await declineOrderAction(ORDER)).toEqual({ ok: true });
    expect(courierDb.courierDeclineOrder).toHaveBeenCalledWith(ORDER);
  });

  it("si ya no estaba disponible, lo marca como cerrado", async () => {
    courierDb.courierDeclineOrder.mockResolvedValue({ error: { code: "P0020" } });
    expect(await declineOrderAction(ORDER)).toMatchObject({ ok: false, closed: true });
  });
});

describe("devolver un pedido — ENVIO-66", () => {
  it("manda el motivo recortado", async () => {
    expect(await returnOrderAction(ORDER, "other", "  Se pinchó la moto ")).toEqual({ ok: true });
    expect(courierDb.courierReturnOrder).toHaveBeenCalledWith(ORDER, "other", "Se pinchó la moto");
  });

  it("un motivo fijo se manda sin texto", async () => {
    expect(await returnOrderAction(ORDER, "delay_changed", "")).toEqual({ ok: true });
    expect(courierDb.courierReturnOrder).toHaveBeenCalledWith(ORDER, "delay_changed", null);
  });

  it("'Otro' sin motivo no llega a la base", async () => {
    const r = await returnOrderAction(ORDER, "other", "   ");

    expect(r).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(courierDb.courierReturnOrder).not.toHaveBeenCalled();
  });

  it("traduce el error de la base", async () => {
    courierDb.courierReturnOrder.mockResolvedValue({ error: { code: "P0004", message: "boom" } });
    const r = await returnOrderAction(ORDER, "other", "Motivo");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no está permitido/i) });
  });
});

describe("avanzar un pedido — ENVIO-77", () => {
  it("manda En camino y Entregado a courier_set_status", async () => {
    await advanceOrderAction(ORDER, "on_the_way");
    await advanceOrderAction(ORDER, "delivered");

    expect(courierDb.courierSetStatus).toHaveBeenNthCalledWith(1, ORDER, "on_the_way", undefined);
    expect(courierDb.courierSetStatus).toHaveBeenNthCalledWith(2, ORDER, "delivered", undefined);
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

describe("tiempos de llegada — ENVIO-157", () => {
  it("carga el tiempo con el pedido y el tipo, y la base recibe los minutos validados", async () => {
    const result = await setEtaAction(ORDER, "pickup", 15);

    expect(result).toEqual({ ok: true });
    expect(courierDb.courierSetEta).toHaveBeenCalledWith(ORDER, "pickup", 15);
  });

  it.each([0, 121, 7.5, Number.NaN])("rechaza %s sin llamar a la base", async (minutes) => {
    const result = await setEtaAction(ORDER, "pickup", minutes);

    expect(result.ok).toBe(false);
    expect(courierDb.courierSetEta).not.toHaveBeenCalled();
  });

  it("rechaza un tipo desconocido", async () => {
    const result = await setEtaAction(ORDER, "otro" as never, 10);

    expect(result.ok).toBe(false);
    expect(courierDb.courierSetEta).not.toHaveBeenCalled();
  });

  it("si la base lo rechaza, devuelve el error", async () => {
    courierDb.courierSetEta.mockResolvedValue({ error: { code: "P0002" } });

    const result = await setEtaAction(ORDER, "pickup", 10);
    expect(result.ok).toBe(false);
  });

  it("En camino con tiempo: carga el tiempo al cliente y después cambia el estado", async () => {
    const calls: string[] = [];
    courierDb.courierSetEta.mockImplementation(async () => {
      calls.push("eta");
      return { ok: true };
    });
    courierDb.courierSetStatus.mockImplementation(async () => {
      calls.push("status");
      return { ok: true };
    });

    const result = await advanceOrderAction(ORDER, "on_the_way", 15);

    expect(result).toEqual({ ok: true });
    expect(courierDb.courierSetEta).toHaveBeenCalledWith(ORDER, "dropoff", 15);
    expect(calls).toEqual(["eta", "status"]);
  });

  it("En camino con un tiempo inválido no cambia el estado", async () => {
    const result = await advanceOrderAction(ORDER, "on_the_way", 500);

    expect(result.ok).toBe(false);
    expect(courierDb.courierSetStatus).not.toHaveBeenCalled();
  });

  it("En camino sin tiempo sigue como antes", async () => {
    await advanceOrderAction(ORDER, "on_the_way");

    expect(courierDb.courierSetEta).not.toHaveBeenCalled();
    expect(courierDb.courierSetStatus).toHaveBeenCalledWith(ORDER, "on_the_way", undefined);
  });

  it("lleva el estado de origen a la base (ADMIN-PEDIDOS-57)", async () => {
    await advanceOrderAction(ORDER, "delivered", undefined, "on_the_way");

    expect(courierDb.courierSetStatus).toHaveBeenCalledWith(ORDER, "delivered", "on_the_way");
  });
});
