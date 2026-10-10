// Envío con Repartos al Toque en el checkout (ENVIO-20 a 22). Los barrios y sus precios los
// entrega `public_delivery_zones(slug)`; el navegador nunca manda un precio: solo el id del barrio
// (la base pone el precio, ENVIO-6). Si algo falla o no hay barrios, el checkout queda como siempre.

import { isSupabaseConfigured } from "./public-menu.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valida la forma de la respuesta y la pasa a nombres propios. Un barrio mal formado se descarta;
// sin repartidor o sin ningún barrio válido no hay envío (null).
export function normalizeZones(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.repartidor !== "string" || !data.repartidor.trim()) return null;
  if (!Array.isArray(data.zonas)) return null;

  const zones = [];
  for (const zona of data.zonas) {
    if (!zona || typeof zona !== "object") continue;
    if (typeof zona.id !== "string" || !UUID.test(zona.id)) continue;
    if (typeof zona.nombre !== "string" || !zona.nombre.trim()) continue;

    const price = typeof zona.precio === "number" ? zona.precio : Number(zona.precio);
    if (zona.precio === null || zona.precio === "" || !Number.isFinite(price) || price < 0) continue;

    zones.push({ id: zona.id, name: zona.nombre, price });
  }

  return zones.length > 0 ? { courier: data.repartidor, zones } : null;
}

export async function fetchDeliveryZones({ url, key, slug, fetchImpl = globalThis.fetch }) {
  if (!isSupabaseConfigured({ url, key }) || !slug) return null;

  const headers = { apikey: key, "Content-Type": "application/json" };
  // Las claves nuevas (sb_publishable_…) van solo en `apikey`; las viejas, que son JWT,
  // también como Authorization.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(`${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_delivery_zones`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_slug: slug }),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!res.ok) return null;
    return normalizeZones(await res.json());
  } catch (err) {
    console.error("No se pudieron pedir los barrios de envío:", err);
    return null;
  }
}

// ¿El checkout pide barrio, dirección y teléfono? Solo con entrega "delivery" y barrios disponibles.
export function needsCourier(zones, delivery) {
  return Boolean(zones && zones.zones.length > 0 && delivery === "delivery");
}

export function findZone(zones, id) {
  return zones?.zones.find((zone) => zone.id === id) ?? null;
}

// Variables del aviso "Envío a {barrio}: ${precio}…" (el texto vive en i18n.js).
export function zoneNoticeVars(zone, formatPrice) {
  return { barrio: zone.name, precio: formatPrice(zone.price) };
}

// El servidor exige de 8 a 15 dígitos (ENVIO-5).
export function isValidPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

// Lo que se suma a `createOrder`; vacío si el pedido no lleva envío con repartidor.
export function courierOrderFields({ zones, delivery, zoneId, phone, address }) {
  if (!needsCourier(zones, delivery) || !findZone(zones, zoneId)) return {};

  return {
    deliveryZone: zoneId,
    customerPhone: String(phone ?? "").trim(),
    deliveryAddress: String(address ?? "").trim(),
  };
}

// Las líneas del mensaje de WhatsApp al local. Siempre en español (IDIOMA-5). El precio es de
// referencia y se le paga al repartidor: no entra en el total del pedido.
export function courierWhatsappLines(zone, { address, phone }, formatPrice) {
  return [
    `📍 Barrio: ${zone.name}`,
    `🛵 Envío: $${formatPrice(zone.price)} (se paga al repartidor)`,
    `🏠 Dirección: ${address}`,
    `📞 Teléfono: ${phone}`,
    "",
  ].join("\n");
}
