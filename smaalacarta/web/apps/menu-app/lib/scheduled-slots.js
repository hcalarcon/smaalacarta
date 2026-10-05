// Horas de hoy para programar un pedido (PUBLICO-29): cada 15 minutos, dentro de un rango
// abierto y desde ahora más la anticipación que pide el negocio. Hora de Argentina siempre.
// La base hace el mismo cálculo (`is_schedulable_at`) para aceptar o rechazar la hora, y un
// test compara los dos.

import { isOpenNow, localClock } from "./schedule.js";

const STEP_MS = 15 * 60 * 1000;
const DEFAULT_LEAD_MINUTES = 30;

// Argentina no cambia de hora en el año y su diferencia con UTC es de horas enteras, así que
// los múltiplos de 15 minutos desde la época caen justo en :00, :15, :30 y :45 de su reloj.
export function scheduledSlots(horarios, leadMinutes, now = new Date()) {
  const lead = Number.isFinite(leadMinutes) ? leadMinutes : DEFAULT_LEAD_MINUTES;
  const earliest = now.getTime() + lead * 60 * 1000;
  const today = localClock(now).day;

  const slots = [];
  for (let ms = Math.ceil(earliest / STEP_MS) * STEP_MS; ; ms += STEP_MS) {
    const at = new Date(ms);
    const clock = localClock(at);
    if (clock.day !== today) break;

    if (isOpenNow(horarios, at)) {
      const hh = String(Math.floor(clock.minutes / 60)).padStart(2, "0");
      const mm = String(clock.minutes % 60).padStart(2, "0");
      slots.push({ value: `${hh}:${mm}`, iso: at.toISOString() });
    }
  }

  return slots;
}
