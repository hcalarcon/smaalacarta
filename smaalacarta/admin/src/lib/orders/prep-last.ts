// El último tiempo que usó el local al aceptar o cargar la demora (ADMIN-PEDIDOS-52): arranca preseleccionado
// en el selector. Es una comodidad del navegador, no un dato del negocio: si el almacenamiento no está
// disponible, el selector usa la sugerencia o el tiempo por defecto.
import { validatePrepMinutes } from "@/lib/orders/prep";

const key = (slug: string) => `sma:prep-last:${slug}`;

export function readLastPrep(slug: string): number | null {
  try {
    const raw = window.localStorage.getItem(key(slug));
    const check = validatePrepMinutes(raw === null ? null : Number(raw));
    return check.ok ? check.minutes : null;
  } catch {
    return null;
  }
}

export function saveLastPrep(slug: string, minutes: number): void {
  if (!validatePrepMinutes(minutes).ok) return;

  try {
    window.localStorage.setItem(key(slug), String(minutes));
  } catch {
    // Sin almacenamiento no pasa nada.
  }
}
