import { MpApiError, type MpApi, type MpPayment } from "./api";
import { createRateLimiter } from "./rate-limit";
import { verifyWebhookSignature } from "./signature";

// Reglas de los tres endpoints de Mercado Pago (MP-3 a MP-5), con las dependencias inyectadas: los
// route handlers de `app/api/mp/` solo las conectan a la base y a la API real. Ningún monto sale del
// navegador: el precio se arma acá con lo guardado en `order_items`.
export type PaymentStatus = "not_required" | "awaiting" | "paid" | "failed";

export type OrderRecord = {
  id: string;
  businessId: string;
  slug: string;
  code: string;
  total: number;
  status: string;
  payment: string | null;
  paymentStatus: PaymentStatus;
  items: { name: string; quantity: number; unitPrice: number }[];
};

export type Credentials = { accessToken: string; webhookSecret: string; enabled: boolean };

export type MpDeps = {
  findOrderByCode(code: string): Promise<OrderRecord | null>;
  findOrderById(id: string): Promise<OrderRecord | null>;
  getCredentials(businessId: string): Promise<Credentials | null>;
  // `confirm_order_payment`: devuelve el estado de pago resultante o "mismatch".
  confirmPayment(orderId: string, paymentId: string, status: "paid" | "failed", amount: number): Promise<string>;
  mp: MpApi;
  now(): number;
  // https://www.smaalacarta.com.ar (donde vive /admin); el webhook vuelve acá.
  siteOrigin: string;
  // Dominio de los menús: `<slug>.<menuDomain>`.
  menuDomain: string;
};

export type Reply = { status: number; body: Record<string, unknown> };

const CODE = /^[0-9a-f]{20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });

// `approved` paga; `rejected` y `cancelled` fallan; el resto (pendiente, en proceso, reembolsado…)
// no cambia nada todavía.
export function paymentOutcome(mpStatus: string | null | undefined): "paid" | "failed" | null {
  if (mpStatus === "approved") return "paid";
  if (mpStatus === "rejected" || mpStatus === "cancelled") return "failed";
  return null;
}

const usable = (credentials: Credentials | null): credentials is Credentials =>
  !!credentials && credentials.enabled && !!credentials.accessToken;

export function trackingUrl(deps: Pick<MpDeps, "menuDomain">, order: Pick<OrderRecord, "slug" | "code">) {
  return `https://${order.slug}.${deps.menuDomain}/pedido/${order.code}`;
}

const failureStatus = (error: unknown) => (error instanceof MpApiError ? error.status : "error");

// POST /create (MP-3)
export async function createPayment(deps: MpDeps, input: { code?: unknown }): Promise<Reply> {
  if (typeof input.code !== "string" || !CODE.test(input.code)) {
    return reply(400, { error: "invalid_code" });
  }

  const order = await deps.findOrderByCode(input.code);
  if (!order) return reply(404, { error: "not_found" });

  if (order.payment !== "mercadopago") return reply(409, { error: "not_mercadopago" });
  if (order.paymentStatus !== "awaiting" && order.paymentStatus !== "failed") {
    return reply(409, { error: "not_payable" });
  }
  if (order.status === "cancelled") return reply(409, { error: "cancelled" });
  if (order.items.length === 0) return reply(409, { error: "no_items" });

  const credentials = await deps.getCredentials(order.businessId);
  if (!usable(credentials)) return reply(409, { error: "not_configured" });

  const back = trackingUrl(deps, order);

  try {
    const preference = await deps.mp.createPreference(credentials.accessToken, {
      items: order.items.map((item) => ({
        title: item.name,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
        currency_id: "ARS",
      })),
      external_reference: order.id,
      back_urls: { success: back, failure: back, pending: back },
      auto_return: "approved",
      notification_url: `${deps.siteOrigin}/admin/api/mp/webhook?b=${order.businessId}`,
    });

    return reply(200, { init_point: preference.init_point });
  } catch (error) {
    // Solo el código HTTP: nunca el token ni el cuerpo de la respuesta (MP-7).
    console.error("mp/create: Mercado Pago no creó la preferencia", failureStatus(error));
    return reply(502, { error: "mp_unavailable" });
  }
}

