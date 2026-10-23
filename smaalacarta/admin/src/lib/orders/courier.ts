import { formatMoney } from "@/lib/promotions/pricing";
import { PAYMENT_OPTIONS } from "@/lib/settings/payment";
import { isFinal, type DeliveryContext } from "./status";

// Envío con repartidor en el panel del local (ENVIO-80 a 86). Reglas puras: el panel las lee, la base
// las exige igual (`business_assign_courier`, `business_self_delivery`, `set_order_status`).

// Lo que estas reglas leen de un pedido (un subconjunto de `Order`).
export type CourierOrder = {
  order_number: string;
  code: string;
  status: string;
  total: number;
  payment: string | null;
  payment_status: string;
  scheduled_for: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  courier_id: string | null;
  delivery_zone_id: string | null;
  courier_zone_id?: string | null;
  delivery_zone_name: string | null;
  delivery_fee_list: number | null;
  delivery_fee: number | null;
  delivery_fee_reason: string | null;
  delivery_fee_changed_at: string | null;
  courier_status: string | null;
  courier_note: string | null;
  courier_responded_at: string | null;
  // Cuándo se abrió la búsqueda (al crearse el pedido, o al devolverlo el repartidor elegido).
  offered_at: string | null;
  // Cómo se reparte (ENVIO-146): `fixed` lo toma el primero que llega, `offers` se oferta.
  delivery_mode?: string | null;
  // Cuándo llega al local, según lo que cargó el repartidor (ENVIO-157).
  courier_eta_pickup_at?: string | null;
  // Lo devolvió después de que el local cambió la demora (ENVIO-159).
  returned_reason_kind?: string | null;
  returned_reason?: string | null;
  // El local pidió auto (ENVIO-176).
  needs_car?: boolean;
};

// Una oferta de repartidor tal como la entrega `business_order_offers()` (ENVIO-111).
export type OrderOffer = {
  id: string;
  courier_id: string;
  repartidor: string;
  precio: number;
  motivo: string | null;
  favorito: boolean;
  // Moto y/o auto del repartidor; falta con el interruptor apagado (ENVIO-178).
  vehiculo?: string[];
};

// Las ofertas abiertas de un pedido que busca repartidor, con cuándo se elige sola (ENVIO-105).
export type OrderOffers = { order_id: string; cierra_en: string | null; ofertas: OrderOffer[] };

// Un repartidor activo que cubre alguna zona del local (`business_delivery_options()`).
export type OrderCourier = {
  id: string;
  name: string;
  whatsapp: string | null;
  zone_ids: string[];
  // Sus zonas propias activas (ENVIO-231): un pedido con zona propia solo lo asigna a su dueño.
  own_zone_ids?: string[];
  // Moto y/o auto; falta con el interruptor apagado (ENVIO-178).
  vehiculo?: string[];
};

// Pasados estos minutos sin ninguna oferta, el panel lo destaca (ENVIO-118).
export const SEARCH_WARNING_MINUTES = 10;

// ¿El pedido tiene un repartidor asignado (lo tomó uno o lo asignó el local)?
export function hasCourier(order: Pick<CourierOrder, "courier_id">) {
  return Boolean(order.courier_id);
}

// ¿El pedido lleva envío con repartidor, aunque todavía no haya quién lo lleve?
export function hasDelivery(order: Pick<CourierOrder, "courier_status">) {
  return order.courier_status !== null && order.courier_status !== undefined;
}

// Lo que `status.ts` necesita para elegir el camino de estados de este pedido.
export function deliveryContext(
  order: Pick<CourierOrder, "courier_id" | "courier_status">,
): DeliveryContext {
  return {
    courier: hasCourier(order),
    courierStatus: order.courier_status,
    actor: "business",
  };
}

export type CourierActions = {
  // Asignarlo a mano a un repartidor, o llevarlo el local: durante toda la búsqueda (ENVIO-81).
  assign: boolean;
  self: boolean;
};

export function courierActions(order: Pick<CourierOrder, "courier_status" | "status">): CourierActions {
  const open = order.courier_status === "searching" && !isFinal(order.status);

  return { assign: open, self: open };
}

const TIME_ZONE = "America/Argentina/Buenos_Aires";

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

// HH:MM de Argentina, o null si la fecha no es válida.
export function clockTime(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : timeFormatter.format(date);
}

// "m:ss" de una cuenta regresiva en milisegundos; 0:00 si ya pasó.
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Qué pasa con las ofertas de un pedido que busca repartidor (ENVIO-117): "Esperando ofertas", o cuántas
// hay y en cuánto se elige sola. `null` si el pedido no está buscando.
export function offersLabel(offers: OrderOffers | undefined, now: Date): string {
  const count = offers?.ofertas.length ?? 0;
  if (!offers || count === 0) return "Esperando ofertas";

  const noun = count === 1 ? "oferta" : "ofertas";
  const closes = offers.cierra_en ? new Date(offers.cierra_en).getTime() : NaN;

  if (Number.isNaN(closes)) return `${count} ${noun}, el cliente está eligiendo`;

  const left = closes - now.getTime();
  return left > 0
    ? `${count} ${noun}, el cliente está eligiendo (se elige sola en ${formatCountdown(left)})`
    : `${count} ${noun}, se está eligiendo la más barata`;
}

