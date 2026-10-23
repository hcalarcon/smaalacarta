import { describe, expect, it } from "vitest";

import { DELIVERY_PRICING, parseDeliveryPricing } from "./delivery-pricing";

describe("tipo de precio del envío — ENVIO-219", () => {
  it("acepta los tres tipos", () => {
    for (const type of DELIVERY_PRICING) expect(parseDeliveryPricing(type)).toBe(type);
  });

  it("rechaza cualquier otro valor", () => {
    expect(parseDeliveryPricing("distancia")).toBeNull();
    expect(parseDeliveryPricing("")).toBeNull();
    expect(parseDeliveryPricing(null)).toBeNull();
  });
});
