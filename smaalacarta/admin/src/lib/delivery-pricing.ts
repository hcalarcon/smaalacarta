// Tipo de precio del envío por negocio (ENVIO-219). Los mismos tres valores que `businesses.delivery_pricing`.

export const DELIVERY_PRICING = ["common", "business", "courier"] as const;
export type DeliveryPricing = (typeof DELIVERY_PRICING)[number];

export const DELIVERY_PRICING_LABELS: Record<DeliveryPricing, string> = {
  common: "Común",
  business: "Del negocio",
  courier: "Del repartidor",
};

export const DELIVERY_PRICING_HELP: Record<DeliveryPricing, string> = {
  common: "Las zonas comunes con su precio de referencia.",
  business: "Las mismas zonas comunes, con el precio que carga el negocio.",
  courier: "Las zonas y los precios propios del repartidor favorito del negocio.",
};

export function parseDeliveryPricing(value: unknown): DeliveryPricing | null {
  return DELIVERY_PRICING.includes(value as DeliveryPricing) ? (value as DeliveryPricing) : null;
}
