import type { DbError } from "@/lib/superadmin/messages";

const GENERIC = "No pudimos guardar la promoción. Probá de nuevo.";

// Errores de Postgres (por SQLSTATE) al guardar una promoción, en español. Nunca
// se muestra el texto original.
export function promotionErrorMessage(error: DbError) {
  switch (error.code) {
    case "23503":
      return "Alguno de los productos ya no existe o no es de tu negocio.";
    case "23514":
      return "Revisá el descuento (1 a 100 %) o el precio del combo (mayor a 0).";
    case "22023":
      return "Agregá al menos un producto a la promoción.";
    case "P0002":
      return "La promoción ya no existe.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}
