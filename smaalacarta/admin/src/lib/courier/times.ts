import { formatClock } from "@/lib/orders/prep";

// Los tiempos del circuito del envío (ENVIO-156, 157 y 163): la hora de listo que ve el repartidor y los dos
// "llego en X minutos" que carga. Reglas puras; la base valida el mismo rango (`courier_set_eta`).

export type EtaKind = "pickup" | "dropoff";

// Los botones rápidos y el rango del campo libre.
export const ETA_QUICK_MINUTES = [5, 10, 15, 20, 30] as const;
export const ETA_MIN = 1;
export const ETA_MAX = 120;

// Lo que `courier_orders()` entrega en `tiempos` de cada pedido que el repartidor tomó.
export type CourierTimes = {
  listo_a: string | null;
  demora_min: number | null;
  // La hora de listo que el repartidor había visto, si el local la cambió después de que lo tomó.
  listo_antes: string | null;
  llega_local_a: string | null;
  llega_cliente_a: string | null;
};

export type EtaValidation = { ok: true; minutes: number } | { ok: false; error: string };

// Un entero de 1 a 120 (lo escrito en un campo llega como texto).
export function validateEta(value: unknown): EtaValidation {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (typeof number !== "number" || !Number.isInteger(number) || number < ETA_MIN || number > ETA_MAX) {
    return { ok: false, error: `Poné un tiempo entero de ${ETA_MIN} a ${ETA_MAX} minutos.` };
  }

  return { ok: true, minutes: number };
}

// "Listo para retirar a las 21:35 · Demora 45 min". Un pedido programado trae la hora y no la demora.
export function readyLine(readyAt: string | null | undefined, minutes: number | null | undefined): string | null {
  if (!readyAt || Number.isNaN(new Date(readyAt).getTime())) return null;

  const base = `Listo para retirar a las ${formatClock(readyAt)}`;
  return typeof minutes === "number" ? `${base} · Demora ${minutes} min` : base;
}

// Si el local cambió la demora: la hora nueva y la que había visto el repartidor ("Cambió", con la anterior
// tachada). Nulo si no cambió o si la hora es la misma.
export function readyChange(
  times: Pick<CourierTimes, "listo_a" | "listo_antes"> | null | undefined,
): { now: string; before: string } | null {
  if (!times?.listo_a || !times.listo_antes) return null;

  const now = formatClock(times.listo_a);
  const before = formatClock(times.listo_antes);

  return now === before ? null : { now, before };
}

// "Llegás al local a las 21:40" / "Llegás al cliente a las 21:55".
export function etaLabel(kind: EtaKind, at: string | null | undefined): string | null {
  if (!at || Number.isNaN(new Date(at).getTime())) return null;

  return `Llegás ${kind === "pickup" ? "al local" : "al cliente"} a las ${formatClock(at)}`;
}