// ¿Este pedido recibe ofertas? Solo en el modo de ofertas: en precio fijo el local no ve conteo ni lista
// (ENVIO-154). Un pedido sin modo (de antes) se trata como de ofertas.
export const acceptsOffers = (order: Pick<CourierOrder, "delivery_mode">) => order.delivery_mode !== "fixed";

// Aviso "Nadie ofertó todavía" a los `SEARCH_WARNING_MINUTES` de abierta la búsqueda sin ninguna oferta
// (ENVIO-118), o null. `offerCount` es cuántas ofertas abiertas hay. En precio fijo no hay ofertas: dice
// "Nadie lo tomó todavía" (ENVIO-154).
export function searchWarning(
  order: Pick<CourierOrder, "courier_status" | "offered_at" | "status" | "delivery_mode">,
  now: Date,
  offerCount = 0,
): string | null {
  if (order.courier_status !== "searching" || !order.offered_at || isFinal(order.status)) return null;
  if (offerCount > 0) return null;

  const since = new Date(order.offered_at).getTime();
  if (Number.isNaN(since)) return null;

  const minutes = Math.floor((now.getTime() - since) / 60_000);
  if (minutes < SEARCH_WARNING_MINUTES) return null;

  const what = order.delivery_mode === "fixed" ? "Nadie lo tomó todavía" : "Nadie ofertó todavía";

  return `${what} (${minutes} min): asignalo a mano o llevalo vos.`;
}

// Cómo está el envío, en una línea (ENVIO-80). `courierName` es el nombre del repartidor que lo tomó,
// si el local lo conoce.
export function courierStatusLabel(
  order: Pick<CourierOrder, "courier_status" | "offered_at"> & Partial<Pick<CourierOrder, "status">>,
  courierName?: string | null,
) {
  switch (order.courier_status) {
    case "waiting":
      // Un anticipado o programado sin confirmar: se ofrece cuando el local lo confirma (ENVIO-123).
      return order.status === "pending"
        ? "Se ofrece a los repartidores cuando lo confirmes"
        : "Todavía sin repartidor";
    case "searching": {
      const since = clockTime(order.offered_at);
      return since ? `Buscando repartidor desde las ${since}` : "Buscando repartidor";
    }
    case "accepted":
      return courierName ? `Lo tomó ${courierName}` : "Lo tomó un repartidor";
    case "self":
      return "Lo llevás vos";
    // Pedidos de antes de la búsqueda abierta.
    case "requested":
      return "Consultado al repartidor";
    case "rejected":
      return "El repartidor no puede";
    default:
      return "Sin envío con repartidor";
  }
}

// "Llega al local a las 21:40", si el repartidor cargó el tiempo y todavía no retiró el pedido (ENVIO-164).
export function pickupEtaNotice(
  order: Pick<CourierOrder, "courier_status" | "status" | "courier_eta_pickup_at">,
): string | null {
  if (order.courier_status !== "accepted") return null;
  if (!["pending", "confirmed", "preparing", "ready"].includes(order.status)) return null;

  const time = clockTime(order.courier_eta_pickup_at);
  return time ? `Llega al local a las ${time}` : null;
}

// "Lo devolvió: {motivo}" mientras el pedido vuelve a buscar repartidor (ENVIO-164 y 166).
export function returnedNotice(
  order: Pick<CourierOrder, "courier_status" | "status" | "returned_reason_kind" | "returned_reason">,
): string | null {
  if (order.courier_status !== "searching") return null;
  if (order.status === "delivered" || order.status === "cancelled") return null;

  switch (order.returned_reason_kind) {
    case "delay_changed":
      return "Lo devolvió: cambió la demora";
    case "vehicle":
      return "Lo devolvió: problema con el vehículo";
    case "other": {
      const text = order.returned_reason?.trim();
      return text ? `Lo devolvió: ${text}` : null;
    }
    default:
      return null;
  }
}

