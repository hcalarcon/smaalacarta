import type { DbError } from "@/lib/superadmin/messages";

const GENERIC = "No pudimos guardar la configuración. Probá de nuevo.";

// Errores de Postgres (por SQLSTATE) al guardar la configuración, en español.
export function settingsErrorMessage(error: DbError) {
  switch (error.code) {
    case "23514":
      return "Alguno de los datos no tiene un formato válido. Revisá colores, imagen y horarios.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}
