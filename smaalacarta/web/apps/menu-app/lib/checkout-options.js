// Qué entrega y qué medios de pago ofrece el negocio en el checkout (PUBLICO-19) y qué
// datos de transferencia mostrar al terminar el pedido (PUBLICO-20). Lógica pura: `app.js`
// solo arma los selects y pinta.

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

export function checkoutOptions(config) {
  return {
    delivery: group(DELIVERY, config?.entrega),
    payment: group(PAYMENT, config?.pagos),
  };
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
