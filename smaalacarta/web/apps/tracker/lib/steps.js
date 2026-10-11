// La línea de pasos del seguimiento (SEGUIMIENTO-25 y 26). Solo lógica: el dibujo está en `icons.js`
// y `tracker.js`. Usa los estados reales del pedido (`admin/src/lib/orders/status.ts`).

import { t } from "../../menu-app/lib/i18n.js";

// Cómo se entrega el pedido, para elegir el camino y las palabras:
// - `courier`: con envío por un repartidor (recibido, aceptado, listo, en camino, entregado).
// - `pickup`: para retirar (recibido, aceptado, listo para retirar, retirado).
// - `local`: el local lo lleva él (sin repartidor): recibido, aceptado, listo, entregado.
export function deliveryMode(pedido, envio) {
  if (pedido?.entrega === "retiro") return "pickup";
  if (envio && envio.state !== "self") return "courier";
  // Un estado del repartidor solo existe con envío: si llega, el camino es el del envío.
  if (pedido?.estado === "handed_to_courier" || pedido?.estado === "on_the_way") return "courier";
  return "local";
}

const PATHS = {
  courier: ["received", "accepted", "ready", "onTheWay", "delivered"],
  pickup: ["received", "accepted", "readyPickup", "pickedUp"],
  local: ["received", "accepted", "ready", "delivered"],
};

// En qué paso del camino está cada estado del pedido.
const STEP_OF_STATUS = {
  pending: "received",
  confirmed: "accepted",
  preparing: "accepted",
  ready: { courier: "ready", pickup: "readyPickup", local: "ready" },
  handed_to_courier: "onTheWay",
  on_the_way: "onTheWay",
  delivered: { courier: "delivered", pickup: "pickedUp", local: "delivered" },
};

// Los pasos del camino y el estado de cada uno: `done` (con tilde), `current` (animado) o `todo`
// (apagado). Un pedido cancelado no tiene camino (`cancelled: true`); un estado que no se conoce deja
// todos los pasos apagados, sin romper.
export function progressSteps(status, mode, lang) {
  const path = PATHS[mode] ?? PATHS.local;

  if (status === "cancelled") return { cancelled: true, steps: [] };

  const entry = STEP_OF_STATUS[status];
  const key = typeof entry === "object" ? entry[mode] : entry;
  const at = path.indexOf(key);

  // Con el pedido entregado, todo el camino está hecho (el último paso incluido).
  const finished = status === "delivered";

  return {
    cancelled: false,
    steps: path.map((step, index) => ({
      key: step,
      label: t(`tracker.steps.${step}`, lang),
      state: at < 0 ? "todo" : finished || index < at ? "done" : index === at ? "current" : "todo",
    })),
  };
}

// El motivo de la cancelación, si el local lo dejó: la nota del último evento `cancelled`.
export function cancelReason(eventos) {
  if (!Array.isArray(eventos)) return null;

  for (let index = eventos.length - 1; index >= 0; index--) {
    const event = eventos[index];
    if (event && event.estado === "cancelled") {
      return typeof event.nota === "string" && event.nota.trim() !== "" ? event.nota.trim() : null;
    }
  }

  return null;
}
