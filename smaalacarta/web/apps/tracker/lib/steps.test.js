import { describe, expect, it } from "vitest";

import { cancelReason, deliveryMode, progressSteps } from "./steps.js";

const labels = (result) => result.steps.map((s) => s.label);
const states = (result) => result.steps.map((s) => s.state);

describe("deliveryMode — SEGUIMIENTO-25", () => {
  it("para retirar, con envío con repartidor o lo lleva el local", () => {
    expect(deliveryMode({ entrega: "retiro", estado: "pending" }, null)).toBe("pickup");
    expect(deliveryMode({ entrega: "delivery", estado: "pending" }, { state: "searching" })).toBe("courier");
    expect(deliveryMode({ entrega: "delivery", estado: "ready" }, { state: "self" })).toBe("local");
    expect(deliveryMode({ entrega: "delivery", estado: "ready" }, null)).toBe("local");
    // Consumo en el local (pedido manual, SEGUIMIENTO-43): sin envío, recibido, aceptado, listo y entregado.
    expect(deliveryMode({ entrega: "local", estado: "confirmed" }, null)).toBe("local");
  });

  it("un estado del repartidor implica el camino del envío aunque no llegue el envío", () => {
    expect(deliveryMode({ estado: "on_the_way" }, null)).toBe("courier");
    expect(deliveryMode({ estado: "handed_to_courier" }, null)).toBe("courier");
  });
});

describe("progressSteps — SEGUIMIENTO-25 y 26", () => {
  it("con envío: Recibido, Aceptado, Listo, En camino, Entregado", () => {
    expect(labels(progressSteps("pending", "courier", "es"))).toEqual([
      "Recibido",
      "Aceptado",
      "Listo",
      "En camino",
      "Entregado",
    ]);
  });

  it("para retirar: Recibido, Aceptado, Listo para retirar, Retirado", () => {
    expect(labels(progressSteps("pending", "pickup", "es"))).toEqual([
      "Recibido",
      "Aceptado",
      "Listo para retirar",
      "Retirado",
    ]);
  });

  it.each([
    ["pending", ["current", "todo", "todo", "todo", "todo"]],
    ["confirmed", ["done", "current", "todo", "todo", "todo"]],
    ["preparing", ["done", "current", "todo", "todo", "todo"]],
    ["ready", ["done", "done", "current", "todo", "todo"]],
    ["handed_to_courier", ["done", "done", "done", "current", "todo"]],
    ["on_the_way", ["done", "done", "done", "current", "todo"]],
    ["delivered", ["done", "done", "done", "done", "done"]],
  ])("con envío, %s → hechos con tilde, el actual animado, los que faltan apagados", (status, expected) => {
    expect(states(progressSteps(status, "courier", "es"))).toEqual(expected);
  });

  it("para retirar, Listo es 'Listo para retirar' y Entregado cierra en 'Retirado'", () => {
    expect(states(progressSteps("ready", "pickup", "es"))).toEqual(["done", "done", "current", "todo"]);
    expect(states(progressSteps("delivered", "pickup", "es"))).toEqual(["done", "done", "done", "done"]);
  });

  it("un pedido cancelado no tiene camino", () => {
    expect(progressSteps("cancelled", "courier", "es")).toEqual({ cancelled: true, steps: [] });
  });

  it("un estado que no se conoce deja todo apagado sin romper", () => {
    expect(states(progressSteps("volando", "courier", "es"))).toEqual(["todo", "todo", "todo", "todo", "todo"]);
  });

  it("se traduce", () => {
    expect(labels(progressSteps("pending", "pickup", "en", ))).toEqual([
      "Received",
      "Accepted",
      "Ready for pickup",
      "Picked up",
    ]);
    expect(labels(progressSteps("pending", "courier", "pt"))[3]).toBe("A caminho");
  });
});

describe("cancelReason — SEGUIMIENTO-25", () => {
  it("es la nota del último evento cancelado", () => {
    const eventos = [
      { estado: "pending" },
      { estado: "cancelled", nota: " Sin stock de helado " },
    ];
    expect(cancelReason(eventos)).toBe("Sin stock de helado");
  });

  it("sin nota, sin evento o con datos raros no hay motivo", () => {
    expect(cancelReason([{ estado: "cancelled" }])).toBeNull();
    expect(cancelReason([{ estado: "cancelled", nota: "  " }])).toBeNull();
    expect(cancelReason([{ estado: "pending", nota: "x" }])).toBeNull();
    expect(cancelReason(null)).toBeNull();
    expect(cancelReason([null, 3])).toBeNull();
  });
});
