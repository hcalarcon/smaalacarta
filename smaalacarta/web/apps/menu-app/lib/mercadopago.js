// Cobro con Mercado Pago desde el menú y el seguimiento (PUBLICO-36 a 38). Los endpoints viven en
// `admin/` (la clave de servicio nunca va en `web/`): este módulo solo pide el link de pago y
// consulta el estado. El navegador manda únicamente el código del pedido: los montos los arma el
// servidor (MP-3). Lógica pura; `app.js` y `tracker.js` solo dibujan y redirigen.

// Los menús están en otro origen (`<slug>.smaalacarta.com.ar`): los endpoints aceptan CORS desde ahí.
export const MP_API = "https://www.smaalacarta.com.ar/admin/api/mp";
export const MERCADOPAGO = "mercadopago";

const CODE = /^[0-9a-f]{20}$/;
const KNOWN = ["awaiting", "paid", "failed"];
const MP_HOST = /(^|\.)mercadopago\.com(\.[a-z]{2})?$/;

export const isMercadoPago = (payment) => payment === MERCADOPAGO;

// Solo se redirige a una dirección https de Mercado Pago: aunque la respuesta viniera alterada,
// el cliente no termina en otro sitio.
export function safePaymentUrl(value) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && MP_HOST.test(url.hostname) ? value : null;
  } catch {
    return null;
  }
}

const timeout = () => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined);

// El link de pago de un pedido ya guardado. { ok: true, url } o { ok: false }.
export async function createPayment({ code, base = MP_API, fetchImpl = globalThis.fetch }) {
  if (!CODE.test(String(code ?? ""))) return { ok: false };

  try {
    const res = await fetchImpl(`${base}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: timeout(),
    });
    if (!res.ok) return { ok: false };

    const url = safePaymentUrl((await res.json())?.init_point);
    return url ? { ok: true, url } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// El estado de pago según Mercado Pago (el servidor re-consulta y confirma). { ok, pago } o { ok: false }.
export async function verifyPayment({ code, base = MP_API, fetchImpl = globalThis.fetch }) {
  if (!CODE.test(String(code ?? ""))) return { ok: false };

  try {
    const res = await fetchImpl(`${base}/verify?code=${code}`, { signal: timeout() });
    if (!res.ok) return { ok: false };

    const pago = (await res.json())?.pago;
    return KNOWN.includes(pago) ? { ok: true, pago } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// Qué mostrar del pago en el seguimiento: null si el pedido no es con Mercado Pago (la base
// solo entrega `pago` en esos). `preorder`: pedido anticipado, sin línea de tiempo (PUBLICO-38).
export function paymentView(pedido) {
  const state = pedido?.pago;
  if (!KNOWN.includes(state)) return null;

  return { state, preorder: pedido.anticipado === true };
}

// Mientras el pago se espera (y el pedido sigue en pie) el seguimiento consulta cada pocos segundos.
export function shouldVerify(pedido) {
  return pedido?.pago === "awaiting" && pedido?.estado !== "cancelled";
}

// Qué partes del seguimiento se muestran (PUBLICO-37 y 38). Un pedido cancelado ya no se cobra y
// vuelve a verse como cualquier otro. Un pedido anticipado con Mercado Pago muestra solo el pago y
// el día: sin pasos de estado ni línea de tiempo.
export function trackerLayout(pedido) {
  const pay = pedido?.estado === "cancelled" ? null : paymentView(pedido);
  const preorderOnly = pay?.preorder === true;

  return { pay, status: !preorderOnly, timeline: !preorderOnly };
}
