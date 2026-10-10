import { describe, expect, it } from "vitest";

import type { CourierPanelOrder } from "./panel";
import {
  canConfirmReceived,
  canMarkSettled,
  courierOrderState,
  grandTotals,
  settlementLabel,
  settlementState,
  sumSettlements,
  totalsByBusiness,
} from "./settlements";

const input = (extra: Partial<Parameters<typeof settlementState>[0]> = {}) => ({
  withCourier: true,
  payment: "efectivo",
  status: "delivered",
  settledAt: null,
  receivedAt: null,
  ...extra,
});

describe("estado de la rendición — ENVIO-38 y 42", () => {
  it("entregado en efectivo y sin marcar: a rendir", () => {
    expect(settlementState(input())).toBe("to_settle");
  });

  it("rendido por el repartidor: esperando confirmación", () => {
    expect(settlementState(input({ settledAt: "2026-10-10T20:00:00Z" }))).toBe("settled");
  });

  it("recibido por el local", () => {
    expect(
      settlementState(input({ settledAt: "2026-10-10T20:00:00Z", receivedAt: "2026-10-10T21:00:00Z" })),
    ).toBe("received");
  });

  it("sin nada que rendir: otro medio de pago, sin repartidor o sin entregar", () => {
    expect(settlementState(input({ payment: "transferencia" }))).toBe("none");
    expect(settlementState(input({ payment: "mercadopago" }))).toBe("none");
    expect(settlementState(input({ payment: null }))).toBe("none");
    expect(settlementState(input({ withCourier: false }))).toBe("none");
    expect(settlementState(input({ status: "on_the_way" }))).toBe("none");
    expect(settlementState(input({ status: "cancelled" }))).toBe("none");
  });

  it("cada paso lo da quien corresponde, y solo una vez", () => {
    expect(canMarkSettled("to_settle")).toBe(true);
    expect(canMarkSettled("settled")).toBe(false);
    expect(canMarkSettled("received")).toBe(false);
    expect(canMarkSettled("none")).toBe(false);

    expect(canConfirmReceived("settled")).toBe(true);
    expect(canConfirmReceived("to_settle")).toBe(false);
    expect(canConfirmReceived("received")).toBe(false);
    expect(canConfirmReceived("none")).toBe(false);
  });

  it("rótulos", () => {
    expect(settlementLabel("to_settle", 8200)).toMatch(/^A rendir \$\s?8\.200/);
    expect(settlementLabel("settled", 8200)).toBe("Rendido, esperando confirmación");
    expect(settlementLabel("received", 8200)).toBe("Recibido por el local");
    expect(settlementLabel("none", 8200)).toBe("");
  });
});

const order = (id: string, business: string, total: number, extra: Partial<CourierPanelOrder> = {}) =>
  ({
    id,
    numero: id,
    estado: "delivered",
    negocio: { nombre: business, direccion: null, whatsapp: null },
    total,
    pago: "efectivo",
    rendicion: { rendido_el: null, recibido_el: null },
    ...extra,
  }) as unknown as CourierPanelOrder;

describe("totales por local — ENVIO-42", () => {
  const orders = [
    order("1", "Ana Resto", 8000),
    order("2", "Ana Resto", 2000),
    order("3", "Ana Resto", 5000, { rendicion: { rendido_el: "2026-10-10T20:00:00Z", recibido_el: null } }),
    order("4", "Ana Resto", 1000, {
      rendicion: { rendido_el: "2026-10-10T20:00:00Z", recibido_el: "2026-10-10T21:00:00Z" },
    }),
    order("5", "Beto Bar", 3000, { rendicion: { rendido_el: "2026-10-10T20:00:00Z", recibido_el: null } }),
    order("6", "Beto Bar", 9999, { pago: "transferencia" }),
    order("7", "Beto Bar", 7777, { estado: "on_the_way" }),
    order("8", "Cami Café", 4000, { pago: "tarjeta" }),
  ];

  it("separa pendiente, rendido sin confirmar y recibido", () => {
    expect(totalsByBusiness(orders)).toEqual([
      { business: "Ana Resto", pending: 10000, settled: 5000, received: 1000 },
      { business: "Beto Bar", pending: 0, settled: 3000, received: 0 },
    ]);
  });

  it("un local sin nada que rendir no aparece", () => {
    expect(totalsByBusiness(orders).some((row) => row.business === "Cami Café")).toBe(false);
  });

  it("suma el total general", () => {
    expect(grandTotals(totalsByBusiness(orders))).toEqual({ pending: 10000, settled: 8000, received: 1000 });
  });

  it("el estado de un pedido sale de rendicion", () => {
    expect(courierOrderState(orders[0])).toBe("to_settle");
    expect(courierOrderState(orders[2])).toBe("settled");
    expect(courierOrderState(orders[3])).toBe("received");
    expect(courierOrderState(orders[5])).toBe("none");
  });

  it("sin pedidos, todo en cero", () => {
    expect(totalsByBusiness([])).toEqual([]);
    expect(sumSettlements([])).toEqual({ pending: 0, settled: 0, received: 0 });
  });
});
