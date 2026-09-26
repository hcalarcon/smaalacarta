import { describe, expect, it } from "vitest";

import { orderErrorMessage } from "./messages";

describe("orderErrorMessage", () => {
  it.each([
    ["P0004", /cambio de estado/i],
    ["P0002", /no existe/i],
    ["22023", /datos del pedido/i],
    ["42501", /permiso/i],
  ])("%s", (code, esperado) => {
    expect(orderErrorMessage({ code })).toMatch(esperado);
  });

  it("nunca muestra el texto técnico de la base", () => {
    const message = orderErrorMessage({ code: "XX000", message: "relation order_items exploded" });
    expect(message).not.toMatch(/exploded/);
    expect(message).toBe("No pudimos guardar el cambio. Probá de nuevo.");
  });
});
