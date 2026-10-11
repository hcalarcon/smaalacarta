// Página de seguimiento de un pedido (SEGUIMIENTO-8): qué muestra y cómo lo pide.
// Solo lógica: el dibujo está en tracker.js y usa siempre textContent.

import { cssUrl } from "../../menu-app/lib/html.js";
import { headerBackground, positionText } from "../../menu-app/lib/info.js";
import { LANGS, LOCALES, t } from "../../menu-app/lib/i18n.js";

const CODE = /^[0-9a-f]{20}$/;

// El código sale de /pedido/<código> (producción) o de ?code= (desarrollo local).
// Devuelve el código en minúsculas o null si no es uno válido.
export function parseTrackingCode(pathname, search = "") {
  const fromPath = /^\/pedido\/([^/]+)\/?$/.exec(String(pathname ?? ""));
  const candidate = (fromPath ? fromPath[1] : new URLSearchParams(search).get("code") ?? "").toLowerCase();

  return CODE.test(candidate) ? candidate : null;
}

const STEPS = ["pending", "confirmed", "preparing", "ready", "delivered"];

// El camino de un pedido con envío con Repartos al Toque (ENVIO-9): el local lo entrega al
// repartidor y de ahí lo lleva él.
const COURIER_STEPS = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "handed_to_courier",
  "on_the_way",
  "delivered",
];

// Estados que solo existen en un pedido con envío: si llegan, el camino es el del envío.
const COURIER_ONLY = ["handed_to_courier", "on_the_way"];

const KNOWN_STATUS = [...COURIER_STEPS, "cancelled"];

// Los pasos del camino (cinco; siete con envío), en el idioma pedido.
export function stepLabels(lang, { courier = false } = {}) {
  return (courier ? COURIER_STEPS : STEPS).map((step) => t(`step.${step}`, lang));
}

export function isFinalStatus(status) {
  return status === "delivered" || status === "cancelled";
}

// Qué mostrar para cada estado: título, texto, y en qué paso del camino está (-1 si
// se desconoce o está cancelado).
export function statusView(status, lang, { courier = false } = {}) {
  if (!KNOWN_STATUS.includes(status)) {
    return { title: t("status.unknown.title", lang), text: "", step: -1, cancelled: false, final: false };
  }

  const withCourier = courier || COURIER_ONLY.includes(status);
  const steps = withCourier ? COURIER_STEPS : STEPS;

  return {
    title: t(`status.${status}.title`, lang),
    // Con envío, "Listo" no dice que pase a buscarlo: lo retira el repartidor.
    text: t(status === "ready" && withCourier ? "status.ready.courierText" : `status.${status}.text`, lang),
    step: steps.indexOf(status),
    cancelled: status === "cancelled",
    final: isFinalStatus(status),
  };
}

// La línea de tiempo lista para mostrar, en el orden en que llega.
export function timeline(events, lang) {
  if (!Array.isArray(events)) return [];

  return events.flatMap((event) =>
    event && typeof event.estado === "string"
      ? [
          {
            label: KNOWN_STATUS.includes(event.estado) ? t(`event.${event.estado}`, lang) : event.estado,
            date: event.fecha ?? null,
            note: typeof event.nota === "string" ? event.nota : null,
          },
        ]
      : [],
  );
}

export async function fetchTracking({ url, key, code, fetchImpl = globalThis.fetch }) {
  if (!url || !url.trim() || !key || !key.trim() || !CODE.test(String(code ?? ""))) {
    return { ok: false, reason: "error" };
  }

  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(`${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_order_tracking`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_code: code }),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!res.ok) return { ok: false, reason: "error" };

    const data = await res.json();

    // La base responde null si el código no existe.
    if (data === null) return { ok: false, reason: "notfound" };

    if (typeof data !== "object" || !data.pedido || !data.negocio) {
      return { ok: false, reason: "error" };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, reason: "error" };
  }
}

const DEFAULT_BRAND = "#5a4a3a";
const DEFAULT_ACCENT = "#d97706";

export function safeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

