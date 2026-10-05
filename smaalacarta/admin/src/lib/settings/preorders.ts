import type { ValidationResult } from "@/lib/auth/validation";

import { DAYS, parseRange, type DayKey, type Schedule } from "./schedule";

// Pedidos anticipados (ADMIN-CONFIG-18 a 20): con el negocio cerrado, se toman pedidos para la
// próxima apertura hasta un corte por día de venta: un día de la semana y una hora (hora de
// Argentina). La base valida la misma forma (`business_settings_preorder_cutoffs_check`).
export type PreorderCutoff = { dia: DayKey; hora: string };
export type PreorderCutoffs = Partial<Record<DayKey, PreorderCutoff>>;

export type PreordersInput = {
  preordersEnabled: boolean;
  preorderCutoffs: PreorderCutoffs;
  schedule: Schedule;
};

type Field = "preorderCutoffs";

const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const DAY_KEYS: readonly string[] = DAYS.map((d) => d.key);
const labelOf = (key: string) => DAYS.find((d) => d.key === key)?.label ?? key;

const hasRanges = (schedule: Schedule, day: DayKey) =>
  (schedule[day] ?? []).some((range) => parseRange(range) !== null);

// Minutos desde la medianoche de la primera apertura del día, o null si no tiene rangos válidos.
function firstOpening(schedule: Schedule, day: DayKey) {
  const starts = (schedule[day] ?? [])
    .map(parseRange)
    .flatMap((range) => (range ? [range.start] : []));
  return starts.length ? Math.min(...starts) : null;
}

// Un mensaje por cada día con problemas. El corte es "la última vez que cae ese día y hora antes
// de la apertura": con otro día de la semana siempre queda a menos de 7 días; con el mismo día,
// la hora tiene que ser anterior a la apertura (si no, sería una semana antes, casi seguro un error).
function cutoffError(schedule: Schedule, day: DayKey, cutoff: PreorderCutoff): string | null {
  if (!hasRanges(schedule, day)) return "es un día sin horario: cargá su horario primero.";
  if (!DAY_KEYS.includes(cutoff?.dia)) return "elegí el día del corte.";

  const time = TIME.exec(cutoff.hora ?? "");
  if (!time) return "ingresá la hora del corte como HH:MM, por ejemplo 20:00.";

  const opening = firstOpening(schedule, day);
  const minutes = Number(time[1]) * 60 + Number(time[2]);

  if (cutoff.dia === day && opening !== null && minutes >= opening) {
    const hh = String(Math.floor(opening / 60)).padStart(2, "0");
    const mm = String(opening % 60).padStart(2, "0");
    return `el corte tiene que ser anterior a la apertura (${hh}:${mm}).`;
  }

  return null;
}

export function validatePreorders(input: PreordersInput): ValidationResult<Field> {
  if (!input.preordersEnabled) return { ok: true };

  const entries = Object.entries(input.preorderCutoffs) as [DayKey, PreorderCutoff][];

  if (entries.length === 0) {
    return {
      ok: false,
      errors: { preorderCutoffs: "Cargá el corte de al menos un día para aceptar pedidos anticipados." },
    };
  }

  const messages = entries.flatMap(([day, cutoff]) => {
    const error = cutoffError(input.schedule, day, cutoff);
    return error ? [`${labelOf(day)}: ${error}`] : [];
  });

  return messages.length
    ? { ok: false, errors: { preorderCutoffs: messages.join(" ") } }
    : { ok: true };
}

// Deja los cortes listos para guardar: sin los de días que ya no tienen horario y, con la
// sección apagada (campos ocultos), sin los inválidos, para que no frenen el guardado ni lleguen
// a la base. Encendida, un corte inválido queda como está para que la validación lo marque.
export function normalizePreorders<T extends PreordersInput>(input: T): T {
  const kept = Object.entries(input.preorderCutoffs).filter(
    ([day, cutoff]) =>
      hasRanges(input.schedule, day as DayKey) &&
      (input.preordersEnabled || cutoffError(input.schedule, day as DayKey, cutoff) === null),
  );

  return { ...input, preorderCutoffs: Object.fromEntries(kept) as PreorderCutoffs };
}
