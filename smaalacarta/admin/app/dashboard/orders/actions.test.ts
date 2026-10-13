// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBusiness, ordersDb } = vi.hoisted(() => ({
  requireBusiness: vi.fn(),
  ordersDb: {
    assignCourier: vi.fn(),
    confirmSettlement: vi.fn(),
    createManualOrder: vi.fn(),
    selfDelivery: vi.fn(),
    setOrderStatus: vi.fn(),
    getOrderPrepState: vi.fn(),
    setOrderPrep: vi.fn(),
  },
}));

vi.mock("@/lib/get-current-business", () => ({ requireBusiness: () => requireBusiness() }));
vi.mock("@/lib/db/orders", () => ordersDb);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { acceptOrderAction, delayPrepAction, setPrepAction } from "./actions";

const BUSINESS = "a1a1a1a1-0000-0000-0000-000000000001";
const ORDER = "11111111-1111-1111-1111-111111111111";

const pending = { status: "pending", scheduled_for: null, preorder: false, prep_ready_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  requireBusiness.mockResolvedValue({ business: { id: BUSINESS }, user: { id: "u" } });
  ordersDb.getOrderPrepState.mockResolvedValue({ ok: true, order: pending });
  ordersDb.setOrderStatus.mockResolvedValue({ ok: true });
  ordersDb.setOrderPrep.mockResolvedValue({ ok: true });
});

describe("sin sesión de un negocio no llega a la base — ADMIN-PEDIDOS-33", () => {
  beforeEach(() => {
    requireBusiness.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it.each([
    ["aceptar", () => acceptOrderAction(ORDER, 20)],
    ["cargar el tiempo", () => setPrepAction(ORDER, 20, null)],
    ["demorar", () => delayPrepAction(ORDER, null)],
  ])("%s", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    expect(ordersDb.setOrderStatus).not.toHaveBeenCalled();
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });
});

describe("aceptar con tiempo — ADMIN-PEDIDOS-31 y 33", () => {
  it("lee el pedido del negocio de la sesión, lo confirma y fija el tiempo", async () => {
    const r = await acceptOrderAction(ORDER, 25);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.getOrderPrepState).toHaveBeenCalledWith(BUSINESS, ORDER);
    expect(ordersDb.setOrderStatus).toHaveBeenCalledWith(ORDER, "confirmed");
    expect(ordersDb.setOrderPrep).toHaveBeenCalledWith(ORDER, 25, null);
    expect(ordersDb.setOrderStatus.mock.invocationCallOrder[0]).toBeLessThan(
      ordersDb.setOrderPrep.mock.invocationCallOrder[0],
    );
  });

  it("'Aceptar sin tiempo' solo confirma", async () => {
    const r = await acceptOrderAction(ORDER, null);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderStatus).toHaveBeenCalledWith(ORDER, "confirmed");
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("un tiempo fuera de 5 a 180 no confirma nada", async () => {
    for (const bad of [4, 181, 12.5, Number.NaN]) {
      const r = await acceptOrderAction(ORDER, bad);
      expect(r.ok, String(bad)).toBe(false);
    }

    expect(ordersDb.setOrderStatus).not.toHaveBeenCalled();
  });

  it("un pedido programado o anticipado se confirma sin tiempo", async () => {
    ordersDb.getOrderPrepState.mockResolvedValue({
      ok: true,
      order: { ...pending, scheduled_for: "2026-10-12T23:00:00Z" },
    });

    const r = await acceptOrderAction(ORDER, 25);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderStatus).toHaveBeenCalledWith(ORDER, "confirmed");
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("un pedido que no es del negocio no se confirma", async () => {
    ordersDb.getOrderPrepState.mockResolvedValue({ ok: true, order: null });

    const r = await acceptOrderAction(ORDER, 25);

    expect(r.ok).toBe(false);
    expect(ordersDb.setOrderStatus).not.toHaveBeenCalled();
  });

  it("si no se pudo confirmar, no intenta cargar el tiempo", async () => {
    ordersDb.setOrderStatus.mockResolvedValue({ error: { code: "P0004" } });

    const r = await acceptOrderAction(ORDER, 25);

    expect(r).toEqual({ ok: false, error: "Ese cambio de estado no está permitido." });
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("si el pedido quedó confirmado pero el tiempo falló, lo dice", async () => {
    ordersDb.setOrderPrep.mockResolvedValue({ error: { code: "XX000" } });

    const r = await acceptOrderAction(ORDER, 25);

    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/aceptó/);
    expect(!r.ok && r.error).toMatch(/tiempo/);
  });
});

describe("cargar el tiempo de un pedido aceptado — ADMIN-PEDIDOS-31", () => {
  it("fija los minutos pedidos", async () => {
    const r = await setPrepAction(ORDER, 30, null);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderPrep).toHaveBeenCalledWith(ORDER, 30, null);
  });

  it("rechaza un tiempo inválido o un motivo desconocido", async () => {
    expect((await setPrepAction(ORDER, 3, null)).ok).toBe(false);
    expect((await setPrepAction(ORDER, 30, "lluvia")).ok).toBe(false);
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });
});

describe("demorar — ADMIN-PEDIDOS-35", () => {
  const withReady = (inMinutes: number) => {
    const ready = new Date(Date.now() + inMinutes * 60_000).toISOString();
    ordersDb.getOrderPrepState.mockResolvedValue({
      ok: true,
      order: { ...pending, status: "confirmed", prep_ready_at: ready },
    });
  };

  it("suma 10 minutos a lo que falta, con el motivo", async () => {
    withReady(8);

    const r = await delayPrepAction(ORDER, "busy");

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderPrep).toHaveBeenCalledWith(ORDER, 18, "busy");
  });

  it("si ya pasó la hora, son 10 desde ahora", async () => {
    withReady(-6);

    await delayPrepAction(ORDER, null);

    expect(ordersDb.setOrderPrep).toHaveBeenCalledWith(ORDER, 10, null);
  });

  it("el motivo vacío o 'other' se manda como corresponde y uno desconocido se rechaza", async () => {
    withReady(5);

    expect((await delayPrepAction(ORDER, "other")).ok).toBe(true);
    expect(ordersDb.setOrderPrep).toHaveBeenLastCalledWith(ORDER, 15, "other");

    expect((await delayPrepAction(ORDER, "")).ok).toBe(true);
    expect(ordersDb.setOrderPrep).toHaveBeenLastCalledWith(ORDER, 15, null);

    ordersDb.setOrderPrep.mockClear();
    expect((await delayPrepAction(ORDER, "lluvia")).ok).toBe(false);
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("no demora un pedido ajeno", async () => {
    ordersDb.getOrderPrepState.mockResolvedValue({ ok: true, order: null });

    expect((await delayPrepAction(ORDER, null)).ok).toBe(false);
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });
});
