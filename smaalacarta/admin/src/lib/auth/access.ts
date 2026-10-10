const PANEL_PREFIX = "/dashboard";
const SUPERADMIN_PREFIX = "/superadmin";
const COURIER_PREFIX = "/repartidor";
const CHANGE_PASSWORD = "/cambiar-contrasena";
const GUEST_ONLY = ["/login"];

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
// Que alguien sea superadmin o repartidor no se decide acá (haría falta una consulta a la
// base): lo deciden `superAdminAccess` y `courierAccess` en la página.
export function redirectForRoute(
  pathname: string,
  hasUser: boolean,
  mustChangePassword = false,
) {
  const needsSession =
    isUnder(pathname, PANEL_PREFIX) ||
    isUnder(pathname, SUPERADMIN_PREFIX) ||
    isUnder(pathname, COURIER_PREFIX) ||
    pathname === CHANGE_PASSWORD;

  if (!hasUser && needsSession) {
    return `/login?next=${encodeURIComponent(pathname)}`;
  }

  // Con contraseña temporal solo se llega a /cambiar-contrasena: ahí se elige la propia.
  if (hasUser && mustChangePassword) {
    return pathname === CHANGE_PASSWORD ? null : CHANGE_PASSWORD;
  }

  if (hasUser && GUEST_ONLY.includes(pathname)) {
    return PANEL_PREFIX;
  }

  return null;
}

export type AccessState = "login" | "superadmin" | "repartidor" | "sin-negocio" | "ok";

// Un usuario sin negocio va a /superadmin si es superadmin, a /repartidor si es el usuario
// repartidor (ENVIO-30) y, si no, a /sin-negocio.
export function accessState(input: {
  user: { id: string } | null;
  business: { id: string } | null;
  isSuperAdmin?: boolean;
  isCourier?: boolean;
}): AccessState {
  if (!input.user) return "login";
  if (input.business) return "ok";
  if (input.isSuperAdmin) return "superadmin";
  return input.isCourier ? "repartidor" : "sin-negocio";
}

export type CourierAccess = "login" | "panel" | "ok";

// Quién puede ver /repartidor: sin sesión va a /login; cualquiera que no sea el usuario
// repartidor vuelve a su panel, sin enterarse de qué hay ahí.
export function courierAccess(input: {
  user: { id: string } | null;
  isCourier: boolean;
}): CourierAccess {
  if (!input.user) return "login";
  return input.isCourier ? "ok" : "panel";
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
