// Guarda el pedido del cliente en el sistema antes de mandarlo por WhatsApp
// (SEGUIMIENTO-1 y 7). El navegador solo dice qué y cuántos: los precios los pone el
// servidor (SEGUIMIENTO-2). Si algo falla, el llamador sigue con WhatsApp como siempre.

import { isSupabaseConfigured } from "./public-menu.js";
import { PAYMENT } from "./checkout-options.js";
import { LANGS } from "./i18n.js";
import { toOrderOptions } from "./options.js";
import { whatsappDigits } from "./phone.js";

// Del carrito a lo que pide la base: `id`, tipo y cantidad. Nunca precios. Devuelve
// null si algún ítem no se puede guardar (por ejemplo, un menú que viene de un JSON
// sin ids): en ese caso el pedido se manda solo por WhatsApp.
export function buildOrderItems(cart) {
  if (!Array.isArray(cart) || cart.length === 0) return null;

  const items = [];

  for (const item of cart) {
    if (!item || typeof item.id !== "string" || !item.id) return null;
    if (!Number.isInteger(item.cantidad) || item.cantidad < 1) return null;

    items.push({
      id: item.id,
      kind: item.esPromo ? "promo" : "product",
      quantity: item.cantidad,
      // Opciones elegidas: solo ids y cantidades, nunca precios (PUBLICO-48).
      ...(Array.isArray(item.elegidas) && item.elegidas.length > 0
        ? { options: toOrderOptions(item.elegidas) }
        : {}),
    });
  }

  return items;
}

const REASONS = {
  P0005: "closed", // cerrado temporalmente
  P0006: "outside_hours", // fuera del horario de atención
  P0003: "busy", // demasiados pedidos seguidos
  P0007: "invalid_delivery", // el negocio no ofrece ese tipo de entrega
  P0008: "invalid_payment", // el negocio no acepta ese medio de pago
  P0009: "out_of_stock", // un producto del pedido está sin stock
  P0011: "scheduling_disabled", // el negocio no acepta pedidos programados
  P0012: "invalid_schedule", // la hora elegida no es válida (ya pasó, falta anticipación o está cerrado)
  P0014: "invalid_options", // las opciones elegidas no son válidas (cambiaron, no corresponden o no cumplen las reglas)
  P0013: "preorder_closed", // ya no se toman pedidos anticipados (pasó el corte, no los acepta o está abierto)
  P0015: "invalid_zone", // el envío todavía no está aceptado (no debería llegar desde el menú)
  P0016: "invalid_zone", // barrio inexistente, dado de baja o sin envío con repartidor
  P0001: "unavailable", // un producto ya no está disponible
  P0002: "unavailable", // el negocio no existe o no está publicado
  22023: "invalid", // datos inválidos
};

const CODE = /^[0-9a-f]{20}$/;

export async function createOrder({
  url,
  key,
  slug,
  customer,
  delivery,
  payment,
  notes,
  items,
  scheduledFor,
  preorder,
  deliveryZone,
  customerPhone,
  deliveryAddress,
  fetchImpl = globalThis.fetch,
}) {
  if (!isSupabaseConfigured({ url, key }) || !slug || !Array.isArray(items) || items.length === 0) {
    return { ok: false, reason: "unknown" };
  }

  const headers = { apikey: key, "Content-Type": "application/json" };
  // Las claves nuevas (sb_publishable_…) van solo en `apikey`; las viejas, que son JWT,
  // también como Authorization.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(`${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/create_public_order`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_slug: slug,
        p_customer_name: customer,
        p_delivery: delivery,
        p_payment: payment,
        p_notes: notes,
        p_items: items,
        // Sin hora el pedido es "lo antes posible": la clave ni se manda.
        ...(scheduledFor ? { p_scheduled_for: scheduledFor } : {}),
        // Pedido anticipado (negocio cerrado): la base lo fecha con la próxima apertura.
        ...(preorder ? { p_preorder: true } : {}),
        // Envío con repartidor (ENVIO-21): solo el id del barrio; el precio lo pone la base.
        ...(deliveryZone ? { p_delivery_zone: deliveryZone } : {}),
        ...(customerPhone ? { p_customer_phone: customerPhone } : {}),
        ...(deliveryAddress ? { p_delivery_address: deliveryAddress } : {}),
      }),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      // Nunca se muestra el texto técnico de la base: solo el motivo.
      return { ok: false, reason: REASONS[body?.code] ?? "unknown" };
    }

    if (!body || typeof body.code !== "string" || !CODE.test(body.code)) {
      return { ok: false, reason: "unknown" };
    }

    return { ok: true, code: body.code, number: Number(body.number), total: Number(body.total) };
  } catch (err) {
    console.error("No se pudo guardar el pedido:", err);
    return { ok: false, reason: "unknown" };
  }
}

