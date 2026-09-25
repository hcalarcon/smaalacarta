const PANEL_PREFIX = "/dashboard";
const SUPERADMIN_PREFIX = "/superadmin";
const GUEST_ONLY = ["/login", "/recuperar"];

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// A dónde redirigir según haya o no sesión, o null si la ruta se sirve tal cual.
// /restablecer, /auth/callback y /auth/confirm quedan afuera a propósito: se llega
// a ellas desde el link de un mail, y el intercambio de código crea la sesión ahí
// mismo. Que alguien sea superadmin no se decide acá (haría falta una consulta a
// la base): lo decide `superAdminAccess` en la página.
export function redirectForRoute(pathname: string, hasUser: boolean) {
  const needsSession =
    isUnder(pathname, PANEL_PREFIX) || isUnder(pathname, SUPERADMIN_PREFIX);

  if (!hasUser && needsSession) {
    return `/login?next=${encodeURIComponent(pathname)}`;
  }

  if (hasUser && GUEST_ONLY.includes(pathname)) {
    return PANEL_PREFIX;
  }

  return null;
}

export type AccessState = "login" | "superadmin" | "sin-negocio" | "ok";

export function accessState(input: {
  user: { id: string } | null;
  business: { id: string } | null;
  isSuperAdmin?: boolean;
}): AccessState {
  if (!input.user) return "login";
  if (input.business) return "ok";
  return input.isSuperAdmin ? "superadmin" : "sin-negocio";
}

export type SuperAdminAccess = "login" | "panel" | "ok";

// Quién puede ver /superadmin: sin sesión va a /login; un usuario común, a su
// panel, sin enterarse de qué hay ahí.
export function superAdminAccess(input: {
  user: { id: string } | null;
  isSuperAdmin: boolean;
}): SuperAdminAccess {
  if (!input.user) return "login";
  return input.isSuperAdmin ? "ok" : "panel";
}
