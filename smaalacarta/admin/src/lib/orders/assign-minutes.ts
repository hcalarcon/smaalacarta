// El tiempo para asignar a mano (ENVIO-241): cuántos minutos sin ofertas pasan antes de destacar el pedido y avisar
// al local. Lo fija el superadmin para toda la plataforma; la base lo vuelve a exigir (CHECK de 1 a 30).
export const ASSIGN_MINUTES_MIN = 1;
export const ASSIGN_MINUTES_MAX = 30;
export const ASSIGN_MINUTES_DEFAULT = 5;

// Los minutos como número entero dentro del rango, o null si lo escrito no sirve.
export function parseAssignMinutes(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,2}$/.test(text)) return null;

  const minutes = Number(text);
  return minutes >= ASSIGN_MINUTES_MIN && minutes <= ASSIGN_MINUTES_MAX ? minutes : null;
}
