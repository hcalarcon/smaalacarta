import { argentinaHour, argentinaWeekday, startOfDayInArgentina } from "@/lib/dates";

export type MetricOrder = {
  status: string;
  total: number;
  source: "web" | "manual";
  created_at: string;
  order_items: { name: string; quantity: number }[];
};

export type MetricsSummary = {
  count: number;
  revenue: number;
  avgTicket: number;
  cancelled: number;
  unconfirmed: number;
  webCount: number;
  manualCount: number;
};

// "Vendido": los pedidos que el negocio aceptó. Cancelados no suman; pending es "sin confirmar"
// (ADMIN-METRICAS-2).
const SOLD = new Set(["confirmed", "preparing", "ready", "delivered"]);

const isSold = (order: MetricOrder) => SOLD.has(order.status);

export function summarize(orders: MetricOrder[]): MetricsSummary {
  const sold = orders.filter(isSold);
  const revenue = sold.reduce((sum, order) => sum + order.total, 0);

  return {
    count: sold.length,
    revenue,
    avgTicket: sold.length === 0 ? 0 : Math.round(revenue / sold.length),
    cancelled: orders.filter((order) => order.status === "cancelled").length,
    unconfirmed: orders.filter((order) => order.status === "pending").length,
    webCount: sold.filter((order) => order.source === "web").length,
    manualCount: sold.filter((order) => order.source === "manual").length,
  };
}

// Los últimos `days` días (incluido hoy) y los `days` anteriores, con los días de Argentina
// (ADMIN-METRICAS-3).
export function comparePeriods(orders: MetricOrder[], now: Date, days: number) {
  const currentStart = startOfDayInArgentina(now, days - 1).getTime();
  const previousStart = startOfDayInArgentina(now, 2 * days - 1).getTime();

  const current: MetricOrder[] = [];
  const previous: MetricOrder[] = [];

  for (const order of orders) {
    const at = new Date(order.created_at).getTime();
    if (at >= currentStart) current.push(order);
    else if (at >= previousStart) previous.push(order);
  }

  return { current, previous };
}

// Variación en % entera; null si no hay con qué comparar.
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function topProducts(orders: MetricOrder[], limit = 5) {
  const totals = new Map<string, number>();

  for (const order of orders.filter(isSold)) {
    for (const item of order.order_items) {
      totals.set(item.name, (totals.get(item.name) ?? 0) + item.quantity);
    }
  }

  return [...totals.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);
}

function countBy(orders: MetricOrder[], size: number, bucket: (date: Date) => number) {
  const counts = Array<number>(size).fill(0);
  for (const order of orders.filter(isSold)) {
    counts[bucket(new Date(order.created_at))] += 1;
  }
  return counts;
}

export const byHour = (orders: MetricOrder[]) => countBy(orders, 24, argentinaHour);

// 0 = lunes ... 6 = domingo.
export const byWeekday = (orders: MetricOrder[]) => countBy(orders, 7, argentinaWeekday);
