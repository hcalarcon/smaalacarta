// Pedidos programados en el panel (ADMIN-PEDIDOS-14 y 15). Siempre hora de Argentina.

const TIME_ZONE = "America/Argentina/Buenos_Aires";
// Argentina no cambia de hora en el año: siempre UTC-3.
const OFFSET_HOURS = 3;

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// "Para las 20:30", o null si el pedido no es programado.
export function scheduledLabel(scheduledFor: string | null | undefined): string | null {
  if (!scheduledFor) return null;

  const date = new Date(scheduledFor);
  if (Number.isNaN(date.getTime())) return null;

  return `Para las ${timeFormatter.format(date)}`;
}

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: TIME_ZONE,
});

// "sáb 10/10": el día en que abre el negocio, en hora de Argentina.
function shortDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const part = (type: string) =>
    dayFormatter.formatToParts(date).find((p) => p.type === type)?.value.replace(/\.$/, "") ?? "";

  return `${part("weekday")} ${part("day")}/${part("month")}`;
}

// "Para el sáb 10/10" de un pedido anticipado (ADMIN-PEDIDOS-16), o null si no hay fecha.
export function preorderLabel(scheduledFor: string | null | undefined): string | null {
  const date = scheduledFor ? shortDate(scheduledFor) : null;
  return date ? `Para el ${date}` : null;
}

type Badged = { preorder?: boolean; scheduled_for?: string | null };

// El distintivo de la tarjeta: la fecha si el pedido es anticipado, la hora si es programado.
export function orderBadge(order: Badged): string | null {
  return order.preorder ? preorderLabel(order.scheduled_for) : scheduledLabel(order.scheduled_for);
}

// La columna "Para" del historial: la fecha, la hora o "Lo antes posible".
export function scheduledShort(order: Badged): string {
  if (order.preorder && order.scheduled_for) return shortDate(order.scheduled_for) ?? "Lo antes posible";
  return scheduledLabel(order.scheduled_for)?.replace("Para las ", "") ?? "Lo antes posible";
}

type Sortable = { created_at: string; scheduled_for?: string | null };

// Orden de la lista de Nuevos: los "lo antes posible" primero, por llegada; después los
// programados, por la hora para la que son (a igual hora, por llegada).
export function compareForBoard(a: Sortable, b: Sortable) {
  const byArrival = a.created_at.localeCompare(b.created_at);

  if (!a.scheduled_for && !b.scheduled_for) return byArrival;
  if (!a.scheduled_for) return -1;
  if (!b.scheduled_for) return 1;

  return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime() || byArrival;
}

// "20:30" → el instante de hoy (día de Argentina) a esa hora, en ISO; null si no es una hora.
export function todayAtIso(time: string, now: Date = new Date()): string | null {
  if (!TIME_PATTERN.test(time)) return null;

  const [year, month, day] = dateFormatter.format(now).split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hours + OFFSET_HOURS, minutes)).toISOString();
}
