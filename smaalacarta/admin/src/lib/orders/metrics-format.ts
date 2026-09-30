import { deltaPercent } from "./metrics";

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const formatArs = (amount: number) => ars.format(amount);

// "↑ 12 % vs semana anterior". Nada si no hay con qué comparar o si la lectura se truncó
// (los períodos quedarían incompletos). `versus` es cómo se llama el período anterior.
export function deltaText(current: number, previous: number, versus: string, truncated = false) {
  const delta = deltaPercent(current, previous);

  if (truncated || delta === null) return null;
  if (delta === 0) return `Sin cambios vs ${versus}`;

  return `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)} % vs ${versus}`;
}

export function webShareText(webCount: number, total: number) {
  if (total === 0) return "Todavía no hay pedidos";

  return `${webCount} de ${total} ${total === 1 ? "pedido vino" : "pedidos vinieron"} por tu menú web`;
}
