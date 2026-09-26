import type { ValidationResult } from "@/lib/auth/validation";

export const PROMOTION_TYPES = ["percent", "combo"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

type Field = "name" | "type" | "discountPercent" | "price" | "products";

export function validatePromotion(input: {
  name: string;
  type: string;
  discountPercent: number;
  price: number | null;
  productIds: string[];
}): ValidationResult<Field> {
  const errors: Partial<Record<Field, string>> = {};

  if (input.name.trim().length < 2) {
    errors.name = "Ingresá un nombre para la promoción.";
  }

  if (!(PROMOTION_TYPES as readonly string[]).includes(input.type)) {
    errors.type = "Elegí el tipo de promoción.";
  }

  // Cada tipo mira solo su propio dato: un combo ignora el porcentaje, y un
  // descuento ignora el precio.
  if (input.type === "percent") {
    const d = input.discountPercent;
    if (!Number.isFinite(d) || d < 1 || d > 100) {
      errors.discountPercent = "El descuento tiene que ser de 1 a 100 %.";
    }
  }

  if (input.type === "combo") {
    const p = input.price;
    if (p == null || !Number.isFinite(p) || p <= 0) {
      errors.price = "Ingresá el precio del combo, mayor a 0.";
    }
  }

  if (input.productIds.length === 0) {
    errors.products = "Agregá al menos un producto.";
  } else if (new Set(input.productIds).size !== input.productIds.length) {
    errors.products = "Un producto no puede estar dos veces en la promoción.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Deja la promoción lista para guardar: cada tipo conserva solo su propio dato
// (un descuento no lleva precio y un combo no lleva porcentaje), que es lo que
// exige la base.
export function normalizePromotion(input: {
  name: string;
  description: string;
  type: PromotionType;
  discountPercent: number;
  price: number | null;
  productIds: string[];
  active: boolean;
}) {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    type: input.type,
    discountPercent: input.type === "percent" ? input.discountPercent : 0,
    price: input.type === "combo" ? input.price : null,
    productIds: input.productIds,
    active: input.active,
  };
}
