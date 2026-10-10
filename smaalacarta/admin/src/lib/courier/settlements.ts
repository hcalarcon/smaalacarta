import type { CourierPanelOrder } from "./panel";
import { formatMoney } from "@/lib/promotions/pricing";

// Rendiciones del efectivo (ENVIO-38 a 43). En un pedido con envío pagado en efectivo el repartidor
// cobra el pedido y el envío: lo del pedido (`total`, sin el envío) lo rinde al local. Se marca pedido
// por pedido, en dos pasos (Rendido → Recibido), y las marcas no se deshacen. La base exige lo mismo
// (`courier_mark_settled` y `business_confirm_settlement`); acá solo se decide qué mostrar.

export type SettlementState =
  // Nada que rendir: otro medio de pago, sin envío con repartidor o el pedido todavía no se entregó.
  | "none"
  // Entregado en efectivo y sin marcar: el repartidor debe rendirlo.
  | "to_settle"
  // El repartidor lo marcó; falta que el local confirme.
  | "settled"
  // El local confirmó que lo recibió.
  | "received";

export type SettlementInput = {
  withCourier: boolean;
  payment: string | null;
  status: string;
  settledAt: string | null;
  receivedAt: string | null;
};

export function settlementState(input: SettlementInput): SettlementState {
  if (!input.withCourier || input.payment !== "efectivo" || input.status !== "delivered") return "none";

  if (input.receivedAt) return "received";
  if (input.settledAt) return "settled";
  return "to_settle";
}

export function settlementLabel(state: SettlementState, amount: number) {
  switch (state) {
    case "to_settle":
      return `A rendir ${formatMoney(amount)}`;
    case "settled":
      return "Rendido, esperando confirmación";
    case "received":
      return "Recibido por el local";
    default:
      return "";
  }
}

// Quién puede dar el paso que sigue: el repartidor marca Rendido; el local, Recibido.
export const canMarkSettled = (state: SettlementState) => state === "to_settle";
export const canConfirmReceived = (state: SettlementState) => state === "settled";

export type SettlementTotals = {
  // Entregado en efectivo y todavía sin rendir.
  pending: number;
  // Rendido por el repartidor, sin confirmar por el local.
  settled: number;
  // Recibido por el local.
  received: number;
};

export function sumSettlements(items: { state: SettlementState; amount: number }[]): SettlementTotals {
  const totals: SettlementTotals = { pending: 0, settled: 0, received: 0 };

  for (const item of items) {
    const amount = Number(item.amount) || 0;
    if (item.state === "to_settle") totals.pending += amount;
    else if (item.state === "settled") totals.settled += amount;
    else if (item.state === "received") totals.received += amount;
  }

  return totals;
}

// ---- Panel del local (pedidos de `listOrders`) ----

export const localOrderState = (order: {
  courier_id: string | null;
  payment: string | null;
  status: string;
  settled_at: string | null;
  settlement_received_at: string | null;
}): SettlementState =>
  settlementState({
    withCourier: order.courier_id !== null,
    payment: order.payment,
    status: order.status,
    settledAt: order.settled_at,
    receivedAt: order.settlement_received_at,
  });

// ---- Panel del repartidor (pedidos de `courier_orders()`) ----

export const courierOrderState = (order: CourierPanelOrder): SettlementState =>
  settlementState({
    withCourier: true,
    payment: order.pago,
    status: order.estado,
    settledAt: order.rendicion.rendido_el ?? null,
    receivedAt: order.rendicion.recibido_el ?? null,
  });

export type BusinessSettlement = SettlementTotals & { business: string };

// Totales por local, el que más debe primero. Un local sin nada que rendir no aparece.
export function totalsByBusiness(orders: CourierPanelOrder[]): BusinessSettlement[] {
  const byBusiness = new Map<string, { state: SettlementState; amount: number }[]>();

  for (const order of orders) {
    const state = courierOrderState(order);
    if (state === "none") continue;

    const list = byBusiness.get(order.negocio.nombre) ?? [];
    list.push({ state, amount: order.total });
    byBusiness.set(order.negocio.nombre, list);
  }

  return [...byBusiness.entries()]
    .map(([business, items]) => ({ business, ...sumSettlements(items) }))
    .sort((a, b) => b.pending - a.pending || a.business.localeCompare(b.business, "es"));
}

export function grandTotals(rows: SettlementTotals[]): SettlementTotals {
  return rows.reduce<SettlementTotals>(
    (acc, row) => ({
      pending: acc.pending + row.pending,
      settled: acc.settled + row.settled,
      received: acc.received + row.received,
    }),
    { pending: 0, settled: 0, received: 0 },
  );
}