// La estética del negocio para la página de seguimiento (SEGUIMIENTO-11): los dos colores,
// el fondo de la cabecera (imagen sobre degradé, o nada) y si la cabecera es "plana"
// (blanca, como la plantilla minimal sin imagen). Todo se valida: la base ya lo exige,
// pero esta página no confía en lo que recibe.
export function brandTheme(negocio) {
  const colores = negocio?.colores ?? {};
  const brand = safeColor(colores.primary, DEFAULT_BRAND);
  const accent = safeColor(colores.secondary, DEFAULT_ACCENT);

  const header = headerBackground(
    {
      template: negocio?.plantilla,
      colores: { primary: brand, secondary: accent },
      header: { imagen: negocio?.imagen },
    },
    cssUrl,
  );

  // La posición solo cuenta si hay imagen (PUBLICO-50 / SEGUIMIENTO-24).
  const position = negocio?.imagen ? positionText(negocio?.posicion) : "";

  return { brand, accent, header, position, plain: header === "" };
}

// Título de la pestaña en el idioma elegido (IDIOMA-13).
export function pageTitle(numero, negocio, lang) {
  return t("tracker.title", lang, { n: numero, negocio });
}

// La dirección con `?lang=` puesto (IDIOMA-14), sin perder el resto de los parámetros. Un
// idioma que no es es|en|pt deja todo como estaba.
export function langSearch(search, lang) {
  const params = new URLSearchParams(search);
  if (LANGS.includes(lang)) params.set("lang", lang);
  const text = params.toString();
  return text ? `?${text}` : "";
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

// "Programado para las 20:30" si el pedido es para una hora (SEGUIMIENTO-18); si no, null.
// La hora es la de Argentina, la del local.
export function scheduledNotice(programado, lang) {
  if (typeof programado !== "string") return null;

  const date = new Date(programado);
  if (Number.isNaN(date.getTime())) return null;

  return t("tracker.scheduled", lang, { time: timeFormatter.format(date) });
}

// "Tu pedido es para el sábado, 10 de octubre" (PUBLICO-38): el día del pedido anticipado, en la
// hora de Argentina y en el idioma del cliente. Sin fecha válida, null.
export function preorderNotice(programado, lang) {
  if (typeof programado !== "string") return null;

  const date = new Date(programado);
  if (Number.isNaN(date.getTime())) return null;

  const day = new Intl.DateTimeFormat(LOCALES[lang] ?? LOCALES.es, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);

  return t("tracker.preorderFor", lang, { day });
}

// Una línea del detalle del pedido (SEGUIMIENTO-23): "2 × Helado", el total de la línea y, debajo,
// las opciones que se eligieron (`+ Frutilla ×2`). Todo con textContent: ni el nombre del producto
// ni el de las opciones se interpretan nunca como HTML.
export function itemRow(doc, item, money) {
  const li = doc.createElement("li");

  const name = doc.createElement("span");
  name.textContent = `${item.cantidad} × ${item.nombre}`;

  const price = doc.createElement("span");
  price.textContent = money.format(Number(item.precio) * Number(item.cantidad));

  li.append(name, price);

  const options = Array.isArray(item.opciones)
    ? item.opciones.filter((o) => o && typeof o === "object" && typeof o.nombre === "string" && o.nombre !== "")
    : [];

  if (options.length > 0) {
    const list = doc.createElement("ul");
    list.className = "item-opciones";

    for (const option of options) {
      const row = doc.createElement("li");
      row.textContent = `+ ${option.nombre}${Number(option.cantidad) > 1 ? ` ×${option.cantidad}` : ""}`;
      list.appendChild(row);
    }

    li.appendChild(list);
  }

  return li;
}

// Los estados del envío que muestra la página (ENVIO-91): esperando la confirmación, buscando
// repartidor, tomado por uno y que lo lleva el local. Los viejos (`requested`, `rejected`) o los que
// no se conocen no rompen nada: no muestran el bloque (ENVIO-92).
const DELIVERY_STATES = ["waiting", "searching", "accepted", "self"];

// El WhatsApp del repartidor es público (ENVIO-44): igual que el `CHECK` de `couriers`, de 8 a 15
// dígitos; si no, no se usa (y nunca llega a un link).
const COURIER_WHATSAPP = /^[0-9]{8,15}$/;

// Valida la respuesta de `public_order_delivery`; null si no es un envío reconocible. Nunca trae
// teléfono ni dirección del cliente (ENVIO-17): esta página tampoco los muestra.
function normalizeDelivery(data) {
  if (!data || typeof data !== "object") return null;
  if (!DELIVERY_STATES.includes(data.estado)) return null;

  // El precio solo se usa con el envío tomado: sin él (o roto) el bloque no lo muestra.
  const price = data.precio === null || data.precio === undefined ? NaN : Number(data.precio);
  const list = data.precio_lista === null || data.precio_lista === undefined ? NaN : Number(data.precio_lista);

  return {
    courier: typeof data.repartidor === "string" ? data.repartidor : "",
    whatsapp:
      typeof data.whatsapp === "string" && COURIER_WHATSAPP.test(data.whatsapp) ? data.whatsapp : null,
    zone: typeof data.zona === "string" ? data.zona : "",
    listPrice: Number.isFinite(list) ? list : null,
    price: Number.isFinite(price) ? price : null,
    reason: typeof data.motivo_cambio === "string" && data.motivo_cambio ? data.motivo_cambio : null,
    state: data.estado,
    note: typeof data.nota === "string" && data.nota ? data.nota : null,
  };
}

// El envío del pedido (ENVIO-17 y 29). `{ ok: true, data: null }` es un pedido sin envío; un error
// de red no es lo mismo y no borra lo que ya se estaba mostrando.
export async function fetchDelivery({ url, key, code, fetchImpl = globalThis.fetch }) {
  if (!url || !url.trim() || !key || !key.trim() || !CODE.test(String(code ?? ""))) {
    return { ok: false };
  }

  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(`${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_order_delivery`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_code: code }),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!res.ok) return { ok: false };

    return { ok: true, data: normalizeDelivery(await res.json()) };
  } catch {
    return { ok: false };
  }
}