// Los repartidores activos que cubren la zona del pedido (los que se pueden asignar a mano), por nombre.
export function couriersForOrder(
  couriers: OrderCourier[],
  order: Pick<CourierOrder, "delivery_zone_id" | "needs_car"> & { courier_zone_id?: string | null },
): OrderCourier[] {
  // Zona propia del repartidor (tipo de precio `courier`): los que la tienen activa, que hoy es su dueño.
  if (order.courier_zone_id) {
    const own = order.courier_zone_id;
    return couriers
      .filter((courier) => courier.own_zone_ids?.includes(own))
      .filter((courier) => !order.needs_car || courier.vehiculo === undefined || courier.vehiculo.includes("auto"))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  if (!order.delivery_zone_id) return [];

  // Si el pedido necesita auto, solo los que lo tienen. `vehiculo` solo llega con el interruptor prendido: sin él
  // no hay con qué filtrar, y el servidor tampoco filtra (ENVIO-177).
  return couriers
    .filter((courier) => courier.zone_ids.includes(order.delivery_zone_id as string))
    .filter((courier) => !order.needs_car || courier.vehiculo === undefined || courier.vehiculo.includes("auto"))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// El precio final del envío y, si cambió, el de lista y el motivo.
export function feeSummary(
  order: Pick<CourierOrder, "delivery_fee" | "delivery_fee_list" | "delivery_fee_reason">,
): { price: string; list?: string; reason?: string } {
  const price = formatMoney(Number(order.delivery_fee ?? 0));

  const changed =
    order.delivery_fee !== null &&
    order.delivery_fee_list !== null &&
    Number(order.delivery_fee) !== Number(order.delivery_fee_list);

  if (!changed) return { price };

  return {
    price,
    list: formatMoney(Number(order.delivery_fee_list)),
    ...(order.delivery_fee_reason ? { reason: order.delivery_fee_reason } : {}),
  };
}

// Qué cobra el repartidor en la puerta (ENVIO-38 y 41). En efectivo cobra el pedido y el envío: lo del
// pedido lo rinde al local y el envío es suyo. Con otro medio de pago solo cobra el envío.
export function collectionInfo({
  payment,
  total,
  fee,
}: {
  payment: string | null;
  total: number;
  fee: number | null;
}) {
  const order = Number(total) || 0;
  const delivery = Number(fee ?? 0) || 0;
  const cash = payment === "efectivo";

  const label = PAYMENT_OPTIONS.find((option) => option.key === payment)?.label ?? payment ?? "otro medio";

  const text = cash
    ? `Cobrar al cliente: ${formatMoney(order)} + ${formatMoney(delivery)} = ${formatMoney(order + delivery)} (rendir ${formatMoney(order)} al local)`
    : `Pagado con ${label}: cobrar solo el envío ${formatMoney(delivery)}`;

  return {
    cash,
    // Lo que el cliente le paga al repartidor y lo que de eso se rinde al local.
    toCollect: cash ? order + delivery : delivery,
    toSettle: cash ? order : 0,
    text,
  };
}

// Número listo para WhatsApp: solo dígitos y, si es argentino de 10 dígitos (con o sin 0 delante),
// con 549 adelante. Igual que en el menú público. Vacío si no hay dígitos.
export function whatsappDigits(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  const local = digits.replace(/^0/, "");
  return local.length === 10 ? `549${local}` : digits;
}

export const OFFER_REASON_MIN = 3;
export const OFFER_REASON_MAX = 140;

export type OfferInput = { price: string; reason: string };

export type OfferResult =
  | { ok: true; price: number; reason: string | null }
  | { ok: false; errors: Partial<Record<"price" | "reason", string>> };

// Valida la oferta del repartidor (ENVIO-98): el precio es obligatorio ("26000", "26.000" o "$ 26.000");
// si es distinto del de lista, el motivo también (de 3 a 140 caracteres), y se guarda; con el de lista el
// motivo se descarta.
export function validateOffer(input: OfferInput, listPrice: number): OfferResult {
  const errors: Partial<Record<"price" | "reason", string>> = {};

  const raw = input.price.replace(/[$\s.]/g, "").replace(",", ".");
  let price = NaN;

  if (raw === "") {
    errors.price = "Escribí el precio de tu oferta.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) >= 100_000_000) {
    errors.price = "Escribí un precio válido, por ejemplo 26000.";
  } else {
    price = Number(raw);
  }

  const reason = input.reason.trim();
  const changed = Number.isFinite(price) && price !== Number(listPrice);

  if (changed && reason === "") {
    errors.reason = "Contá por qué cambia el precio del envío.";
  } else if (changed && (reason.length < OFFER_REASON_MIN || reason.length > OFFER_REASON_MAX)) {
    errors.reason = `El motivo va de ${OFFER_REASON_MIN} a ${OFFER_REASON_MAX} caracteres.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, price, reason: changed ? reason : null };
}

// La nota opcional al asignar a mano un repartidor (ENVIO-81): hasta 120 caracteres.
export function validateAssignNote(
  value: string,
): { ok: true; note: string | null } | { ok: false; error: string } {
  const note = value.trim();

  if (note.length > 120) return { ok: false, error: "La nota admite hasta 120 caracteres." };

  return { ok: true, note: note || null };
}