// Dónde sigue el cliente su pedido: el mismo sitio del menú + /pedido/<código>.
// Con `lang` (es|en|pt) el seguimiento se abre en el idioma del cliente (IDIOMA-12).
export function trackingLink(origin, code, lang) {
  const link = `${String(origin).replace(/\/+$/, "")}/pedido/${code}`;
  return LANGS.includes(lang) ? `${link}?lang=${lang}` : link;
}

export function whatsappOrderUrl(phone, message) {
  return `https://api.whatsapp.com/send?phone=${whatsappDigits(phone)}&text=${encodeURIComponent(message)}`;
}

// El mensaje de WhatsApp queda guardado en el navegador del cliente para poder mandarlo
// desde la página de seguimiento si todavía no lo envió (SEGUIMIENTO-10). Solo se guardan
// los últimos pedidos, y solo se devuelve un link de WhatsApp: nada más.
const HANDOFF_PREFIX = "sma-wa:";
const HANDOFF_KEEP = 5;
const WHATSAPP_URL = /^https:\/\/api\.whatsapp\.com\/send\?/;

function handoffKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(HANDOFF_PREFIX)) keys.push(key);
  }
  return keys;
}

export function rememberHandoff(storage, code, url, now = Date.now()) {
  try {
    if (!CODE.test(code) || !WHATSAPP_URL.test(url)) return;

    storage.setItem(HANDOFF_PREFIX + code, JSON.stringify({ url, sent: false, at: now }));

    const all = handoffKeys(storage)
      .map((key) => ({ key, at: Number(JSON.parse(storage.getItem(key) ?? "{}").at) || 0 }))
      .sort((a, b) => b.at - a.at);
    all.slice(HANDOFF_KEEP).forEach(({ key }) => storage.removeItem(key));
  } catch {
    // Sin almacenamiento (modo privado, cuota): el cliente sigue con el botón de la pantalla.
  }
}

// El link de WhatsApp de ese pedido si todavía no se envió; si no, null.
export function pendingHandoff(storage, code) {
  try {
    const saved = JSON.parse(storage.getItem(HANDOFF_PREFIX + code) ?? "null");
    if (!saved || saved.sent || !WHATSAPP_URL.test(saved.url)) return null;
    return { url: saved.url };
  } catch {
    return null;
  }
}

export function markHandoffSent(storage, code) {
  try {
    const saved = JSON.parse(storage.getItem(HANDOFF_PREFIX + code) ?? "null");
    if (saved) storage.setItem(HANDOFF_PREFIX + code, JSON.stringify({ ...saved, sent: true }));
  } catch {
    // ver arriba
  }
}

// Mensaje final para el negocio, una vez guardado el pedido: el número va en el título y
// se suma el link de seguimiento. Sin número ni link (pedido que no se guardó) queda igual.
export function finalizeOrderMessage(message, { number, link } = {}) {
  let out = message;
  if (Number.isInteger(number) && number > 0) {
    out = out.replace("*Nuevo pedido*", `*Nuevo pedido #${number}*`);
  }
  if (link) out += `\n\n🔎 Seguí tu pedido: ${link}`;
  return out;
}

// El último pedido queda anotado para volver a mostrar el panel "Pedido registrado" si el
// navegador recarga la página al volver de WhatsApp (SEGUIMIENTO-10). Solo se guarda el
// código, el número y el medio de pago (para volver a mostrar los datos de la transferencia),
// y vence a las 2 horas.
const LAST_ORDER_KEY = "sma-last-order";
const LAST_ORDER_TTL = 2 * 60 * 60 * 1000;

export function rememberLastOrder(storage, { code, number, payment }, now = Date.now()) {
  try {
    if (!CODE.test(code) || !Number.isInteger(number)) return;
    const known = PAYMENT.includes(payment) ? { payment } : {};
    storage.setItem(LAST_ORDER_KEY, JSON.stringify({ code, number, ...known, at: now }));
  } catch {
    // Sin almacenamiento: el panel se ve igual mientras la página siga abierta.
  }
}

export function lastOrder(storage, now = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(LAST_ORDER_KEY) ?? "null");
    if (!saved || !CODE.test(saved.code) || !Number.isInteger(saved.number)) return null;
    if (!(now - Number(saved.at) < LAST_ORDER_TTL)) return null;
    return {
      code: saved.code,
      number: saved.number,
      ...(PAYMENT.includes(saved.payment) ? { payment: saved.payment } : {}),
    };
  } catch {
    return null;
  }
}

export function forgetLastOrder(storage) {
  try {
    storage.removeItem(LAST_ORDER_KEY);
  } catch {
    // ver arriba
  }
}

// El link de WhatsApp guardado de ese pedido, se haya enviado o no (para reenviarlo).
export function handoffUrl(storage, code) {
  try {
    const saved = JSON.parse(storage.getItem(HANDOFF_PREFIX + code) ?? "null");
    return saved && WHATSAPP_URL.test(saved.url) ? saved.url : null;
  } catch {
    return null;
  }
}
