import { argentinaWeekday, startOfTodayInArgentina } from "@/lib/dates";

// Vigencia y stock de las promociones en el panel (ADMIN-PROMO-4 a 12). Siempre hora de Argentina (UTC-3, sin
// cambio de hora): el negocio elige una fecha y una hora de su reloj y la base guarda un instante.

const OFFSET_HOURS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_END_TIME = "23:59";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => String(n).padStart(2, "0");

// "2026-10-20": el día de hoy en Argentina.
export function argentinaDate(now: Date = new Date()): string {
  // El comienzo del día argentino es las 03:00 UTC de esa misma fecha: sus campos UTC son la fecha.
  const start = startOfTodayInArgentina(now);
  return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
}

// La fecha y la hora (de Argentina) como el instante en que termina la promoción, en ISO UTC. Sin hora,
// 23:59 de ese día. Nulo si alguno de los dos no es válido.
export function endsAtIso(date: string, time: string = DEFAULT_END_TIME): string | null {
  const d = DATE_PATTERN.exec(date.trim());
  const t = TIME_PATTERN.exec((time.trim() || DEFAULT_END_TIME));
  if (!d || !t) return null;

  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const instant = new Date(Date.UTC(year, month - 1, day, Number(t[1]) + OFFSET_HOURS, Number(t[2])));

  // Un 31 de febrero no existe: la fecha se arma de nuevo y tiene que coincidir.
  const back = new Date(instant.getTime() - OFFSET_HOURS * 60 * 60 * 1000);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;

  return instant.toISOString();
}

// De un instante a lo que se muestra en los campos del panel: fecha y hora de Argentina.
export function splitEnd(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { date: "", time: "" };

  const local = new Date(at.getTime() - OFFSET_HOURS * 60 * 60 * 1000);

  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

// Los atajos de "Válida hasta": hoy y el domingo de este fin de semana (hoy mismo si ya es domingo).
export function endShortcuts(now: Date = new Date()): { today: string; weekend: string } {
  const today = argentinaDate(now);
  const daysToSunday = 6 - argentinaWeekday(now);
  const sunday = new Date(startOfTodayInArgentina(now).getTime() + daysToSunday * DAY_MS);

  return { today, weekend: argentinaDate(sunday) };
}

export type PromotionStatusKey = "vigente" | "vence_hoy" | "vence_manana" | "vencida" | "agotada";

const STATUS_LABELS: Record<PromotionStatusKey, string> = {
  vigente: "Vigente",
  vence_hoy: "Vence hoy",
  vence_manana: "Vence mañana",
  vencida: "Vencida",
  agotada: "Agotada",
};

// El estado de una promoción en la lista: vencida o agotada la sacan del menú; vence hoy o mañana avisan.
export function promotionStatus(input: {
  validUntil: string | null;
  remaining: number | null;
  now?: Date;
}): { key: PromotionStatusKey; label: string } {
  const now = input.now ?? new Date();
  const end = input.validUntil ? new Date(input.validUntil) : null;
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;

  let key: PromotionStatusKey = "vigente";

  if (validEnd && now.getTime() > validEnd.getTime()) {
    key = "vencida";
  } else if (input.remaining !== null && input.remaining <= 0) {
    key = "agotada";
  } else if (validEnd) {
    const today = argentinaDate(now);
    const endDay = splitEnd(validEnd.toISOString()).date;
    const tomorrow = argentinaDate(new Date(startOfTodayInArgentina(now).getTime() + DAY_MS));

    if (endDay === today) key = "vence_hoy";
    else if (endDay === tomorrow) key = "vence_manana";
  }

  return { key, label: STATUS_LABELS[key] };
}

// "20/10 a las 23:59", para el detalle de la vigencia.
export function formatEnd(iso: string | null | undefined): string {
  const { date, time } = splitEnd(iso);
  if (!date) return "";

  const [, month, day] = date.split("-");
  return `${day}/${month} a las ${time}`;
}
