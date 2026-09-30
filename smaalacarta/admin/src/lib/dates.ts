// Argentina no cambia de hora en el año (UTC-3), y el servidor de Vercel corre en UTC:
// "hoy" para el negocio empieza a las 03:00 UTC, no a las 00:00 del servidor (ADMIN-RESUMEN-1).
const OFFSET_HOURS = 3;

export function startOfTodayInArgentina(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [year, month, day] = parts.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, OFFSET_HOURS));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Comienzo (00:00 argentinas) del día de hace `daysAgo` días (ADMIN-METRICAS-1).
export function startOfDayInArgentina(now: Date = new Date(), daysAgo = 0): Date {
  return new Date(startOfTodayInArgentina(now).getTime() - daysAgo * DAY_MS);
}

// Corremos el reloj a la hora argentina y leemos en UTC: sin depender de la zona del servidor.
function asArgentinaClock(date: Date): Date {
  return new Date(date.getTime() - OFFSET_HOURS * 60 * 60 * 1000);
}

// Hora (0 a 23) en Argentina.
export function argentinaHour(date: Date): number {
  return asArgentinaClock(date).getUTCHours();
}

// Día de la semana en Argentina: 0 = lunes ... 6 = domingo.
export function argentinaWeekday(date: Date): number {
  return (asArgentinaClock(date).getUTCDay() + 6) % 7;
}
