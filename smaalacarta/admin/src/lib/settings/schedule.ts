// Días como los escribe el menú web (`config.horarios`): sin tildes y en minúscula.
export const DAYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
] as const;

export type DayKey = (typeof DAYS)[number]["key"];

// Un día sin rangos es un día cerrado. Un horario `{}` (sin ningún día) significa
// que no se cargaron horarios: el menú se muestra siempre abierto.
export type Schedule = Partial<Record<DayKey, string[]>>;

const RANGE = /^([01][0-9]|2[0-3]):([0-5][0-9])-([01][0-9]|2[0-3]):([0-5][0-9])$/;

const DAY_KEYS: readonly string[] = DAYS.map((d) => d.key);

// Lee "HH:MM-HH:MM" en minutos desde la medianoche. Un rango que termina antes de
// empezar cruza la medianoche ("20:00-02:00" termina a las 26:00 = 1560).
// Devuelve null si el formato es inválido o el rango dura cero.
export function parseRange(value: string) {
  const match = RANGE.exec(value);
  if (!match) return null;

  const start = Number(match[1]) * 60 + Number(match[2]);
  let end = Number(match[3]) * 60 + Number(match[4]);

  if (end === start) return null;
  if (end < start) end += 24 * 60;

  return { start, end };
}

// Valida los rangos de cada día (ADMIN-CONFIG-2). Devuelve un mensaje por cada día
// con problemas; los rangos que se tocan en un borde (15:00-18:00 y 18:00-20:00)
// no se superponen.
export function validateSchedule(
  schedule: Schedule,
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const [day, ranges] of Object.entries(schedule)) {
    if (!DAY_KEYS.includes(day)) {
      errors[day] = "Día desconocido.";
      continue;
    }

    const parsed = (ranges ?? []).map(parseRange);

    if (parsed.some((range) => range === null)) {
      errors[day] = "Usá el formato HH:MM-HH:MM, con horas distintas de inicio y fin.";
      continue;
    }

    const sorted = (parsed as { start: number; end: number }[]).sort(
      (a, b) => a.start - b.start,
    );

    const overlaps = sorted.some(
      (range, index) => index > 0 && range.start < sorted[index - 1].end,
    );

    if (overlaps) {
      errors[day] = "Los horarios de un mismo día no pueden superponerse.";
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Deja el horario listo para guardar: sin rangos vacíos y ordenados por inicio.
// Los días cerrados (lista vacía) se conservan.
export function normalizeSchedule(schedule: Schedule): Schedule {
  const result: Schedule = {};

  for (const [day, ranges] of Object.entries(schedule)) {
    const clean = (ranges ?? []).map((r) => r.trim()).filter(Boolean);

    result[day as DayKey] = clean.sort(
      (a, b) => (parseRange(a)?.start ?? 0) - (parseRange(b)?.start ?? 0),
    );
  }

  return result;
}
