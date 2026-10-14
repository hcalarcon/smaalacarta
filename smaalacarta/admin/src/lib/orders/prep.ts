// Tiempo de preparación estimado por el local (ADMIN-PEDIDOS-31 a 38). Es una estimación, no una promesa:
// la hora que el local marca al aceptar y que el cliente ve como una ventana "aprox.". Siempre hora de
// Argentina. La mediana de la sugerencia la calcula la base (`suggested_prep_minutes`).

// La ventana que ve el cliente, desde la hora marcada. La misma constante vive en
// `web/apps/tracker/lib/prep.js` y un test las compara (SEGUIMIENTO-38).
export const PREP_WINDOW_MINUTES = 10;

export const PREP_MIN = 5;
export const PREP_MAX = 180;
export const PREP_FALLBACK = 20;
export const PREP_QUICK_MINUTES = [10, 15, 20, 30, 45] as const;
// Los botones rápidos de "Cambiar la demora": minutos que se suman (o restan) a lo que falta.
export const PREP_ADJUST_STEPS = [-5, 5, 10, 15, 30] as const;

export const PREP_REASONS = ["busy", "weather", "supply", "other"] as const;
export type PrepReason = (typeof PREP_REASONS)[number];

export const PREP_REASON_LABELS: Record<PrepReason, string> = {
  busy: "Mucho movimiento",
  weather: "Clima",
  supply: "Falta de insumo",
  other: "Otro",
};

export function isPrepReason(value: unknown): value is PrepReason {
  return typeof value === "string" && (PREP_REASONS as readonly string[]).includes(value);
}

export type PrepValidation = { ok: true; minutes: number } | { ok: false; error: string };

// Un entero de 5 a 180 (lo escrito en un campo llega como texto).
export function validatePrepMinutes(value: unknown): PrepValidation {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (typeof number !== "number" || !Number.isInteger(number) || number < PREP_MIN || number > PREP_MAX) {
    return { ok: false, error: `Poné un tiempo entero de ${PREP_MIN} a ${PREP_MAX} minutos.` };
  }

  return { ok: true, minutes: number };
}

type Timed = {
  status?: string;
  prep_ready_at?: string | null;
  scheduled_for?: string | null;
  preorder?: boolean;
};

// Un pedido programado o anticipado ya tiene su hora: no se le carga tiempo.
export function acceptsPrepTime(order: Pick<Timed, "scheduled_for" | "preorder">): boolean {
  return !order.scheduled_for && !order.preorder;
}

// Qué trae preseleccionado el selector: la sugerencia de la base (si está en rango) o el tiempo por
// defecto del negocio.
export function prepSelectorDefault(
  suggested: number | null | undefined,
  businessDefault: number,
): { minutes: number; suggested: boolean } {
  if (typeof suggested === "number" && validatePrepMinutes(suggested).ok) {
    return { minutes: suggested, suggested: true };
  }

  return {
    minutes: validatePrepMinutes(businessDefault).ok ? businessDefault : PREP_FALLBACK,
    suggested: false,
  };
}

// Minutos que faltan hasta la hora marcada, redondeando hacia arriba; negativo si ya pasó.
export function minutesLeft(readyAt: string, now: Date): number {
  const ready = new Date(readyAt).getTime();
  if (Number.isNaN(ready)) return Number.NaN;

  return Math.ceil((ready - now.getTime()) / 60_000);
}

const clock = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

// El texto de la tarjeta de un pedido Confirmado o En preparación con tiempo: "Listo 21:35 (en 8 min)".
// `late` pone la tarjeta en alerta cuando ya pasó la hora.
export function prepBadge(order: Timed, now: Date): { text: string; late: boolean } | null {
  if (order.status !== "confirmed" && order.status !== "preparing") return null;
  if (!order.prep_ready_at || !acceptsPrepTime(order)) return null;

  const left = minutesLeft(order.prep_ready_at, now);
  if (Number.isNaN(left)) return null;

  const time = clock.format(new Date(order.prep_ready_at));

  if (left > 0) return { text: `Listo ${time} (en ${left} min)`, late: false };
  if (left === 0) return { text: `Listo ${time} (ahora)`, late: false };

  return { text: `Listo ${time} (atrasado ${-left} min)`, late: true };
}

// "Cambiar la demora": lo que falta (nada si ya pasó) más `delta` minutos, que puede ser negativo, dentro del
// rango válido: bajar de más deja el mínimo, no un error.
export function adjustMinutes(readyAt: string | null | undefined, now: Date, delta: number): number {
  const left = readyAt ? minutesLeft(readyAt, now) : 0;
  const remaining = Number.isNaN(left) ? 0 : Math.max(0, left);

  return Math.max(PREP_MIN, Math.min(PREP_MAX, remaining + delta));
}

export function isAdjustStep(value: unknown): value is (typeof PREP_ADJUST_STEPS)[number] {
  return typeof value === "number" && (PREP_ADJUST_STEPS as readonly number[]).includes(value);
}
