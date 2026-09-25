const DEFAULT_PATH = "/dashboard";

// `next` viaja en la URL, así que cualquiera puede armar un link con un destino
// ajeno. Solo se acepta una ruta interna del panel; lo demás vuelve al inicio.
export function safeNextPath(next: string | null | undefined) {
  if (!next) return DEFAULT_PATH;

  // Un salto de línea o una barra invertida permiten colar otro destino.
  if (/[\r\n\\]/.test(next)) return DEFAULT_PATH;

  const isAllowedPath = ["/dashboard", "/superadmin"].some(
    (prefix) =>
      next === prefix ||
      next.startsWith(`${prefix}/`) ||
      next.startsWith(`${prefix}?`),
  );

  return isAllowedPath ? next : DEFAULT_PATH;
}

// Destino después de abrir el link de un mail (confirmar cuenta o recuperar
// contraseña): además del panel, puede ser la pantalla de nueva contraseña.
export function callbackDestination(next: string | null | undefined) {
  return next === "/restablecer" ? next : safeNextPath(next);
}
