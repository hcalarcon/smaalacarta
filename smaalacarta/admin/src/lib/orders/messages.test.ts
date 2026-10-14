import { describe, expect, it } from "vitest";

import { manualOrderErrorMessage, orderErrorMessage } from "./messages";

describe("orderErrorMessage", () => {
  it.each([
    ["P0004", /cambio de estado/i],
    ["P0002", /no existe/i],
    ["22023", /datos del pedido/i],
    ["42501", /permiso/i],
    ["P0016", /barrio/i],
    ["P0018", /teléfono/i],
    ["P0019", /ya lo tom/i],
    ["P0023", /otra manera/i],
    ["P0020", /no recibe ofertas/i],
    ["P0021", /motivo|por qué/i],
  ])("%s", (code, esperado) => {
    expect(orderErrorMessage({ code })).toMatch(esperado);
  });

  it("nunca muestra el texto técnico de la base", () => {
    const message = orderErrorMessage({ code: "XX000", message: "relation order_items exploded" });
    expect(message).not.toMatch(/exploded/);
    expect(message).toBe("No pudimos guardar el cambio. Probá de nuevo.");
  });
});

describe("manualOrderErrorMessage — ADMIN-PEDIDOS-46", () => {
  it.each([
    ["P0001", /ya no está disponible/i],
    ["P0007", /entrega/i],
    ["P0008", /medio de pago/i],
    ["P0009", /sin stock/i],
    ["P0014", /opciones/i],
    ["P0016", /barrio/i],
    ["P0018", /teléfono/i],
    ["42501", /permiso/i],
  ])("%s", (code, esperado) => {
    expect(manualOrderErrorMessage({ code })).toMatch(esperado);
  });

  it("un código desconocido da el mensaje genérico, sin el texto técnico", () => {
    expect(manualOrderErrorMessage({ code: "XX000", message: "boom" })).toBe(
      "No pudimos guardar el cambio. Probá de nuevo.",
    );
  });
});
