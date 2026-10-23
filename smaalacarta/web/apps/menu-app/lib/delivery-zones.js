// Envío con repartidor en el checkout (ENVIO-20 a 22 y 88). Los barrios y sus precios los
// entrega `public_delivery_zones(slug)`; el navegador nunca manda un precio: solo el id del barrio
// (la base pone el precio, ENVIO-6). Al pedir todavía no hay repartidor: lo toma uno después de que
// el local confirma. Si algo falla o no hay barrios, el checkout queda como siempre.

import { isSupabaseConfigured } from "./public-menu.js";
import { isValidPhone } from "./phone.js";

// El teléfono se valida igual para todos los pedidos: vive en `phone.js`.
export { isValidPhone };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El servidor ya no manda el repartidor ni su WhatsApp al pedir (ENVIO-75): si vinieran (un servidor
// sin actualizar), no se usan para nada, pero se leen sin romper. Igual que el `CHECK` de `couriers`:
// de 8 a 15 dígitos.
const WHATSAPP = /^[0-9]{8,15}$/;

function normalizeWhatsapp(value) {
  return typeof value === "string" && WHATSAPP.test(value) ? value : null;
}

// Valida la forma de la respuesta y la pasa a nombres propios. Un barrio mal formado se descarta;
// sin ningún barrio válido no hay envío (null). El repartidor y su WhatsApp son opcionales.
export function normalizeZones(data) {
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.zonas)) return null;

  const zones = [];
  for (const zona of data.zonas) {
    if (!zona || typeof zona !== "object") continue;
    if (typeof zona.id !== "string" || !UUID.test(zona.id)) continue;
    if (typeof zona.nombre !== "string" || !zona.nombre.trim()) continue;

    const price = typeof zona.precio === "number" ? zona.precio : Number(zona.precio);
    if (zona.precio === null || zona.precio === "" || !Number.isFinite(price) || price < 0) continue;

    // `fijo`: el precio no cambia (ENVIO-223). Si el servidor no lo manda, no se afirma nada: se muestra "aprox.".
    zones.push({
      id: zona.id,
      name: zona.nombre,
      price,
      ...(typeof zona.fijo === "boolean" ? { fixed: zona.fijo } : {}),
    });
  }

  if (zones.length === 0) return null;

  const courier = typeof data.repartidor === "string" && data.repartidor.trim() ? data.repartidor : null;

  return { courier, whatsapp: normalizeWhatsapp(data.whatsapp), zones };
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

// ¿El checkout pide barrio y dirección? Solo con entrega "delivery" y barrios disponibles. El teléfono
// se pide siempre.
export function needsCourier(zones, delivery) {
  return Boolean(zones && zones.zones.length > 0 && delivery === "delivery");
}

export function findZone(zones, id) {
  return zones?.zones.find((zone) => zone.id === id) ?? null;
}

// ¿El precio de esta zona es fijo? Solo si el servidor lo dice (ENVIO-223 y 228): si no, se muestra "aprox.".
export function isFixedPrice(zone) {
  return zone?.fixed === true;
}

// El texto del aviso del checkout: "Envío $X a {barrio}" con precio fijo; "Envío aprox. $X…" si puede cambiar.
export function zoneNoticeKey(zone) {
  return isFixedPrice(zone) ? "checkout.zoneNoticeFixed" : "checkout.zoneNotice";
}

// Variables del aviso "Envío ${precio} a {barrio}…" (el texto vive en i18n.js).
export function zoneNoticeVars(zone, formatPrice) {
  return { barrio: zone.name, precio: formatPrice(zone.price) };
}

// ¿Se puede confirmar con esta entrega y esta zona? (PUBLICO-82). `null` si sí; si no, el motivo: `no_delivery`
// ("Mi barrio no está": el envío está bloqueado) o `invalid_zone` (sin zona, o una que ya no está en la lista).
// Sin barrios cargados no se exige zona. El servidor la valida igual (`create_public_order`).
export function deliveryProblem({ zones, delivery, zoneId, blocked = false }) {
  // Bloqueado y sin retiro elegido (p. ej. un local solo con envío, donde el select está oculto y vacío): no hay
  // forma de confirmar.
  if (blocked && delivery !== "retiro") return "no_delivery";
  if (delivery !== "delivery") return null;
  if (!needsCourier(zones, delivery)) return null;
  return findZone(zones, zoneId) ? null : "invalid_zone";
}

// Lo que se suma a `createOrder` por el envío; vacío si el pedido no lleva envío con repartidor. El
// teléfono no está acá: va en todos los pedidos (ENVIO-87).
export function courierOrderFields({ zones, delivery, zoneId, address }) {
  if (!needsCourier(zones, delivery) || !findZone(zones, zoneId)) return {};

  return {
    deliveryZone: zoneId,
    deliveryAddress: String(address ?? "").trim(),
  };
}

// Las líneas del mensaje de WhatsApp al local. Siempre en español (IDIOMA-5). El precio es de
// referencia y se le paga al repartidor: no entra en el total del pedido. No nombra al repartidor
// (todavía no hay uno) y el teléfono del cliente va aparte, en todos los pedidos (ENVIO-88).
export function courierWhatsappLines(zone, { address }, formatPrice) {
  return [
    `📍 Barrio: ${zone.name}`,
    `🛵 Envío${zone.fixed === false ? " aprox." : ""}: $${formatPrice(zone.price)}, se paga al repartidor`,
    `🏠 Dirección: ${address}`,
    "",
  ].join("\n");
}