// El teléfono del repartidor y el link para escribirle (ENVIO-44 y 91): solo con el envío tomado y si
// hay un WhatsApp válido.
function courierContact(delivery, lang) {
  if (!delivery.whatsapp || delivery.state !== "accepted") return null;

  const repartidor = delivery.courier || t("tracker.delivery.courierWord", lang);
  return {
    line: t("tracker.delivery.contact", lang, { repartidor, whatsapp: delivery.whatsapp }),
    link: {
      text: t("tracker.delivery.write", lang, { repartidor }),
      href: `https://wa.me/${delivery.whatsapp}`,
    },
  };
}

// El bloque de envío de la página (ENVIO-29, 44, 91 y 92): qué pasa con el envío, según `state`.
// `money` formatea los precios en el idioma del cliente. Devuelve `{ tone, lines, link? }`, o null si
// no hay nada que mostrar (todavía no se confirmó el pedido, o un estado que no se conoce).
export function deliveryNotice(delivery, lang, money) {
  if (!delivery) return null;

  switch (delivery.state) {
    // Antes de que el local confirme la búsqueda no empezó: no hay nada nuevo que decir.
    case "waiting":
      return null;
    case "searching":
      return { tone: "searching", lines: [t("tracker.delivery.searching", lang)] };
    case "self":
      return { tone: "self", lines: [t("tracker.delivery.self", lang)] };
    case "accepted":
      break;
    default:
      return null;
  }

  const contact = courierContact(delivery, lang);

  const parts = [
    delivery.courier
      ? t("tracker.delivery.accepted", lang, { repartidor: delivery.courier })
      : t("tracker.delivery.acceptedAnon", lang),
  ];
  if (delivery.note) parts.push(delivery.note);
  if (delivery.price !== null) {
    parts.push(t("tracker.delivery.pay", lang, { precio: money.format(delivery.price) }));
  }

  const lines = [parts.join(" · ")];

  if (delivery.price !== null && delivery.listPrice !== null && delivery.price !== delivery.listPrice) {
    const precio = money.format(delivery.listPrice);
    lines.push(
      delivery.reason
        ? t("tracker.delivery.was", lang, { precio, motivo: delivery.reason })
        : t("tracker.delivery.wasNoReason", lang, { precio }),
    );
  }

  if (contact) lines.push(contact.line);

  return { tone: "accepted", lines, ...(contact ? { link: contact.link } : {}) };
}
