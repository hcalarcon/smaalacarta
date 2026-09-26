import type { DbError } from "@/lib/superadmin/messages";

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";

// Errores de Postgres (por SQLSTATE) al cambiar o crear pedidos, en español.
export function orderErrorMessage(error: DbError) {
  switch (error.code) {
    case "P0004":
      return "Ese cambio de estado no está permitido.";
    case "P0002":
      return "El pedido no existe.";
    case "22023":
      return "Revisá los datos del pedido.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}
