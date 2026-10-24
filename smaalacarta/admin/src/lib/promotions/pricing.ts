import type { PromotionType } from "./validation";

// Redondea a centavos: 15 % de 999,99 no puede dar 849,9915.
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Precio de una promoción (ADMIN-PROMOS-4): cuánto suman sus productos (precio × cantidad),
// cuánto cuesta con la oferta y cuánto se ahorra. El ahorro nunca es negativo: un combo
// más caro que la suma no "ahorra" nada. Los extras de las opciones no entran: los elige el
// cliente y se cobran enteros, sin descuento.
export function promotionPricing(
  promotion: {
    type: PromotionType;
    discountPercent: number;
    price: number | null;
  },
  products: { price: number; quantity: number }[],
) {
  const original = round2(products.reduce((sum, product) => sum + product.price * product.quantity, 0));

  const final =
    promotion.type === "combo"
      ? round2(promotion.price ?? 0)
      : round2(original * (1 - promotion.discountPercent / 100));

  return {
    original,
    final,
    saving: round2(Math.max(0, original - final)),
  };
}

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export function formatMoney(amount: number) {
  return money.format(amount);
}
