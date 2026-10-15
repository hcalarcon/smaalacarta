// Las preferencias del repartidor (ADMIN-REPARTIDOR-1 a 3): qué más puede hacer por el cliente en el camino.
// Reglas puras; la base valida lo mismo (`courier_save_preferences`).

export const NOTE_MAX = 140;

export type CourierPreferences = {
  shopsOnTheWay: boolean;
  seeksOrders: boolean;
  note: string;
};

export const EMPTY_PREFERENCES: CourierPreferences = { shopsOnTheWay: false, seeksOrders: false, note: "" };

export type PreferencesValidation =
  | { ok: true; value: CourierPreferences }
  | { ok: false; error: string };

// Lo que llega del navegador no es de fiar: casillas booleanas y un texto recortado de hasta 140 caracteres.
export function validatePreferences(input: unknown): PreferencesValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "Revisá los datos." };

  const raw = input as Record<string, unknown>;
  const note = typeof raw.note === "string" ? raw.note.trim() : "";

  if (note.length > NOTE_MAX) {
    return { ok: false, error: `El texto puede tener hasta ${NOTE_MAX} caracteres.` };
  }

  return {
    ok: true,
    value: { shopsOnTheWay: raw.shopsOnTheWay === true, seeksOrders: raw.seeksOrders === true, note },
  };
}

// Lo que lee `courier_preferences` (o nada, si todavía no guardó).
export function fromRow(
  row: { shops_on_the_way: boolean; seeks_orders: boolean; note: string | null } | null | undefined,
): CourierPreferences {
  if (!row) return EMPTY_PREFERENCES;

  return { shopsOnTheWay: row.shops_on_the_way, seeksOrders: row.seeks_orders, note: row.note ?? "" };
}
