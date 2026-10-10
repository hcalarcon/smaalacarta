import type { DbError } from "@/lib/superadmin/messages";

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";

// Errores de Postgres (por SQLSTATE) al cambiar o crear pedidos, en español.
export function orderErrorMessage(error: DbError) {
  switch (error.code) {
    case "P0004":
      return "Ese cambio de estado no está permitido.";
    case "P0015":
      return "El envío todavía no fue aceptado por el repartidor.";
    case "P0016":
      return "El barrio del envío no está disponible.";
    case "P0002":
      return "El pedido no existe.";
    case "P0010":
      return "Tu cuenta está suspendida: no se pueden hacer cambios.";
    case "22023":
      return "Revisá los datos del pedido.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}

// Errores de las rendiciones del efectivo (ENVIO-39), en español.
export function settlementErrorMessage(error: DbError) {
  switch (error.code) {
    case "P0004":
      return "Esa rendición ya está marcada o todavía no se puede marcar.";
    case "P0002":
      return "El pedido no existe.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}
