const PANEL_PREFIX = "/dashboard";
const GUEST_ONLY = ["/login", "/recuperar"];

function isPanel(pathname: string) {
  return pathname === PANEL_PREFIX || pathname.startsWith(`${PANEL_PREFIX}/`);
}

// A dónde redirigir según haya o no sesión, o null si la ruta se sirve tal cual.
// /restablecer y /auth/callback quedan afuera a propósito: se llega a ellas
// desde el link de un mail, y el intercambio de código crea la sesión ahí mismo.
export function redirectForRoute(pathname: string, hasUser: boolean) {
  if (!hasUser && isPanel(pathname)) {
    return `/login?next=${encodeURIComponent(pathname)}`;
  }

  if (hasUser && GUEST_ONLY.includes(pathname)) {
    return PANEL_PREFIX;
  }

  return null;
}

export type AccessState = "login" | "sin-negocio" | "ok";

export function accessState(input: {
  user: { id: string } | null;
  business: { id: string } | null;
}): AccessState {
  if (!input.user) return "login";
  if (!input.business) return "sin-negocio";
  return "ok";
}
