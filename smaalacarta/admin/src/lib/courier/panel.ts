import { whatsappDigits } from "@/lib/orders/courier";
import type { OrderItemOption } from "@/lib/orders/item-options";

import type { CourierTimes } from "./times";

// Panel del repartidor (ENVIO-76 a 79 y 113 a 116): qué grupo y qué acciones le corresponden a cada
// pedido. Reglas puras; los componentes solo pintan. La base exige lo mismo (`courier_make_offer`,
// `courier_return_order` y `courier_set_status`).

// Cómo cerró una oferta que el repartidor había hecho (ENVIO-101): lo eligieron a otro, se canceló el
// pedido o el local lo resolvió (lo asignó a mano o lo lleva él).
export type OfferResult = "chosen_other" | "cancelled" | "closed";

// Título del panel: el nombre del repartidor que entró, o "Repartidor" si no tiene (ENVIO-126).
export function courierPanelTitle(name: string | null | undefined) {
  return name?.trim() || "Repartidor";
}

// Un pedido disponible tal como lo entrega `courier_available_orders()` (ENVIO-101 y 71). Antes de que lo
// elijan el repartidor no ve nada del cliente: ni nombre, ni teléfono, ni dirección.
export type AvailableOrder = {
  id: string;
  numero: string;
  estado: string;
  creado: string;
  // Cuándo se abrió la búsqueda.
  ofrecido_el: string | null;
  // La hora estimada de listo y la demora que cargó el local (ENVIO-156). La demora falta en un programado.
  listo_a?: string | null;
  demora_min?: number | null;
  programado: string | null;
  anticipado: boolean;
  // El local pidió auto (ENVIO-176); la base solo lo manda con el interruptor del vehículo prendido.
  necesita_auto?: boolean;
  negocio: { nombre: string; direccion: string | null };
  // Total del pedido: lo que cobra el local (el envío se paga aparte, al repartidor).
  total: number;
  pago: string | null;
  pago_estado: string;
  // `otro_precio`: el negocio acepta ofertas con otro precio (ENVIO-226); falta en los datos viejos y vale `true`.
  envio: { zona: string | null; precio_lista: number | null; otro_precio?: boolean };
  // Cómo se reparte (ENVIO-145): `fixed` se toma al precio de lista, `offers` se oferta.
  modo?: "fixed" | "offers" | null;
  // Cuántas ofertas abiertas hay (sin nombres ni precios de los demás) y la propia, si ya ofertó.
  ofertas: number;
  mi_oferta: { id: string; precio: number; motivo: string | null; creada: string } | null;
  // Nulo mientras sigue recibiendo ofertas; si no, cómo se cerró la suya.
  resultado: OfferResult | null;
  cerrado_el: string | null;
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
  items: { nombre: string; cantidad: number; precio: number; opciones: OrderItemOption[] | null; nota?: string | null }[];
  envio: {
    zona: string | null;
    precio_lista: number | null;
    precio: number | null;
    // El costo del envío se coordina con el local y todavía no está cargado (ENVIO-262).
    precio_pendiente?: boolean;
    motivo_cambio: string | null;
    cambiado_el: string | null;
    estado: string | null;
    nota: string | null;
    consultado_el: string | null;
    respondido_el: string | null;
  };
  // La hora de listo y los dos "llego en X" (ENVIO-157).
  tiempos?: CourierTimes;
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

// El criterio de "pedido nuevo para avisar" del repartidor (`alerts.ts`): un pedido que sigue recibiendo
// ofertas y por el que todavía no ofertó. Es el predicado que recibe `useNewOrderAlert`.
export function isToRespond(order: Pick<AvailableOrder, "estado" | "resultado" | "mi_oferta">) {
  return !FINISHED.includes(order.estado) && !order.resultado && !order.mi_oferta;
}

// El aviso de una oferta que se cerró (ENVIO-115), o null si el pedido sigue recibiendo ofertas.
export function resultNotice(order: Pick<AvailableOrder, "resultado">): string | null {
  switch (order.resultado) {
    case "chosen_other":
      return "El cliente eligió otro repartidor";
    case "cancelled":
      return "Cancelado por el local";
    case "closed":
      return "El local resolvió el envío";
    default:
      return null;
  }
}

// Los pedidos que había ofertado y ya aparecen entre los suyos en curso: lo eligieron (ENVIO-116). Sirve
// para avisar con otro sonido. `offered` son los ids con oferta en la lectura anterior.
export function chosenOrderIds(offered: ReadonlySet<string>, orders: Pick<CourierPanelOrder, "id" | "estado" | "envio">[]) {
  return orders
    .filter((order) => offered.has(order.id) && groupOf(order) === "en_curso")
    .map((order) => order.id);
}

// "Tu oferta: $X, esperando al cliente" (ENVIO-114).
export function myOfferLabel(order: Pick<AvailableOrder, "mi_oferta">, format: (value: number) => string) {
  return order.mi_oferta ? `Tu oferta: ${format(Number(order.mi_oferta.precio))}, esperando al cliente` : null;
}

// "1 oferta" / "3 ofertas" / "Sin ofertas todavía" (ENVIO-113).
export function offersCountLabel(count: number) {
  if (count <= 0) return "Sin ofertas todavía";
  return count === 1 ? "1 oferta" : `${count} ofertas`;
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

// Los disponibles, del que lleva más tiempo buscando al más nuevo; los avisos de ofertas ya cerradas,
// al final.
export function sortAvailable(orders: AvailableOrder[]): AvailableOrder[] {
  const key = (order: AvailableOrder) => order.ofrecido_el ?? order.creado;
  const closed = (order: AvailableOrder) => (order.resultado ? 1 : 0);

  return [...orders].sort((a, b) => closed(a) - closed(b) || key(a).localeCompare(key(b)));
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

export const RETURN_REASON_MIN = 3;
export const RETURN_REASON_MAX = 140;

// Por qué devuelve el pedido (ENVIO-166): dos motivos fijos y "Otro", que lleva texto.
export type ReturnKind = "delay_changed" | "vehicle" | "other";

export const RETURN_KINDS: { kind: ReturnKind; label: string }[] = [
  { kind: "delay_changed", label: "Cambió la demora" },
  { kind: "vehicle", label: "Problema con el vehículo" },
  { kind: "other", label: "Otro" },
];

// Los botones en el orden en que se muestran: si el local cambió la demora y el repartidor todavía no lo
// resolvió, "Cambió la demora" va primero; si no, queda en el medio.
export function returnKindOptions(delayChanged: boolean) {
  const [delay, vehicle, other] = RETURN_KINDS;
  return delayChanged ? [delay, vehicle, other] : [vehicle, delay, other];
}

// El motivo de devolver un pedido: un tipo, y con "Otro" un texto de 3 a 140 caracteres (ENVIO-166).
export function validateReturn(
  kind: string,
  reason: string,
): { ok: true; kind: ReturnKind; reason: string | null } | { ok: false; error: string } {
  if (kind !== "delay_changed" && kind !== "vehicle" && kind !== "other") {
    return { ok: false, error: "Elegí por qué devolvés el pedido." };
  }

  if (kind !== "other") return { ok: true, kind, reason: null };

  const value = reason.trim();

  if (value.length < RETURN_REASON_MIN) {
    return { ok: false, error: `Contá el motivo, con al menos ${RETURN_REASON_MIN} letras.` };
  }
  if (value.length > RETURN_REASON_MAX) {
    return { ok: false, error: `El motivo admite hasta ${RETURN_REASON_MAX} caracteres.` };
  }

  return { ok: true, kind, reason: value };
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
