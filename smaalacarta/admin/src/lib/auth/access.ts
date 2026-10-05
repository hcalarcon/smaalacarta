const PANEL_PREFIX = "/dashboard";
const SUPERADMIN_PREFIX = "/superadmin";
const CHANGE_PASSWORD = "/cambiar-contrasena";
const RESET_PASSWORD = "/restablecer";
const GUEST_ONLY = ["/login", "/recuperar"];

// Con una sesión de recuperación (el link de un mail, ADMIN-AUTH-15) solo se llega a estas rutas:
// la pantalla de contraseña nueva y el canje del link. El cierre de sesión se manda desde
// /restablecer, así que también queda accesible.
const ALLOWED_IN_RECOVERY = [RESET_PASSWORD, "/auth/callback"];

// Con contraseña temporal solo se llega a estas rutas: ahí se elige la propia
// (o se entra desde el link de un mail de recuperación).
const ALLOWED_WITH_TEMP_PASSWORD = [CHANGE_PASSWORD, RESET_PASSWORD, "/auth/callback"];

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// ¿La cuenta tiene una contraseña temporal que hay que cambiar? La marca la
// pone el superadmin en `app_metadata`, que el usuario no puede editar.
export function hasTemporaryPassword(
  appMetadata: Record<string, unknown> | null | undefined,
) {
  return appMetadata?.must_change_password === true;
}

// A dónde redirigir según haya o no sesión, o null si la ruta se sirve tal cual.
// /restablecer y /auth/callback quedan afuera a propósito: se llega a ellas desde
// el link de un mail, y el intercambio de código crea la sesión ahí mismo. Que
// alguien sea superadmin no se decide acá (haría falta una consulta a la base): lo
// decide `superAdminAccess` en la página.
export function redirectForRoute(
  pathname: string,
  hasUser: boolean,
  mustChangePassword = false,
  inRecovery = false,
) {
  const needsSession =
    isUnder(pathname, PANEL_PREFIX) ||
    isUnder(pathname, SUPERADMIN_PREFIX) ||
    pathname === CHANGE_PASSWORD;

  if (!hasUser && needsSession) {
    return `/login?next=${encodeURIComponent(pathname)}`;
  }

  // Quien abrió un link de recuperación no sale de /restablecer hasta guardar su contraseña nueva:
  // si no, con "atrás" o escribiendo /dashboard quedaría con sesión sin haberla cambiado. Gana
  // sobre la contraseña temporal (acá también se elige una propia).
  if (hasUser && inRecovery) {
    return ALLOWED_IN_RECOVERY.includes(pathname) ? null : RESET_PASSWORD;
  }

  if (hasUser && mustChangePassword) {
    return ALLOWED_WITH_TEMP_PASSWORD.includes(pathname) ? null : CHANGE_PASSWORD;
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
