import { formatMoney } from "@/lib/promotions/pricing";
import { PAYMENT_OPTIONS } from "@/lib/settings/payment";
import { isFinal, type DeliveryContext } from "./status";

// Envío con Repartos al Toque en el panel del local (ENVIO-23 a 26). Reglas puras: el panel las
// lee, la base las exige igual (`set_order_courier`, `set_order_status`, P0015).

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
  delivery_zone_name: string | null;
  delivery_fee_list: number | null;
  delivery_fee: number | null;
  delivery_fee_reason: string | null;
  delivery_fee_changed_at: string | null;
  courier_status: string | null;
  courier_note: string | null;
  courier_requested_at: string | null;
  courier_responded_at: string | null;
};

// Pasados estos minutos sin respuesta, el panel avisa (ENVIO-25).
export const RESPONSE_WARNING_MINUTES = 10;

export function hasCourier(order: Pick<CourierOrder, "courier_id">) {
  return Boolean(order.courier_id);
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
  // Texto del botón de pedir el envío, o null si no corresponde.
  request: "Pedir envío" | "Volver a pedir" | null;
  accept: boolean;
  reject: boolean;
};

// Qué puede hacer el local con el envío según el estado del envío y del pedido (ENVIO-24):
// pedirlo, registrar que el repartidor aceptó o que no puede. Aceptado o pedido terminado: nada.
export function courierActions(
  order: Pick<CourierOrder, "courier_id" | "courier_status" | "status">,
): CourierActions {
  const none: CourierActions = { request: null, accept: false, reject: false };

  if (!hasCourier(order) || isFinal(order.status)) return none;

  switch (order.courier_status) {
    case "waiting":
      return { request: "Pedir envío", accept: true, reject: true };
    case "requested":
      return { request: "Volver a pedir", accept: true, reject: true };
    case "rejected":
      return { request: "Pedir envío", accept: true, reject: false };
    default:
      return none;
  }
}

// Por qué no se puede confirmar todavía (ENVIO-8), o null si se puede.
export function confirmBlockReason(
  order: Pick<CourierOrder, "courier_id" | "courier_status" | "status">,
): string | null {
  if (!hasCourier(order) || order.status !== "pending" || order.courier_status === "accepted") {
    return null;
  }

  if (order.courier_status === "rejected") {
    return "El repartidor no puede llevarlo: pedile a otro o cancelá el pedido.";
  }

  return "Para confirmar, el envío tiene que estar aceptado por el repartidor.";
}

// Aviso si el repartidor no contestó en `RESPONSE_WARNING_MINUTES` (ENVIO-25), o null.
export function noResponseWarning(
  order: Pick<CourierOrder, "courier_status" | "courier_requested_at" | "status">,
  now: Date,
): string | null {
  if (order.courier_status !== "requested" || !order.courier_requested_at || isFinal(order.status)) {
    return null;
  }

  const since = new Date(order.courier_requested_at).getTime();
  if (Number.isNaN(since)) return null;

  const minutes = Math.floor((now.getTime() - since) / 60_000);
  if (minutes < RESPONSE_WARNING_MINUTES) return null;

  return `Pasaron ${minutes} min sin respuesta del repartidor: volvé a consultarle o pedí otro.`;
}

export function courierStatusLabel(order: Pick<CourierOrder, "courier_status">) {
  switch (order.courier_status) {
    case "requested":
      return "Consultado al repartidor";
    case "accepted":
      return "Aceptado por el repartidor";
    case "rejected":
      return "El repartidor no puede";
    default:
      return "Sin pedir al repartidor";
  }
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

const TIME_ZONE = "America/Argentina/Buenos_Aires";

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

// La hora en que el pedido va a estar listo, para sugerirla al pedir el envío: la del pedido
// programado o, si no, 20 minutos desde ahora redondeados hacia arriba a 5 (hora de Argentina).
export function readyTimeDefault(order: Pick<CourierOrder, "scheduled_for">, now: Date) {
  if (order.scheduled_for) {
    const scheduled = new Date(order.scheduled_for);
    if (!Number.isNaN(scheduled.getTime())) return timeFormatter.format(scheduled);
  }

  const FIVE = 5 * 60_000;
  const target = now.getTime() + 20 * 60_000;
  return timeFormatter.format(new Date(Math.ceil(target / FIVE) * FIVE));
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

// Mensaje de WhatsApp a Repartos al Toque con todo lo que necesita para salir (ENVIO-23).
// Siempre en español.
export function courierRequestMessage({
  businessName,
  order,
  readyAt,
  trackingLink,
}: {
  businessName: string;
  order: CourierOrder;
  readyAt: string;
  trackingLink: string;
}) {
  const lines = [
    `🛵 *Pedido para enviar* · ${businessName}`,
    `Pedido #${order.order_number}`,
    "",
    `📍 Barrio: ${order.delivery_zone_name ?? "-"}`,
    `🏠 Dirección: ${order.delivery_address ?? "-"}`,
    `👤 Cliente: ${order.customer_name || "Sin nombre"}`,
    `📞 Teléfono: ${order.customer_phone ?? "-"}`,
    "",
    `⏰ Listo a las ${readyAt}`,
    `💰 Total del pedido: ${formatMoney(Number(order.total))}`,
    `💳 Pago: ${order.payment || "-"}`,
    `🛵 Envío: ${formatMoney(Number(order.delivery_fee ?? 0))}`,
    `💵 ${collectionInfo({ payment: order.payment, total: order.total, fee: order.delivery_fee }).text}`,
    "",
    `🔎 Seguimiento: ${trackingLink}`,
  ];

  return lines.join("\n");
}

// Número listo para WhatsApp: solo dígitos y, si es argentino de 10 dígitos (con o sin 0 delante),
// con 549 adelante. Igual que en el menú público. Vacío si no hay dígitos.
export function whatsappDigits(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  const local = digits.replace(/^0/, "");
  return local.length === 10 ? `549${local}` : digits;
}

export function courierWhatsappLink(whatsapp: string | null | undefined, message: string) {
  const phone = whatsappDigits(whatsapp);
  if (!phone) return null;

  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

export type CourierResponseInput = { note: string; fee: string; reason: string };

export type CourierResponseResult =
  | { ok: true; note: string | null; fee: number | null; reason: string | null }
  | { ok: false; errors: Partial<Record<"note" | "fee" | "reason", string>> };

// Valida lo que el local registra cuando el repartidor contestó (ENVIO-24): nota opcional (hasta 120)
// y, si el precio final cambia, el motivo es obligatorio (hasta 200). El precio puede venir como
// "26000", "26.000" o "$ 26.000"; un precio igual al actual no cuenta como cambio.
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
