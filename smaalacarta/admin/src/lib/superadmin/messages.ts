const GENERIC = "No pudimos completar la acción. Probá de nuevo.";

export type DbError = { code?: string; message?: string };

// Errores de Postgres (por SQLSTATE) traducidos al español. Nunca se muestra el
// texto original: es técnico y puede revelar nombres internos.
export function superAdminErrorMessage(error: DbError) {
  switch (error.code) {
    case "23505":
      return error.message?.includes("business_users")
        ? "Esa cuenta ya es miembro de este negocio."
        : "Ya hay un negocio con ese slug. Elegí otro.";
    case "23514":
      return "El slug solo puede tener minúsculas, números y guiones.";
    case "23503":
      return "No existe la cuenta indicada.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}
