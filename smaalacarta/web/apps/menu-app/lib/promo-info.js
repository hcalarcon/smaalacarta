// Vigencia y stock de las promociones en el menú (PUBLICO-67 a 71). El servidor ya no entrega las vencidas ni
// las agotadas; acá solo se dicen "hasta cuándo vale" y "cuántas quedan" (que llega solo con 5 o menos).
// Lógica pura: `app.js` y el menú estático solo pintan.

import { t } from "./i18n.js";
import { TIME_ZONE } from "./schedule.js";

const dayFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE });

function endOf(item) {
  if (item?.esPromo !== true || typeof item.validaHasta !== "string") return null;

  const at = new Date(item.validaHasta);
  return Number.isNaN(at.getTime()) ? null : at;
}

// "20/10": el día en que termina, en hora de Argentina, o null.
export function validUntilDate(item) {
  const end = endOf(item);
  return end ? dayFormatter.format(end) : null;
}

// "Válida hasta el 20/10", o null si no tiene fin.
export function validUntilLabel(item, lang) {
  const fecha = validUntilDate(item);
  return fecha ? t("promo.validUntil", lang, { fecha }) : null;
}

// "¡Últimas 3!" / "¡Última unidad!", o null si no llegó `quedan` (más de 5 o sin stock cargado).
export function lastUnitsLabel(item, lang) {
  if (item?.esPromo !== true) return null;

  const n = Number(item.quedan);
  if (!Number.isInteger(n) || n < 1) return null;

  return n === 1 ? t("promo.lastOne", lang) : t("promo.lastUnits", lang, { n });
}

// Pasó su hora de fin (la página quedó abierta): ya no se puede pedir.
export function isExpired(item, now = new Date()) {
  const end = endOf(item);
  return end ? now.getTime() > end.getTime() : false;
}
