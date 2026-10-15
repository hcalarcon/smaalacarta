// El tiempo estimado de preparación en el seguimiento (SEGUIMIENTO-37 a 42). Solo lógica: el dibujo está
// en `tracker.js`, que pinta todo con textContent. Es una estimación: siempre "aprox.", sin promesas y sin
// números negativos. Las horas, siempre en hora de Argentina.

import { LOCALES, t } from "../../menu-app/lib/i18n.js";
import { TIME_ZONE } from "../../menu-app/lib/schedule.js";

// La ventana que ve el cliente, desde la hora marcada por el local. La misma constante vive en
// `admin/src/lib/orders/prep.ts` y un test las compara (SEGUIMIENTO-38).
export const PREP_WINDOW_MINUTES = 10;

const REASONS = ["busy", "weather", "supply"];

function clock(date, lang) {
  return new Intl.DateTimeFormat(LOCALES[lang] ?? LOCALES.es, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).format(date);
}

// "faltan 12 min", con su singular ("falta 1 min").
function minutesLeft(n, lang) {
  return n === 1 ? t("tracker.prep.in1", lang) : t("tracker.prep.in", lang, { n });
}

// Qué mostrar con el `pedido.prep` que entrega `public_order_tracking`, o null si no hay nada que mostrar:
// - `kind`: `range` (todavía dentro de lo previsto) o `late` (ya pasó el fin de la ventana).
// - `text`: la línea principal. `hint`: "en unos N min" o "Falta poco" (null si se demora).
// - `reason`: el motivo en una frase amable, o null.
// `pickup`: el pedido es para retirar.
export function prepView(prep, { now = new Date(), lang = "es", pickup = false } = {}) {
  if (!prep || typeof prep !== "object") return null;

  const desde = new Date(prep.desde);
  const hasta = new Date(prep.hasta);

  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta <= desde) return null;

  const reason = REASONS.includes(prep.motivo)
    ? t("tracker.prep.reason", lang, { motivo: t(`tracker.prep.reason.${prep.motivo}`, lang) })
    : null;

  if (now.getTime() >= hasta.getTime()) {
    return { kind: "late", text: t("tracker.prep.late", lang), hint: null, reason };
  }

  const minutes = Math.ceil((desde.getTime() - now.getTime()) / 60_000);

  const text = pickup
    ? t("tracker.prep.pickup", lang, { desde: clock(desde, lang) })
    : t("tracker.prep.range", lang, { desde: clock(desde, lang), hasta: clock(hasta, lang) });

  return {
    kind: "range",
    text,
    hint: minutes > 0 ? minutesLeft(minutes, lang) : t("tracker.prep.soon", lang),
    reason,
  };
}

// La hora a la que llega el repartidor (`envio.arrivesAt`, en ms) y cuánto falta (SEGUIMIENTO-45). Misma regla
// que el tiempo del local: "aprox.", se descuenta con la hora y, pasada, dice "Unos minutos más" (nunca negativos).
export function arrivalView(arrivesAt, { now = new Date(), lang = "es" } = {}) {
  if (typeof arrivesAt !== "number" || !Number.isFinite(arrivesAt)) return null;

  const minutes = Math.ceil((arrivesAt - now.getTime()) / 60_000);

  if (minutes <= 0) return { kind: "late", text: t("tracker.delivery.late", lang), hint: null };

  return {
    kind: "range",
    text: t("tracker.delivery.arrives", lang, { hora: clock(new Date(arrivesAt), lang) }),
    hint: minutesLeft(minutes, lang),
  };
}
