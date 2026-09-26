import { describe, expect, it } from "vitest";

import { promotionErrorMessage } from "./messages";

describe("promotionErrorMessage", () => {
  it.each([
    ["23503", /producto/i],
    ["23514", /descuento|precio/i],
    ["22023", /al menos un producto/i],
    ["P0002", /ya no existe/i],
    ["42501", /permiso/i],
  ])("%s", (code, esperado) => {
    expect(promotionErrorMessage({ code })).toMatch(esperado);
  });

  it("nunca muestra el texto técnico de la base", () => {
    const message = promotionErrorMessage({
      code: "XX000",
      message: "relation promotion_items exploded",
    });
    expect(message).not.toMatch(/exploded/);
    expect(message).toBe("No pudimos guardar la promoción. Probá de nuevo.");
  });
});
