// Guarda el pedido del cliente en el sistema antes de mandarlo por WhatsApp
// (SEGUIMIENTO-1 y 7). El navegador solo dice qué y cuántos: los precios los pone el
// servidor (SEGUIMIENTO-2). Si algo falla, el llamador sigue con WhatsApp como siempre.

import { isSupabaseConfigured } from "./public-menu.js";

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
    });
  }

  return items;
}

const REASONS = {
  P0005: "closed", // cerrado temporalmente
  P0006: "outside_hours", // fuera del horario de atención
  P0003: "busy", // demasiados pedidos seguidos
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
export function trackingLink(origin, code) {
  return `${String(origin).replace(/\/+$/, "")}/pedido/${code}`;
}

export function whatsappOrderUrl(phone, message) {
  return `https://api.whatsapp.com/send?phone=${String(phone ?? "").replace(/\D/g, "")}&text=${encodeURIComponent(message)}`;
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
