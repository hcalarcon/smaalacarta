import type { PushControl } from "@/lib/push/install";

// Reglas del aviso fuerte de pedido nuevo del panel (ADMIN-PEDIDOS-24 a 30). Puro: qué pedidos cuentan,
// cuándo se silencia, cuánto sube el volumen, cuándo parpadea el título y cuándo se muestra la barra.
// Lo que toca el navegador (sonido, voz, favicon) vive en `sound.ts`, `speech.ts` y `badge.ts`.

type OrderLike = {
  id: string;
  status?: string;
  source?: string;
  payment_status?: string;
  created_at?: string;
};

// Pedido por menú que el local todavía no atendió: pendiente, no cargado por el propio local y, si es de
// Mercado Pago, ya pagado. Es la misma regla con la que el servidor manda los recordatorios push
// (`run_order_timers()`), para que el panel y el celular hablen de los mismos pedidos.
export function isUnattended(order: OrderLike): boolean {
  return (
    order.status === "pending" &&
    order.source !== "manual" &&
    order.payment_status !== "awaiting" &&
    order.payment_status !== "failed"
  );
}

export function unattendedOrders<T extends OrderLike>(orders: T[]): T[] {
  return orders.filter(isUnattended);
}

// "Silenciar" calla el sonido y la voz 5 minutos; el título, el globito y la barra siguen.
export const MUTE_MS = 5 * 60_000;
export const VOICE_REPEAT_MS = 30_000;

export function isMuted(mutedUntil: number | null, now: number): boolean {
  return mutedUntil !== null && now < mutedUntil;
}

// A los 60 s sin atender la alarma sube de volumen.
export const ALARM_LOUD_AFTER_MS = 60_000;
const ALARM_VOLUME = 0.35;
const ALARM_VOLUME_LOUD = 0.9;

// Cuánto lleva esperando el pedido sin atender más viejo; cero si no hay o no trae fecha.
export function oldestWaitingMs(orders: OrderLike[], now: number): number {
  const times = orders
    .filter(isUnattended)
    .map((order) => (order.created_at ? new Date(order.created_at).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));

  if (times.length === 0) return 0;
  return Math.max(0, now - Math.min(...times));
}

export function alarmVolume(waitingMs: number): number {
  return waitingMs >= ALARM_LOUD_AFTER_MS ? ALARM_VOLUME_LOUD : ALARM_VOLUME;
}

// Título de la pestaña: con pendientes alterna entre el aviso y el título normal.
export function blinkTitle(originalTitle: string, count: number, alertPhase: boolean): string {
  return count > 0 && alertPhase ? `(${count}) NUEVO PEDIDO` : originalTitle;
}

export function shouldBlink(count: number, reducedMotion: boolean): boolean {
  return count > 0 && !reducedMotion;
}

// El texto del globito: la cantidad, y "9+" desde diez para que entre en el ícono.
export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

export type BarState = { sound: boolean; push: boolean };

// La barra roja de arriba: qué falta para enterarse de los pedidos nuevos. `null` si no hay nada que decir.
// `push: true` incluye "bloqueado" y "por instalar": el aviso no llega, aunque desde acá no se pueda
// activar. "hidden" (navegador sin avisos) no pide algo imposible.
export function barState(input: { ordersEnabled: boolean; soundOn: boolean; push: PushControl }): BarState | null {
  if (!input.ordersEnabled) return null;

  const push = input.push === "enable" || input.push === "blocked" || input.push === "install-first";
  const sound = !input.soundOn;

  return sound || push ? { sound, push } : null;
}
