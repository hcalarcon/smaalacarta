import { BASE_PATH } from "@/lib/base-path";

import type { OrderRecord, PushEventKind } from "./events";

// Los textos de los avisos (ADMIN-PWA-18 a 24).
export type PushMessage = {
  title: string;
  body: string;
  // Ruta con el `basePath` ya puesto: el service worker la abre tal cual.
  url: string;
  // Un aviso por pedido y evento: el sistema reemplaza el anterior en vez de apilar repetidos.
  tag: string;
};

export type MessageContext = {
  businessName: string;
  courierName?: string | null;
  // Si al repartidor lo asignó el local en vez de elegirlo el cliente.
  assignedByLocal?: boolean;
};

// "$5.000" o "$5.000,50": punto de miles y coma decimal, sin depender de ICU.
export function formatPesos(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";

  const [whole, decimals] = Math.abs(amount).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = decimals === "00" ? "" : `,${decimals}`;

  return `${amount < 0 ? "-" : ""}$${grouped}${cents}`;
}

function deliveryLabel(delivery: string | null): string {
  if (delivery === "delivery") return "Envío a domicilio";
  if (delivery === "retiro") return "Retiro en el local";
  return "Pedido";
}

export function buildMessage(kind: PushEventKind, order: OrderRecord, ctx: MessageContext): PushMessage {
  const courierPanel = `${BASE_PATH}/repartidor`;
  const ordersPanel = `${BASE_PATH}/dashboard/orders`;
  const number = `#${order.order_number}`;
  const zone = order.delivery_zone_name ?? "";
  const tag = `order-${order.id}-${kind}`;
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

  switch (kind) {
    case "offer_new":
      return {
        title: "Pedido nuevo para ofertar",
        body: join(ctx.businessName, zone, formatPesos(order.delivery_fee_list)),
        url: courierPanel,
        tag,
      };
    case "courier_chosen":
      return {
        title: "¡Te eligieron!",
        body: ctx.assignedByLocal
          ? `${ctx.businessName} te asignó un envío`
          : join(ctx.businessName, number, zone),
        url: courierPanel,
        tag,
      };
    case "courier_not_chosen":
      return {
        title: "Eligieron otro repartidor",
        body: join(ctx.businessName, zone),
        url: courierPanel,
        tag,
      };
    case "order_cancelled":
      return {
        title: "Pedido cancelado",
        body: join(ctx.businessName, number),
        url: courierPanel,
        tag,
      };
    case "local_new_order":
      return {
        title: `Pedido nuevo ${number}`,
        body: join(order.customer_name ?? "", deliveryLabel(order.delivery)),
        url: ordersPanel,
        tag,
      };
    case "local_courier_chosen":
      return {
        title: `${number}: lo lleva ${ctx.courierName ?? "un repartidor"}`,
        body: formatPesos(order.delivery_fee),
        url: ordersPanel,
        tag,
      };
    case "local_no_offers":
      return {
        title: `${number}: nadie ofertó todavía`,
        body: "Asignalo a mano o llevalo vos",
        url: ordersPanel,
        tag,
      };
  }
}
