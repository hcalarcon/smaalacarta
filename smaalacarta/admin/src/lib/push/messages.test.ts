import { describe, expect, it } from "vitest";

import { ORDER } from "./fixtures";
import { buildMessage, formatPesos } from "./messages";

const ctx = { businessName: "Ana Resto", courierName: "Moto Express", assignedByLocal: false };

describe("textos de los avisos — ADMIN-PWA-18 a 24", () => {
  it("pedido nuevo para ofertar lleva local, barrio y precio de lista", () => {
    expect(buildMessage("offer_new", ORDER, ctx)).toEqual({
      title: "Pedido nuevo para ofertar",
      body: "Ana Resto · Cantera · $5.000",
      url: "/admin/repartidor",
      tag: `order-${ORDER.id}-offer_new`,
    });
  });

  it("te eligieron, y te asignó el local", () => {
    expect(buildMessage("courier_chosen", ORDER, ctx)).toMatchObject({
      title: "¡Te eligieron!",
      body: "Ana Resto · #0042 · Cantera",
      url: "/admin/repartidor",
    });

    expect(buildMessage("courier_chosen", ORDER, { ...ctx, assignedByLocal: true })).toMatchObject({
      title: "¡Te eligieron!",
      body: "Ana Resto te asignó un envío",
    });
  });

  it("eligieron a otro y pedido cancelado", () => {
    expect(buildMessage("courier_not_chosen", ORDER, ctx)).toMatchObject({
      title: "Eligieron otro repartidor",
      body: "Ana Resto · Cantera",
    });
    expect(buildMessage("order_cancelled", ORDER, ctx)).toMatchObject({
      title: "Pedido cancelado",
      body: "Ana Resto · #0042",
    });
  });

  it("al local: pedido nuevo, lo lleva y nadie ofertó, todos hacia el tablero", () => {
    expect(buildMessage("local_new_order", ORDER, ctx)).toMatchObject({
      title: "Pedido nuevo #0042",
      body: "Lucía · Envío a domicilio",
      url: "/admin/dashboard/orders",
    });
    expect(buildMessage("local_new_order", { ...ORDER, delivery: "retiro" }, ctx).body).toBe("Lucía · Retiro en el local");

    expect(buildMessage("local_courier_chosen", { ...ORDER, delivery_fee: 6500 }, ctx)).toMatchObject({
      title: "#0042: lo lleva Moto Express",
      body: "$6.500",
      url: "/admin/dashboard/orders",
    });
    expect(buildMessage("local_no_offers", ORDER, ctx)).toMatchObject({
      title: "#0042: nadie ofertó todavía",
      body: "Asignalo a mano o llevalo vos",
    });
  });

  it("cada evento de un pedido lleva su propio tag para no repetirse (ADMIN-PWA-25)", () => {
    const tags = (["offer_new", "courier_chosen", "local_no_offers"] as const).map(
      (kind) => buildMessage(kind, ORDER, ctx).tag,
    );
    expect(new Set(tags).size).toBe(3);
  });

  it("formatea pesos con punto de miles y sin decimales vacíos", () => {
    expect(formatPesos(5000)).toBe("$5.000");
    expect(formatPesos(1234567)).toBe("$1.234.567");
    expect(formatPesos(5000.5)).toBe("$5.000,50");
    expect(formatPesos(null)).toBe("");
  });
});
