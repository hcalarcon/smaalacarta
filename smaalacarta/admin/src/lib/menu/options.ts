import type { ValidationResult } from "@/lib/auth/validation";
import type { DbError } from "@/lib/superadmin/messages";

// Los mismos límites están en la base (triggers de `options` y `product_option_groups`).
export const MAX_OPTIONS_PER_GROUP = 30;
export const MAX_GROUPS_PER_PRODUCT = 6;

export type OptionInput = {
  id?: string | null;
  name: string;
  priceDelta: number;
  active: boolean;
  soldOut: boolean;
};

export type OptionGroupInput = {
  name: string;
  minSelect: number;
  maxSelect: number;
  allowRepeat: boolean;
  active: boolean;
  options: OptionInput[];
};

type Field = "name" | "minSelect" | "maxSelect" | "options";

const isCount = (n: number) => Number.isInteger(n);

// ADMIN-OPCIONES-1 a 5.
export function validateOptionGroup(input: OptionGroupInput): ValidationResult<Field> {
  const errors: Partial<Record<Field, string>> = {};

  if (input.name.trim().length < 2) {
    errors.name = "Ingresá un nombre para el grupo.";
  }

  if (!isCount(input.minSelect) || input.minSelect < 0) {
    errors.minSelect = "El mínimo es 0 (opcional) o un número entero mayor.";
  }

  if (!isCount(input.maxSelect) || input.maxSelect < 1) {
    errors.maxSelect = "El máximo tiene que ser 1 o más.";
  } else if (isCount(input.minSelect) && input.maxSelect < input.minSelect) {
    errors.maxSelect = "El máximo no puede ser menor que el mínimo.";
  }

  const count = input.options.length;

  if (count === 0) {
    errors.options = "Agregá al menos una opción.";
  } else if (count > MAX_OPTIONS_PER_GROUP) {
    errors.options = `Un grupo puede tener hasta ${MAX_OPTIONS_PER_GROUP} opciones.`;
  } else if (input.options.some((o) => o.name.trim() === "")) {
    errors.options = "Cada opción necesita un nombre.";
  } else if (input.options.some((o) => !Number.isFinite(o.priceDelta) || o.priceDelta < 0)) {
    errors.options = "El precio extra de una opción no puede ser negativo.";
  }

  // Sin repetir, no se puede elegir más opciones de las que hay: un mínimo mayor no se cumple nunca.
  if (
    !errors.minSelect &&
    !errors.options &&
    !input.allowRepeat &&
    input.minSelect > count
  ) {
    errors.minSelect =
      "El mínimo no puede ser mayor que la cantidad de opciones (o permití repetir).";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// ADMIN-OPCIONES-6.
export function validateProductGroupIds(ids: string[]): ValidationResult<"groups"> {
  if (ids.length > MAX_GROUPS_PER_PRODUCT) {
    return {
      ok: false,
      errors: { groups: `Un producto puede tener hasta ${MAX_GROUPS_PER_PRODUCT} grupos.` },
    };
  }

  if (new Set(ids).size !== ids.length) {
    return { ok: false, errors: { groups: "Un grupo no puede estar dos veces." } };
  }

  return { ok: true };
}

// Un producto con algún grupo obligatorio no puede estar en promociones (ADMIN-OPCIONES-10).
export function hasRequiredGroup(groups: { min_select: number }[]) {
  return groups.some((g) => g.min_select >= 1);
}

// La regla de un grupo, en una línea para la lista del panel (ADMIN-OPCIONES-12).
export function describeGroupRule(group: {
  min_select: number;
  max_select: number;
  allow_repeat: boolean;
}) {
  const { min_select: min, max_select: max } = group;

  if (min === 0) return `Opcional, hasta ${max}`;

  const amount = min === max ? `${min}` : `de ${min} a ${max}`;
  return `Obligatorio: elegí ${amount}${group.allow_repeat ? " (se pueden repetir)" : ""}`;
}

// Errores de Postgres (por SQLSTATE) al guardar grupos, opciones y asociaciones, en español.
export function optionGroupErrorMessage(error: DbError) {
  switch (error.code) {
    case "P0014":
      return "Un producto con opciones obligatorias no puede estar en una promoción. Sacalo de la promoción primero.";
    case "P0015":
      return `Superaste el máximo: ${MAX_OPTIONS_PER_GROUP} opciones por grupo y ${MAX_GROUPS_PER_PRODUCT} grupos por producto.`;
    case "23514":
    case "22023":
      return "Revisá el grupo: nombre, mínimo y máximo, y que cada opción tenga nombre y un precio de 0 o más.";
    case "23503":
      return "El grupo o el producto ya no existe o no es de tu negocio.";
    case "P0002":
      return "El grupo ya no existe.";
    case "P0010":
      return "Tu cuenta está suspendida: no se pueden hacer cambios.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return "No pudimos guardar el grupo. Probá de nuevo.";
  }
}
