// Reglas de presentación de la página Métricas (ADMIN-METRICAS-9 y 10), puras para testearlas.

export type PeriodDays = 7 | 30;

// `?dias=`: solo 7 o 30 exactos; cualquier otra cosa, 7.
export function parseDays(value: string | string[] | undefined): PeriodDays {
  return value === "30" ? 30 : 7;
}

export function periodCopy(days: PeriodDays) {
  return days === 7
    ? { label: "7 días", versus: "semana anterior" }
    : { label: "30 días", versus: "30 días anteriores" };
}

// Ancho de una barra, en % del mayor valor del gráfico.
export function barPercent(value: number, max: number) {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(1, Math.round((value / max) * 100));
}

// La hora (0 a 23) con más pedidos; en empate, la más temprana. Null si no hay ninguno.
export function peakHour(hours: number[]): number | null {
  let best: number | null = null;

  hours.forEach((count, hour) => {
    if (count > 0 && (best === null || count > hours[best])) best = hour;
  });

  return best;
}

export function peakHourText(hours: number[]) {
  const hour = peakHour(hours);
  return hour === null ? null : `Tu hora fuerte: ${hour} h`;
}
