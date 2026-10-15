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

import { acceptOrderAction, createManualOrderAction, adjustPrepAction, setPrepAction } from "./actions";

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
    ["demorar", () => adjustPrepAction(ORDER, 10, null)],
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
    expect(ordersDb.setOrderStatus).toHaveBeenCalledWith(ORDER, "confirmed", undefined, "pending");
    expect(ordersDb.setOrderPrep).toHaveBeenCalledWith(ORDER, 25, null);
    expect(ordersDb.setOrderStatus.mock.invocationCallOrder[0]).toBeLessThan(
      ordersDb.setOrderPrep.mock.invocationCallOrder[0],
    );
  });

  it("'Aceptar sin tiempo' solo confirma", async () => {
    const r = await acceptOrderAction(ORDER, null);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderStatus).toHaveBeenCalledWith(ORDER, "confirmed", undefined, "pending");
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
    expect(ordersDb.setOrderStatus).toHaveBeenCalledWith(ORDER, "confirmed", undefined, "pending");
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

describe("aceptar dos veces seguidas deja un solo cambio — ADMIN-PEDIDOS-51", () => {
  it("un pedido que ya no está pendiente no se vuelve a confirmar ni a fijarle el tiempo", async () => {
    ordersDb.getOrderPrepState.mockResolvedValue({ ok: true, order: { ...pending, status: "confirmed" } });

    const r = await acceptOrderAction(ORDER, 25);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderStatus).not.toHaveBeenCalled();
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("si otro pedido de aceptar se coló entre la lectura y el cambio, tampoco da error ni repite el tiempo", async () => {
    ordersDb.getOrderPrepState
      .mockResolvedValueOnce({ ok: true, order: pending })
      .mockResolvedValueOnce({ ok: true, order: { ...pending, status: "confirmed" } });
    ordersDb.setOrderStatus.mockResolvedValue({ error: { code: "P0004" } });

    const r = await acceptOrderAction(ORDER, 25);

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("dos aceptar en paralelo confirman y fijan el tiempo una sola vez", async () => {
    let status = "pending";
    ordersDb.getOrderPrepState.mockImplementation(async () => ({ ok: true, order: { ...pending, status } }));
    ordersDb.setOrderStatus.mockImplementation(async () => {
      if (status !== "pending") return { error: { code: "P0004" } };
      status = "confirmed";
      return { ok: true };
    });

    const [a, b] = await Promise.all([acceptOrderAction(ORDER, 25), acceptOrderAction(ORDER, 25)]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(ordersDb.setOrderPrep).toHaveBeenCalledTimes(1);
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

describe("cambiar la demora — ADMIN-PEDIDOS-35 y 52", () => {
  const withReady = (inMinutes: number) => {
    const ready = new Date(Date.now() + inMinutes * 60_000).toISOString();
    ordersDb.getOrderPrepState.mockResolvedValue({
      ok: true,
      order: { ...pending, status: "confirmed", prep_ready_at: ready },
    });
  };

  it("suma 10 minutos a lo que falta, con el motivo", async () => {
    withReady(8);

    const r = await adjustPrepAction(ORDER, 10, "busy");

    expect(r).toEqual({ ok: true });
    expect(ordersDb.setOrderPrep).toHaveBeenCalledWith(ORDER, 18, "busy");
  });

  it("si ya pasó la hora, son 10 desde ahora", async () => {
    withReady(-6);

    await adjustPrepAction(ORDER, 10, null);

    expect(ordersDb.setOrderPrep).toHaveBeenCalledWith(ORDER, 10, null);
  });

  it("baja la demora: resta a lo que falta y no baja de 5", async () => {
    withReady(20);
    await adjustPrepAction(ORDER, -5, null);
    expect(ordersDb.setOrderPrep).toHaveBeenLastCalledWith(ORDER, 15, null);

    withReady(6);
    await adjustPrepAction(ORDER, -5, null);
    expect(ordersDb.setOrderPrep).toHaveBeenLastCalledWith(ORDER, 5, null);
  });

  it("solo acepta los saltos de la lista", async () => {
    withReady(20);
    ordersDb.setOrderPrep.mockClear();

    for (const bad of [0, 7, -30, 1000, Number.NaN]) {
      expect((await adjustPrepAction(ORDER, bad, null)).ok, String(bad)).toBe(false);
    }
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("el motivo vacío o 'other' se manda como corresponde y uno desconocido se rechaza", async () => {
    withReady(5);

    expect((await adjustPrepAction(ORDER, 10, "other")).ok).toBe(true);
    expect(ordersDb.setOrderPrep).toHaveBeenLastCalledWith(ORDER, 15, "other");

    expect((await adjustPrepAction(ORDER, 10, "")).ok).toBe(true);
    expect(ordersDb.setOrderPrep).toHaveBeenLastCalledWith(ORDER, 15, null);

    ordersDb.setOrderPrep.mockClear();
    expect((await adjustPrepAction(ORDER, 10, "lluvia")).ok).toBe(false);
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });

  it("no demora un pedido ajeno", async () => {
    ordersDb.getOrderPrepState.mockResolvedValue({ ok: true, order: null });

    expect((await adjustPrepAction(ORDER, 10, null)).ok).toBe(false);
    expect(ordersDb.setOrderPrep).not.toHaveBeenCalled();
  });
});

describe("pedido manual — ADMIN-PEDIDOS-39 a 46", () => {
  const input = {
    customerName: "Lucía",
    delivery: "retiro",
    payment: "qr",
    notes: "",
    items: [{ kind: "free" as const, name: "Torta", unitPrice: 1000, quantity: 1 }],
  };

  it("sin sesión de un negocio no llega a la base", async () => {
    requireBusiness.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(createManualOrderAction(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(ordersDb.createManualOrder).not.toHaveBeenCalled();
  });

  it("un pedido inválido vuelve con los campos marcados y no llega a la base", async () => {
    const r = await createManualOrderAction({ ...input, delivery: "delivery", phone: "" });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors?.phone).toBeTruthy();
    expect(ordersDb.createManualOrder).not.toHaveBeenCalled();
  });

  it("con envío con repartidor exige barrio, dirección y modo", async () => {
    requireBusiness.mockResolvedValue({ business: { id: BUSINESS, courier_delivery: true }, user: { id: "u" } });

    const r = await createManualOrderAction({ ...input, delivery: "delivery", phone: "3515551234" });

    expect(!r.ok && Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["address", "courierMode", "zoneId"]);
    expect(ordersDb.createManualOrder).not.toHaveBeenCalled();
  });

  it("toma el negocio de la sesión y devuelve el número y el código", async () => {
    ordersDb.createManualOrder.mockResolvedValue({ ok: true, id: "o1", code: "abc", number: 12, total: 1000 });

    const r = await createManualOrderAction(input);

    expect(r).toEqual({ ok: true, code: "abc", number: 12, total: 1000 });
    expect(ordersDb.createManualOrder).toHaveBeenCalledWith(BUSINESS, input, false);
  });

  it("traduce el error de la base sin mostrar el texto técnico", async () => {
    ordersDb.createManualOrder.mockResolvedValue({ error: { code: "P0009", message: "boom" } });

    const r = await createManualOrderAction(input);

    expect(r).toEqual({ ok: false, error: "Un producto está sin stock." });
  });
});
