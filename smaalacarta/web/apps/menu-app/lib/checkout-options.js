// Qué entrega y qué medios de pago ofrece el negocio en el checkout (PUBLICO-19) y qué
// datos de transferencia mostrar al terminar el pedido (PUBLICO-20). Lógica pura: `app.js`
// solo arma los selects y pinta.

import { scheduledSlots } from "./scheduled-slots.js";

export const DELIVERY = ["delivery", "retiro"];
export const PAYMENT = ["efectivo", "transferencia", "tarjeta"];

// Las opciones habilitadas, en el orden de siempre. Si el menú no trae la lista (viene de
// un JSON) o no queda ninguna válida, se ofrecen todas, como hasta ahora.
function pick(all, enabled) {
  if (!Array.isArray(enabled)) return all;

  const picked = all.filter((option) => enabled.includes(option));
  return picked.length ? picked : all;
}

function group(all, enabled) {
  const options = pick(all, enabled);
  // Con una sola opción no hay nada que elegir: se preselecciona y se oculta el select.
  return { options, single: options.length === 1 ? options[0] : null };
}

// Mercado Pago (PUBLICO-36) solo se ofrece si `config.pagos` lo trae: sin la lista (JSON de demos)
// se ofrecen los tres de siempre, nunca un cobro en línea.
function paymentGroup(enabled) {
  if (!Array.isArray(enabled)) return group(PAYMENT, enabled);

  const picked = [...PAYMENT.filter((option) => enabled.includes(option)), ...(enabled.includes("mercadopago") ? ["mercadopago"] : [])];
  const options = picked.length ? picked : PAYMENT;
  return { options, single: options.length === 1 ? options[0] : null };
}

export function checkoutOptions(config) {
  return {
    delivery: group(DELIVERY, config?.entrega),
    payment: paymentGroup(config?.pagos),
  };
}

// Con un solo tipo de entrega el select se oculta y el cliente no vería cómo se entrega:
// este aviso se lo dice (PUBLICO-22). Con las dos opciones, o sin lista, no hay aviso.
export function deliveryNotice(config) {
  const { single } = checkoutOptions(config).delivery;
  if (single === "delivery") return { kind: "delivery" };
  if (single !== "retiro") return null;

  const address = text(config?.direccion);
  return { kind: "pickup", ...(address ? { address } : {}) };
}

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

// Alias y CBU/CVU para mostrar en "Gracias por tu pedido", solo si el cliente eligió
// pagar por transferencia y el negocio cargó alguno. Si no, null.
export function transferDetails(config, payment) {
  if (payment !== "transferencia") return null;

  const alias = text(config?.transferencia?.alias);
  const cbu = text(config?.transferencia?.cbu);
  if (!alias && !cbu) return null;

  return { ...(alias ? { alias } : {}), ...(cbu ? { cbu } : {}) };
}

// Cómo se elige para cuándo es el pedido (PUBLICO-30). "slots": "Lo antes posible" o
// "Programar" con las horas de hoy; "none": solo lo antes posible; "free": el campo de hora
// libre de siempre, para los menús que no vienen de Supabase.
export function scheduleChoice(config, fromSupabase, now = new Date()) {
  if (!fromSupabase) return { mode: "free" };
  if (config?.programados !== true) return { mode: "none" };

  const slots = scheduledSlots(config.horarios, config.anticipacionMin, now);
  return slots.length ? { mode: "slots", slots } : { mode: "none" };
}
