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
  // Qué evento lo generó, y si es de los que tienen que sonar fuerte (ADMIN-PWA-36): el service worker
  // elige cómo mostrarlo con esto.
  kind: PushEventKind;
  urgent: boolean;
  // Solo en los urgentes: el número y el total ya formateado, para el cuerpo de la notificación.
  number?: string;
  total?: string;
};

export type MessageContext = {
  businessName: string;
  courierName?: string | null;
  // Si al repartidor lo asignó el local en vez de elegirlo el cliente.
  assignedByLocal?: boolean;
  // "Ahora", para el "hace X min" del recordatorio. Se inyecta para poder probarlo.
  now?: Date;
};

// Los avisos al local de pedido nuevo y su recordatorio: no pueden pasar desapercibidos.
export function isUrgent(kind: PushEventKind): boolean {
  return kind === "local_new_order" || kind === "local_new_order_reminder";
}

// Cuánto vive el aviso en el servicio push si el aparato está apagado. Un pedido nuevo de hace más de un
// minuto lo cubre el siguiente recordatorio; el resto de los avisos conserva los 10 minutos de siempre.
const URGENT_TTL_SECONDS = 60;
const DEFAULT_TTL_SECONDS = 10 * 60;

export function ttlSeconds(message: PushMessage): number {
  return message.urgent ? URGENT_TTL_SECONDS : DEFAULT_TTL_SECONDS;
}

// Lo que viaja al service worker, como JSON. Un solo lugar para que `deps.ts` no arme campos a mano.
export function pushPayload(message: PushMessage): string {
  return JSON.stringify({
    title: message.title,
    body: message.body,
    tag: message.tag,
    url: message.url,
    kind: message.kind,
    urgent: message.urgent,
    ...(message.number !== undefined ? { number: message.number } : {}),
    ...(message.total !== undefined ? { total: message.total } : {}),
  });
}

// Minutos enteros que lleva esperando, y nunca menos de 1 (un reloj atrasado no resta).
function waitingMinutes(createdAt: string, now: Date): number {
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  return Number.isFinite(elapsed) ? Math.max(1, Math.floor(elapsed / 60_000)) : 1;
}

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
  const message: PushMessage = { ...compose(kind, order, ctx), kind, urgent: isUrgent(kind) };

  if (message.urgent) {
    message.number = order.order_number;
    const total = formatPesos(order.total);
    if (total) message.total = total;
  }

  return message;
}

type Composed = Pick<PushMessage, "title" | "body" | "url" | "tag">;

function compose(kind: PushEventKind, order: OrderRecord, ctx: MessageContext): Composed {
  const courierPanel = `${BASE_PATH}/repartidor`;
  const ordersPanel = `${BASE_PATH}/dashboard/orders`;
  const number = `#${order.order_number}`;
  const zone = order.delivery_zone_name ?? "";
  // El recordatorio comparte el tag del aviso original: reemplaza esa notificación y vuelve a sonar
  // (`renotify`) en vez de apilarse.
  const tag = `order-${order.id}-${kind === "local_new_order_reminder" ? "local_new_order" : kind}`;
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
    case "local_new_order_reminder":
      return {
        title: `Pedido ${number} sin atender hace ${waitingMinutes(order.created_at, ctx.now ?? new Date())} min`,
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
