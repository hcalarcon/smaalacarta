// Barrios y precios del repartidor (ENVIO-36 y 37). Las mismas reglas están en la base
// (`courier_zones`: nombre de 1 a 60, precio ≥ 0, único por repartidor).

export const ZONE_NAME_MAX = 60;
const PRICE_LIMIT = 100_000_000;

// El precio puede venir como "4500", "4.500", "$ 4.500" o "4500,50" (argentino). Devuelve el número
// o null si no es un precio válido (vacío, negativo, con más de 2 decimales o demasiado grande).
export function parsePrice(value: string | number): number | null {
  const text = String(value).replace(/[$\s.]/g, "").replace(",", ".");

  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const price = Number(text);
  return price < PRICE_LIMIT ? price : null;
}

export type ZoneInput = { name: string; price: string | number };

export type ZoneValidation =
  | { ok: true; name: string; price: number }
  | { ok: false; errors: Partial<Record<"name" | "price", string>> };

const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");

// `existing` son los barrios del repartidor; `editingId`, el que se está editando (puede conservar
// su propio nombre).
export function validateZone(
  input: ZoneInput,
  existing: { id: string; name: string }[],
  editingId?: string,
): ZoneValidation {
  const errors: Partial<Record<"name" | "price", string>> = {};

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "") {
    errors.name = "El nombre del barrio es obligatorio.";
  } else if (name.length > ZONE_NAME_MAX) {
    errors.name = `El nombre admite hasta ${ZONE_NAME_MAX} caracteres.`;
  } else if (existing.some((zone) => zone.id !== editingId && normalize(zone.name) === normalize(name))) {
    errors.name = "Ya existe un barrio con ese nombre.";
  }

  const price = parsePrice(input.price);
  if (price === null) errors.price = "Escribí un precio válido, de 0 en adelante.";

  if (Object.keys(errors).length > 0 || price === null) return { ok: false, errors };

  return { ok: true, name, price };
}
