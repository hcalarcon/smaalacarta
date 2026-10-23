// Reglas puras de los avisos con sonido y voz del panel del repartidor (ENVIO-234 a 240): qué frase se dice,
// qué pedidos siguen avisando, cuándo suena y cuándo se muestra el aviso chico del sonido. El navegador
// (audio, voz, localStorage) lo toca el hook `useNewOrderAlert`.
import { newPendingIds } from "@/lib/orders/alerts";

export type CourierAlert = { id: string; zone: string | null };

// El volumen de la alarma del repartidor: el máximo, para que se oiga con el teléfono en el bolsillo.
export const COURIER_ALARM_VOLUME = 1;
// La voz entra después del sonido (la alarma dura un segundo) y se repite mientras dure el aviso.
export const ALERT_VOICE_DELAY_MS = 1000;
export const ALERT_VOICE_REPEAT_MS = 30_000;

export const SOUND_HINT_TEXT = "Tocá la pantalla para activar el sonido";

export function alertPhrase(alerts: CourierAlert[]): string {
  if (alerts.length === 0) return "";
  if (alerts.length > 1) return `${alerts.length} envíos nuevos`;

  const zone = alerts[0].zone?.trim();
  return zone ? `Nuevo envío a zona ${zone}` : "Nuevo envío";
}

export function readyPhrase(business: string): string {
  const name = business.trim();
  return name ? `Pedido listo en ${name}` : "Pedido listo";
}

// Los pedidos pendientes que todavía no se habían visto, con su zona para la frase.
export function freshAlerts<T extends { id: string }>(
  seen: ReadonlySet<string>,
  orders: T[],
  isPending: (order: T) => boolean,
  zoneOf: (order: T) => string | null,
): CourierAlert[] {
  const fresh = new Set(newPendingIds(seen, orders, isPending));
  return orders.filter((order) => fresh.has(order.id)).map((order) => ({ id: order.id, zone: zoneOf(order) }));
}

// Un aviso se va cuando el pedido ya no espera su respuesta (lo ofertó, lo tomó, lo rechazó o se cerró) o
// desapareció de la lista.
export function alertsAfter<T extends { id: string }>(
  alerts: CourierAlert[],
  orders: T[],
  isPending: (order: T) => boolean,
): CourierAlert[] {
  const pending = new Set(orders.filter(isPending).map((order) => order.id));
  return alerts.filter((alert) => pending.has(alert.id));
}

export function shouldPlayAlert(input: { alerts: number; soundOn: boolean; audioReady: boolean }): boolean {
  return input.alerts > 0 && input.soundOn && input.audioReady;
}

// El aviso chico mientras el navegador no dejó sonar: solo si el sonido está prendido.
export function soundHint(input: { soundOn: boolean; audioReady: boolean }): string | null {
  return input.soundOn && !input.audioReady ? SOUND_HINT_TEXT : null;
}

// Lo que se guardó en el aparato: sin nada el sonido está prendido, y solo apagarlo a propósito lo deja apagado.
export function soundPrefValue(stored: string | null): boolean {
  return stored !== "0";
}
