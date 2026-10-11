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
  delivery_zone_name: string | null;
  delivery_fee_list: number | null;
  delivery_fee: number | null;
  delivery_fee_reason: string | null;
  delivery_fee_changed_at: string | null;
  courier_status: string | null;
  courier_note: string | null;
  courier_responded_at: string | null;
  // Cuándo se abrió la búsqueda y, si el local tiene favorito, quién y hasta cuándo lo ve solo.
  offered_at: string | null;
  offer_favorite_id: string | null;
  offer_favorite_until: string | null;
};

// Un repartidor activo que cubre alguna zona del local (`business_delivery_options()`).
export type OrderCourier = { id: string; name: string; whatsapp: string | null; zone_ids: string[] };

// Pasados estos minutos sin que nadie lo tome, el panel lo destaca (ENVIO-82).
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

// La ventana en la que solo lo ve el favorito: cuándo termina, o null si no hay o ya terminó.
export function favoriteWindow(
  order: Pick<CourierOrder, "courier_status" | "offer_favorite_id" | "offer_favorite_until">,
  now: Date,
): { until: string } | null {
  if (order.courier_status !== "searching" || !order.offer_favorite_id || !order.offer_favorite_until) {
    return null;
  }

  const until = new Date(order.offer_favorite_until).getTime();
  if (Number.isNaN(until) || until <= now.getTime()) return null;

  return { until: timeFormatter.format(new Date(until)) };
}

// Aviso "Nadie lo tomó todavía" a los `SEARCH_WARNING_MINUTES` de abierta la búsqueda (ENVIO-82), o null.
export function searchWarning(
  order: Pick<CourierOrder, "courier_status" | "offered_at" | "status">,
  now: Date,
): string | null {
  if (order.courier_status !== "searching" || !order.offered_at || isFinal(order.status)) return null;

  const since = new Date(order.offered_at).getTime();
  if (Number.isNaN(since)) return null;

  const minutes = Math.floor((now.getTime() - since) / 60_000);
  if (minutes < SEARCH_WARNING_MINUTES) return null;

  return `Nadie lo tomó todavía (${minutes} min): asignalo a mano o llevalo vos.`;
}

// Cómo está el envío, en una línea (ENVIO-80). `courierName` es el nombre del repartidor que lo tomó,
// si el local lo conoce.
export function courierStatusLabel(
  order: Pick<CourierOrder, "courier_status" | "offered_at">,
  courierName?: string | null,
) {
  switch (order.courier_status) {
    case "waiting":
      return "Al confirmar se busca repartidor";
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

// "Lo ve solo {favorito} hasta las HH:MM" mientras dura la ventana, o null.
export function favoriteWindowLabel(
  order: Pick<CourierOrder, "courier_status" | "offer_favorite_id" | "offer_favorite_until">,
  now: Date,
  favoriteName?: string | null,
) {
  const window = favoriteWindow(order, now);
  if (!window) return null;

  return `Lo ve solo ${favoriteName || "tu repartidor favorito"} hasta las ${window.until}`;
}

// Los repartidores activos que cubren la zona del pedido (los que se pueden asignar a mano), por nombre.
export function couriersForOrder(
  couriers: OrderCourier[],
  order: Pick<CourierOrder, "delivery_zone_id">,
): OrderCourier[] {
  if (!order.delivery_zone_id) return [];

  return couriers
    .filter((courier) => courier.zone_ids.includes(order.delivery_zone_id as string))
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

export type CourierResponseInput = { note: string; fee: string; reason: string };

export type CourierResponseResult =
  | { ok: true; note: string | null; fee: number | null; reason: string | null }
  | { ok: false; errors: Partial<Record<"note" | "fee" | "reason", string>> };

// Valida lo que el repartidor manda al tomar un pedido (ENVIO-64): nota opcional (hasta 120) y, si el
// precio final cambia, el motivo es obligatorio (hasta 200). El precio puede venir como "26000",
// "26.000" o "$ 26.000"; un precio igual al actual no cuenta como cambio.
export function validateCourierResponse(
  input: CourierResponseInput,
  currentFee: number,
): CourierResponseResult {
  const errors: Partial<Record<"note" | "fee" | "reason", string>> = {};

  const note = input.note.trim();
  if (note.length > 120) errors.note = "La nota admite hasta 120 caracteres.";

  let fee: number | null = null;
  const rawFee = input.fee.replace(/[$\s.]/g, "").replace(",", ".");

  if (rawFee !== "") {
    if (!/^\d+(\.\d{1,2})?$/.test(rawFee) || Number(rawFee) >= 100_000_000) {
      errors.fee = "Escribí un precio válido, por ejemplo 26000.";
    } else if (Number(rawFee) !== Number(currentFee)) {
      fee = Number(rawFee);
    }
  }

  const reason = input.reason.trim();
  if (fee !== null && reason === "") errors.reason = "Contá por qué cambia el precio del envío.";
  if (reason.length > 200) errors.reason = "El motivo admite hasta 200 caracteres.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, note: note || null, fee, reason: fee !== null ? reason : null };
}

// La nota opcional al asignar a mano un repartidor (ENVIO-81): hasta 120 caracteres.
export function validateAssignNote(
  value: string,
): { ok: true; note: string | null } | { ok: false; error: string } {
  const note = value.trim();

  if (note.length > 120) return { ok: false, error: "La nota admite hasta 120 caracteres." };

  return { ok: true, note: note || null };
}
