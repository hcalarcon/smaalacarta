import { whatsappDigits } from "@/lib/orders/courier";
import type { OrderItemOption } from "@/lib/orders/item-options";

// Panel del repartidor (ENVIO-31 a 33): qué grupo y qué acciones le corresponden a cada pedido.
// Reglas puras; los componentes solo pintan. La base exige lo mismo (`set_order_courier` y
// `courier_set_status`).

// Un pedido tal como lo entrega `courier_orders()` (ENVIO-15).
export type CourierPanelOrder = {
  id: string;
  numero: string;
  estado: string;
  creado: string;
  programado: string | null;
  anticipado: boolean;
  negocio: { nombre: string; direccion: string | null; whatsapp: string | null };
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null };
  // Total del pedido: lo que cobra el local (el envío se paga aparte, al repartidor).
  total: number;
  pago: string | null;
  pago_estado: string;
  notas: string | null;
  items: { nombre: string; cantidad: number; precio: number; opciones: OrderItemOption[] | null }[];
  envio: {
    zona: string | null;
    precio_lista: number | null;
    precio: number | null;
    motivo_cambio: string | null;
    cambiado_el: string | null;
    estado: string | null;
    nota: string | null;
    consultado_el: string | null;
    respondido_el: string | null;
  };
  // Rendición del efectivo (ENVIO-40): cuándo la marcó el repartidor y cuándo la confirmó el local.
  rendicion: { rendido_el: string | null; recibido_el: string | null };
};

export type PanelGroup = "por_responder" | "en_curso" | "historial";

export const GROUP_TITLES: Record<PanelGroup, string> = {
  por_responder: "Por responder",
  en_curso: "Aceptados en curso",
  historial: "Historial",
};

const FINISHED = ["delivered", "cancelled"];

// Por responder: el envío espera su respuesta. Aceptados en curso: aceptó y el pedido sigue.
// Historial: terminado, cancelado o rechazado (y cualquier estado que no se reconozca).
export function groupOf(order: Pick<CourierPanelOrder, "estado" | "envio">): PanelGroup {
  if (FINISHED.includes(order.estado)) return "historial";

  switch (order.envio.estado) {
    case "waiting":
    case "requested":
      return "por_responder";
    case "accepted":
      return "en_curso";
    default:
      return "historial";
  }
}

// El criterio de "pedido nuevo para avisar" del repartidor (`alerts.ts`).
export function isToRespond(order: Pick<CourierPanelOrder, "estado" | "envio">) {
  return groupOf(order) === "por_responder";
}

export function splitOrders(orders: CourierPanelOrder[]): Record<PanelGroup, CourierPanelOrder[]> {
  const byDate = (a: CourierPanelOrder, b: CourierPanelOrder) => a.creado.localeCompare(b.creado);

  const groups: Record<PanelGroup, CourierPanelOrder[]> = {
    por_responder: [],
    en_curso: [],
    historial: [],
  };

  for (const order of orders) groups[groupOf(order)].push(order);

  // Lo urgente primero: los más viejos; el historial, lo más reciente arriba.
  groups.por_responder.sort(byDate);
  groups.en_curso.sort(byDate);
  groups.historial.sort((a, b) => byDate(b, a));

  return groups;
}

export type PanelActions = {
  // Aceptar o "No puedo" (set_order_courier).
  respond: boolean;
  // Pasar a En camino / a Entregado (courier_set_status).
  onTheWay: boolean;
  delivered: boolean;
};

export function availableActions(order: Pick<CourierPanelOrder, "estado" | "envio">): PanelActions {
  const none: PanelActions = { respond: false, onTheWay: false, delivered: false };

  if (FINISHED.includes(order.estado)) return none;

  if (isToRespond(order)) return { ...none, respond: true };

  if (order.envio.estado === "accepted") {
    if (order.estado === "handed_to_courier") return { ...none, onTheWay: true };
    if (order.estado === "on_the_way") return { ...none, delivered: true };
  }

  return none;
}

// Abre un chat de WhatsApp con ese número, o null si no hay.
export function chatLink(phone: string | null | undefined) {
  const digits = whatsappDigits(phone);
  return digits ? `https://api.whatsapp.com/send?phone=${digits}` : null;
}

// Llamada: solo dígitos, y el + si el número lo traía. Null si no hay número.
export function telLink(phone: string | null | undefined) {
  const text = String(phone ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;

  return `tel:${text.startsWith("+") ? "+" : ""}${digits}`;
}
