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

const DELIVERY_STATES = ["waiting", "requested", "accepted", "rejected"];

// Valida la respuesta de `public_order_delivery`; null si no es un envío reconocible. Nunca trae
// teléfono ni dirección (ENVIO-17): esta página tampoco los muestra.
function normalizeDelivery(data) {
  if (!data || typeof data !== "object") return null;
  if (!DELIVERY_STATES.includes(data.estado)) return null;

  const price = Number(data.precio);
  const list = Number(data.precio_lista);
  if (!Number.isFinite(price) || !Number.isFinite(list)) return null;

  return {
    courier: typeof data.repartidor === "string" ? data.repartidor : "",
    zone: typeof data.zona === "string" ? data.zona : "",
    listPrice: list,
    price,
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

// El bloque de envío de la página (ENVIO-29): qué pasa con el repartidor, según `state`.
// `money` formatea los precios en el idioma del cliente. Devuelve `{ tone, lines }`.
export function deliveryNotice(delivery, lang, money) {
  if (!delivery) return null;

  if (delivery.state === "rejected") {
    return { tone: "rejected", lines: [t("tracker.delivery.rejected", lang)] };
  }

  if (delivery.state !== "accepted") {
    return { tone: "searching", lines: [t("tracker.delivery.searching", lang)] };
  }

  const parts = [t("tracker.delivery.accepted", lang, { repartidor: delivery.courier || "Repartos al Toque" })];
  if (delivery.note) parts.push(delivery.note);
  parts.push(t("tracker.delivery.pay", lang, { precio: money.format(delivery.price) }));

  const lines = [parts.join(" · ")];

  if (delivery.price !== delivery.listPrice) {
    const precio = money.format(delivery.listPrice);
    lines.push(
      delivery.reason
        ? t("tracker.delivery.was", lang, { precio, motivo: delivery.reason })
        : t("tracker.delivery.wasNoReason", lang, { precio }),
    );
  }

  return { tone: "accepted", lines };
}