// POST /webhook?b=<business_id> (MP-4)
export async function handleWebhook(
  deps: MpDeps,
  input: {
    businessId: string | null;
    dataId: string | null;
    type: string | null;
    signature: string | null;
    requestId: string | null;
  },
): Promise<Reply> {
  const unauthorized = reply(401, { error: "invalid_signature" });

  if (!input.businessId || !UUID.test(input.businessId)) return unauthorized;

  const credentials = await deps.getCredentials(input.businessId);
  if (!credentials || !credentials.webhookSecret) return unauthorized;

  // La firma se valida antes de hacer cualquier otra cosa.
  if (
    !verifyWebhookSignature(credentials.webhookSecret, {
      signatureHeader: input.signature,
      requestId: input.requestId,
      dataId: input.dataId,
    })
  ) {
    return unauthorized;
  }

  // Solo interesan los pagos; cualquier otro aviso se acepta y se ignora.
  if ((input.type && input.type !== "payment") || !input.dataId) return reply(200, { ignored: true });
  if (!credentials.enabled || !credentials.accessToken) return reply(200, { ignored: true });

  let payment: MpPayment;
  try {
    payment = await deps.mp.getPayment(credentials.accessToken, input.dataId);
  } catch (error) {
    // Un pago inexistente (p. ej. la notificación simulada del panel) no se arregla reintentando.
    if (error instanceof MpApiError && error.status === 404) return reply(200, { ignored: true });
    console.error("mp/webhook: no se pudo consultar el pago", failureStatus(error));
    // 5xx: Mercado Pago reintenta.
    return reply(502, { error: "mp_unavailable" });
  }

  const outcome = paymentOutcome(payment.status);
  const reference = payment.external_reference;
  if (!outcome || !reference || !UUID.test(reference)) return reply(200, { ignored: true });
  if (payment.currency_id && payment.currency_id !== "ARS") return reply(200, { ignored: true });

  const order = await deps.findOrderById(reference);
  // El pedido tiene que ser de ESTE negocio y con Mercado Pago: un pago de otro lado no lo toca.
  if (!order || order.businessId !== input.businessId || order.payment !== "mercadopago") {
    return reply(200, { ignored: true });
  }

  try {
    const result = await deps.confirmPayment(order.id, String(payment.id), outcome, Number(payment.transaction_amount));
    return reply(200, { result });
  } catch {
    return reply(500, { error: "confirm_failed" });
  }
}

const verifyLimiter = createRateLimiter(4000);

// GET /verify?code= (MP-5): re-consulta en Mercado Pago, para no depender solo del webhook.
// Devuelve solo el estado de pago.
export async function verifyPayment(
  deps: MpDeps,
  input: { code?: unknown },
  limiter = verifyLimiter,
): Promise<Reply> {
  if (typeof input.code !== "string" || !CODE.test(input.code)) {
    return reply(400, { error: "invalid_code" });
  }

  const order = await deps.findOrderByCode(input.code);
  if (!order) return reply(404, { error: "not_found" });
  if (order.payment !== "mercadopago") return reply(409, { error: "not_mercadopago" });

  // Ya pagado: se responde sin llamar a Mercado Pago.
  if (order.paymentStatus === "paid") return reply(200, { pago: "paid" });

  // Por pedido: varios clientes distintos no se pisan, uno que recarga sin parar sí se frena.
  if (!limiter.allow(order.code, deps.now())) return reply(200, { pago: order.paymentStatus });

  const credentials = await deps.getCredentials(order.businessId);
  if (!usable(credentials)) return reply(200, { pago: order.paymentStatus });

  let payments: MpPayment[];
  try {
    payments = await deps.mp.searchPayments(credentials.accessToken, order.id);
  } catch (error) {
    console.error("mp/verify: no se pudo consultar los pagos", failureStatus(error));
    return reply(200, { pago: order.paymentStatus });
  }

  // Más reciente primero. Uno aprobado gana; si no, el último rechazado marca el pago como fallido.
  const own = payments.filter((p) => p.external_reference === order.id);
  const approved = own.find((p) => p.status === "approved");
  const latestFailed = own[0] && paymentOutcome(own[0].status) === "failed" ? own[0] : null;
  const decisive = approved ?? latestFailed;

  if (!decisive || (!approved && order.paymentStatus === "failed")) {
    return reply(200, { pago: order.paymentStatus });
  }

  try {
    const result = await deps.confirmPayment(
      order.id,
      String(decisive.id),
      approved ? "paid" : "failed",
      Number(decisive.transaction_amount),
    );
    return reply(200, { pago: result === "paid" || result === "failed" ? result : order.paymentStatus });
  } catch {
    return reply(200, { pago: order.paymentStatus });
  }
}
