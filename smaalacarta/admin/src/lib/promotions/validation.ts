import type { ValidationResult } from "@/lib/auth/validation";

export const PROMOTION_TYPES = ["percent", "combo"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

type Field = "name" | "type" | "discountPercent" | "price" | "products" | "image" | "validUntil" | "stock";

export function validatePromotion(input: {
  name: string;
  type: string;
  discountPercent: number;
  price: number | null;
  productIds: string[];
  // Imagen y vigencia (ADMIN-PROMO-2, 5 y 7). Todo opcional: una promoción sin ellos no cambia.
  imageUrl?: string | null;
  imageProductId?: string | null;
  // Instante ISO en que termina; solo tiene que ser futuro si es nuevo (guardar otra cosa de una vencida no
  // la toca): `initialValidUntil` es el que ya estaba guardado.
  validUntil?: string | null;
  initialValidUntil?: string | null;
  stock?: number | null;
  now?: Date;
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

  // Imagen propia o la de un producto de la promoción, no las dos.
  const imageUrl = (input.imageUrl ?? "").trim();
  const imageProductId = input.imageProductId ?? null;

  if (imageUrl && imageProductId) {
    errors.image = "Elegí una imagen propia o la foto de un producto, no las dos.";
  } else if (imageProductId && !input.productIds.includes(imageProductId)) {
    errors.image = "La foto tiene que ser de un producto de la promoción.";
  }

  if (input.validUntil != null) {
    const at = new Date(input.validUntil).getTime();
    const unchanged = input.initialValidUntil != null && input.initialValidUntil === input.validUntil;

    if (!Number.isFinite(at)) {
      errors.validUntil = "Ingresá una fecha válida.";
    } else if (!unchanged && at <= (input.now ?? new Date()).getTime()) {
      errors.validUntil = "La fecha de fin tiene que ser futura.";
    }
  }

  if (input.stock != null) {
    if (!Number.isInteger(input.stock) || input.stock < 1) {
      errors.stock = "Las unidades disponibles tienen que ser un número entero de 1 en adelante.";
    }
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
  imageUrl?: string | null;
  imageProductId?: string | null;
  validUntil?: string | null;
  stock?: number | null;
}) {
  const imageUrl = (input.imageUrl ?? "").trim();

  return {
    name: input.name.trim(),
    description: input.description.trim(),
    type: input.type,
    discountPercent: input.type === "percent" ? input.discountPercent : 0,
    price: input.type === "combo" ? input.price : null,
    productIds: input.productIds,
    active: input.active,
    // La imagen propia y la de un producto son excluyentes: la propia, si hay, es la que queda.
    imageUrl: imageUrl || null,
    imageProductId: imageUrl ? null : (input.imageProductId ?? null),
    validUntil: input.validUntil ?? null,
    stock: input.stock ?? null,
  };
}
