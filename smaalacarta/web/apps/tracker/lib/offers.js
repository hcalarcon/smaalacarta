// Las ofertas de repartidor en el seguimiento (SEGUIMIENTO-28 y 29). Solo lógica: nunca arma HTML;
// los textos que llegan de la base (nombre, motivo) se pintan con `textContent` en tracker.js.

import { t } from "../../menu-app/lib/i18n.js";

// Falta este tiempo para la elección automática: es el aviso del "falta 1 minuto" (SEGUIMIENTO-31).
export const WARN_BEFORE_MS = 60_000;

// Las ofertas del favorito primero, después por precio, y a igual precio las que llegaron antes (el
// servidor ya las manda así; se repite acá para que la pantalla no dependa del orden en que lleguen).
export function sortOffers(offers) {
  if (!Array.isArray(offers)) return [];

  return offers
    .map((offer, index) => ({ offer, index }))
    .sort((a, b) => {
      if (a.offer.favorite !== b.offer.favorite) return a.offer.favorite ? -1 : 1;
      if (a.offer.price !== b.offer.price) return a.offer.price - b.offer.price;
      return a.index - b.index;
    })
    .map((item) => item.offer);
}

// "m:ss" de una cantidad de milisegundos; 0:00 si ya pasó.
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// La cuenta regresiva hasta la elección automática: cuánto falta, cómo se escribe y si ya entró en el
// último minuto. `null` si no hay cierre (sin ofertas todavía).
export function countdown(closesAt, now) {
  if (!Number.isFinite(closesAt)) return null;

  const left = closesAt - now;

  return {
    left,
    over: left <= 0,
    warn: left > 0 && left <= WARN_BEFORE_MS,
    clock: formatClock(left),
  };
}

// El texto de la cuenta regresiva: "Si no elegís en 3:20, elegimos la más barata".
export function countdownText(timer, lang) {
  if (!timer) return "";

  return timer.over
    ? t("tracker.delivery.countdownNow", lang)
    : t("tracker.delivery.countdown", lang, { tiempo: timer.clock });
}

// Lo que muestra una tarjeta de oferta: nombre, precio, motivo (si cambió el de lista) y la marca del
// favorito. `money` formatea en el idioma del cliente.
export function offerView(offer, listPrice, lang, money) {
  const changed = Number.isFinite(listPrice) && offer.price !== listPrice;

  return {
    id: offer.id,
    name: offer.courier || t("tracker.delivery.courierWord", lang),
    price: money.format(offer.price),
    reason: changed && offer.reason ? offer.reason : null,
    list: changed ? money.format(listPrice) : null,
    recommended: offer.favorite === true,
  };
}

// "¿Elegís a Damián por $5.000?" (SEGUIMIENTO-28).
export function confirmText(offer, lang, money) {
  return t("tracker.delivery.confirmChoose", lang, {
    repartidor: offer.courier || t("tracker.delivery.courierWord", lang),
    precio: money.format(offer.price),
  });
}
