// Abierto o cerrado según los horarios del negocio (PUBLICO-12). Siempre con la hora de
// Argentina: la del celular del cliente no cuenta. La base hace el mismo cálculo
// (`is_open_now`) para rechazar pedidos fuera de horario, y un test compara los dos.

export const TIME_ZONE = "America/Argentina/Buenos_Aires";

const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Día de la semana (0 = domingo) y minutos desde la medianoche, en hora de Argentina.
export function localClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";

  return {
    day: WEEKDAYS[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// "20:00-02:00" → { start: 1200, end: 120 }; null si no tiene el formato.
export function parseRange(range) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.exec(range ?? "");
  if (!match) return null;
  return {
    start: Number(match[1]) * 60 + Number(match[2]),
    end: Number(match[3]) * 60 + Number(match[4]),
  };
}

const rangesOf = (horarios, day) =>
  (Array.isArray(horarios?.[DAYS[day]]) ? horarios[DAYS[day]] : []).map(parseRange).filter(Boolean);

// Sin horarios cargados el negocio está siempre abierto.
export function hasSchedule(horarios) {
  return Boolean(horarios) && typeof horarios === "object" && Object.keys(horarios).length > 0;
}

export function isOpenNow(horarios, now = new Date()) {
  if (!hasSchedule(horarios)) return true;

  const { day, minutes } = localClock(now);

  // Los rangos de hoy: el inicio cuenta, el cierre no. Uno nocturno llega hasta el final del día.
  const today = rangesOf(horarios, day).some((r) =>
    r.start < r.end ? minutes >= r.start && minutes < r.end : r.start > r.end && minutes >= r.start,
  );
  if (today) return true;

  // Los nocturnos de ayer siguen en la madrugada de hoy.
  return rangesOf(horarios, (day + 6) % 7).some((r) => r.start > r.end && minutes < r.end);
}

// Cuándo abre de nuevo: { day: "hoy" | nombre del día, time: "HH:MM" }, o null si no hay
// ningún rango en la semana. Sirve para el aviso "Abrimos hoy a las 20:00".
export function nextOpening(horarios, now = new Date()) {
  if (!hasSchedule(horarios)) return null;

  const { day, minutes } = localClock(now);

  for (let offset = 0; offset < 8; offset++) {
    const d = (day + offset) % 7;
    const starts = rangesOf(horarios, d)
      .map((r) => r.start)
      .filter((start) => offset > 0 || start > minutes)
      .sort((a, b) => a - b);

    if (starts.length > 0) {
      const hh = String(Math.floor(starts[0] / 60)).padStart(2, "0");
      const mm = String(starts[0] % 60).padStart(2, "0");
      return { day: offset === 0 ? "hoy" : offset === 1 ? "mañana" : DAYS[d], time: `${hh}:${mm}` };
    }
  }

  return null;
}

// "Abrimos hoy a las 20:00" / "Abrimos el jueves a las 10:00"; vacío si no hay dato.
export function openingText(next) {
  if (!next) return "";
  const when = next.day === "hoy" || next.day === "mañana" ? next.day : `el ${next.day}`;
  return `Abrimos ${when} a las ${next.time}`;
}
