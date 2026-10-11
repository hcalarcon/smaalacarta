import { whatsappDigits } from "@/lib/orders/courier";
import type { OrderItemOption } from "@/lib/orders/item-options";

// Panel del repartidor (ENVIO-76 a 79): qué grupo y qué acciones le corresponden a cada pedido.
// Reglas puras; los componentes solo pintan. La base exige lo mismo (`courier_take_order`,
// `courier_return_order` y `courier_set_status`).

// Un pedido disponible tal como lo entrega `courier_available_orders()` (ENVIO-62 y 71). Antes de
// tomarlo el repartidor no ve nada del cliente: ni nombre, ni teléfono, ni dirección.
export type AvailableOrder = {
  id: string;
  numero: string;
  estado: string;
  creado: string;
  // Cuándo se abrió la búsqueda.
  ofrecido_el: string | null;
  programado: string | null;
  anticipado: boolean;
  negocio: { nombre: string; direccion: string | null };
  // Total del pedido: lo que cobra el local (el envío se paga aparte, al repartidor).
  total: number;
  pago: string | null;
  pago_estado: string;
  envio: { zona: string | null; precio_lista: number | null; precio: number | null };
};

// Un pedido que el repartidor ya tomó, tal como lo entrega `courier_orders()` (ENVIO-15).
export type CourierPanelOrder = {
  id: string;
  numero: string;
  estado: string;
  creado: string;
  programado: string | null;
  anticipado: boolean;
  negocio: { nombre: string; direccion: string | null; whatsapp: string | null };
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null };
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

export type PanelGroup = "disponibles" | "en_curso" | "historial";

export const GROUP_TITLES: Record<PanelGroup, string> = {
  disponibles: "Disponibles",
  en_curso: "Mis envíos en curso",
  historial: "Historial",
};

const FINISHED = ["delivered", "cancelled"];

// Antes de este estado el local todavía no se lo entregó al repartidor: se puede devolver.
const RETURNABLE = ["pending", "confirmed", "preparing", "ready"];

// De los pedidos que ya tomó: en curso mientras el envío está aceptado y el pedido sigue; el resto
// (terminados, cancelados, y los viejos que quedaron sin aceptar) va al historial.
export function groupOf(order: Pick<CourierPanelOrder, "estado" | "envio">): Exclude<PanelGroup, "disponibles"> {
  if (FINISHED.includes(order.estado)) return "historial";

  return order.envio.estado === "accepted" ? "en_curso" : "historial";
}

// El criterio de "pedido nuevo para avisar" del repartidor (`alerts.ts`): un pedido disponible que
// sigue abierto. Es el predicado que recibe `useNewOrderAlert`.
export function isToRespond(order: Pick<AvailableOrder, "estado">) {
  return !FINISHED.includes(order.estado);
}

export function splitOrders(
  orders: CourierPanelOrder[],
): Record<Exclude<PanelGroup, "disponibles">, CourierPanelOrder[]> {
  const byDate = (a: CourierPanelOrder, b: CourierPanelOrder) => a.creado.localeCompare(b.creado);

  const groups: Record<Exclude<PanelGroup, "disponibles">, CourierPanelOrder[]> = {
    en_curso: [],
    historial: [],
  };

  for (const order of orders) groups[groupOf(order)].push(order);

  // Lo urgente primero: los más viejos; el historial, lo más reciente arriba.
  groups.en_curso.sort(byDate);
  groups.historial.sort((a, b) => byDate(b, a));

  return groups;
}

// Los disponibles, del que lleva más tiempo buscando al más nuevo.
export function sortAvailable(orders: AvailableOrder[]): AvailableOrder[] {
  const key = (order: AvailableOrder) => order.ofrecido_el ?? order.creado;
  return [...orders].sort((a, b) => key(a).localeCompare(key(b)));
}

export type PanelActions = {
  // Devolver el pedido que tomó (courier_return_order), antes de que el local se lo entregue.
  returnOrder: boolean;
  // Pasar a En camino / a Entregado (courier_set_status).
  onTheWay: boolean;
  delivered: boolean;
};

export function availableActions(order: Pick<CourierPanelOrder, "estado" | "envio">): PanelActions {
  const none: PanelActions = { returnOrder: false, onTheWay: false, delivered: false };

  if (FINISHED.includes(order.estado) || order.envio.estado !== "accepted") return none;

  if (RETURNABLE.includes(order.estado)) return { ...none, returnOrder: true };
  if (order.estado === "handed_to_courier") return { ...none, onTheWay: true };
  if (order.estado === "on_the_way") return { ...none, delivered: true };

  return none;
}

export const RETURN_REASON_MAX = 200;

// El motivo de devolver un pedido: obligatorio, hasta 200 caracteres (ENVIO-66).
export function validateReturnReason(
  reason: string,
): { ok: true; reason: string } | { ok: false; error: string } {
  const value = reason.trim();

  if (value === "") return { ok: false, error: "Contá por qué devolvés el pedido." };
  if (value.length > RETURN_REASON_MAX) {
    return { ok: false, error: `El motivo admite hasta ${RETURN_REASON_MAX} caracteres.` };
  }

  return { ok: true, reason: value };
}

// Abre un chat de WhatsApp con ese número (con un texto de entrada, si se pasa), o null si no hay número.
export function chatLink(phone: string | null | undefined, text?: string) {
  const digits = whatsappDigits(phone);
  if (!digits) return null;

  const base = `https://api.whatsapp.com/send?phone=${digits}`;
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}

// Llamada: solo dígitos, y el + si el número lo traía. Null si no hay número.
export function telLink(phone: string | null | undefined) {
  const text = String(phone ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;

  return `tel:${text.startsWith("+") ? "+" : ""}${digits}`;
}
