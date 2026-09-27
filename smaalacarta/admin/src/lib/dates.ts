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
