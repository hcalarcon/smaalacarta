// Pedidos anticipados (PUBLICO-31 a 34): un negocio que vende solo ciertos días puede recibir
// pedidos mientras está cerrado, para su próxima apertura, hasta un corte fijo (día de la
// semana y hora). Siempre con la hora de Argentina. La base hace el mismo cálculo
// (`preorder_window`) para aceptar o rechazar el pedido, y un test compara los dos.

import { t } from "./i18n.js";
import { DAYS, hasSchedule, isOpenNow, rangesOf } from "./schedule.js";

// Argentina no cambia de hora en el año: siempre UTC-3. Restar el desfase deja un "reloj
// local" que se lee con los getters UTC.
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Lo que se necesita para armar un corte: el día de la semana (0 = domingo) y la hora.
function parseCutoff(cutoff) {
  const day = DAYS.indexOf(cutoff?.dia);
  const time = TIME.exec(cutoff?.hora ?? "");
  if (day < 0 || !time) return null;
  return { day, minutes: Number(time[1]) * 60 + Number(time[2]) };
}

// { opensAt, cutoffAt, day } de la próxima apertura, o null si no corresponde: el negocio
// está abierto, no tiene horarios, ese día no tiene corte o el corte ya pasó. El corte de un
// día de venta es la última vez que cae su día y hora antes de la primera apertura de ese día.
export function preorderWindow(horarios, cortes, now = new Date()) {
  if (!hasSchedule(horarios) || isOpenNow(horarios, now)) return null;
  if (!cortes || typeof cortes !== "object") return null;

  const nowLocal = now.getTime() - OFFSET_MS;
  const todayStart = Math.floor(nowLocal / DAY_MS) * DAY_MS;

  for (let offset = 0; offset < 8; offset++) {
    const dayStart = todayStart + offset * DAY_MS;
    const day = new Date(dayStart).getUTCDay();
    const starts = rangesOf(horarios, day)
      .filter((r) => r.start !== r.end)
      .map((r) => dayStart + r.start * MINUTE_MS);

    if (!starts.some((start) => start > nowLocal)) continue;

    const cutoff = parseCutoff(cortes[DAYS[day]]);
    if (!cutoff) return null;

    const firstOpen = Math.min(...starts);
    let cutoffLocal = null;
    for (let back = 0; back <= 7 && cutoffLocal === null; back++) {
      const candidateDay = dayStart - back * DAY_MS;
      if (new Date(candidateDay).getUTCDay() !== cutoff.day) continue;
      const candidate = candidateDay + cutoff.minutes * MINUTE_MS;
      if (candidate < firstOpen) cutoffLocal = candidate;
    }

    const cutoffAt = new Date(cutoffLocal + OFFSET_MS);
    if (now.getTime() >= cutoffAt.getTime()) return null;

    return { opensAt: new Date(firstOpen + OFFSET_MS), cutoffAt, day: DAYS[day] };
  }

  return null;
}

// Lo que el servidor entregó en `config.anticipados`, como fechas; null si no hay, está
// malformado o el corte ya pasó (una página que quedó abierta desde antes).
export function activePreorder(config, now = new Date()) {
  const raw = config?.anticipados;
  if (!raw || raw.activo !== true) return null;

  const opensAt = new Date(raw.proximaApertura);
  const cutoffAt = new Date(raw.corte);
  if (Number.isNaN(opensAt.getTime()) || Number.isNaN(cutoffAt.getTime())) return null;
  if (now.getTime() >= cutoffAt.getTime()) return null;

  return { opensAt, cutoffAt };
}

const pad = (n) => String(n).padStart(2, "0");

// "sábado 10/10" (el día de la apertura) y "viernes 20:00" (el corte), en el idioma del cliente.
export function preorderLabels({ opensAt, cutoffAt }, lang) {
  const open = new Date(opensAt.getTime() - OFFSET_MS);
  const cut = new Date(cutoffAt.getTime() - OFFSET_MS);

  return {
    date: `${t(`day.${DAYS[open.getUTCDay()]}`, lang)} ${pad(open.getUTCDate())}/${pad(open.getUTCMonth() + 1)}`,
    cutoff: `${t(`day.${DAYS[cut.getUTCDay()]}`, lang)} ${pad(cut.getUTCHours())}:${pad(cut.getUTCMinutes())}`,
  };
}

// "Cerrado ahora. Podés dejar tu pedido para el sábado 10/10 (hasta el viernes 20:00)".
export function preorderNotice(window, lang) {
  return t("preorder.notice", lang, preorderLabels(window, lang));
}

// "Tu pedido es para el sábado 10/10", en la pantalla de gracias (sin link de seguimiento).
export function preorderThanks(window, lang) {
  return t("preorder.thanks", lang, preorderLabels(window, lang));
}

// La línea del mensaje de WhatsApp que recibe el negocio: siempre en español (IDIOMA-5).
export function preorderMessageLine(window) {
  return `📅 ${t("preorder.whatsapp", "es", preorderLabels(window, "es"))}`;
}
