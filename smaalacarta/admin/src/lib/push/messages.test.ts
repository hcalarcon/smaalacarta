import { describe, expect, it } from "vitest";

import { ORDER } from "./fixtures";
import { buildMessage, formatPesos, isUrgent, pushPayload, ttlSeconds } from "./messages";

const ctx = { businessName: "Ana Resto", courierName: "Moto Express", assignedByLocal: false };

describe("textos de los avisos — ADMIN-PWA-18 a 24", () => {
  it("pedido nuevo para ofertar lleva local, barrio y precio de lista", () => {
    expect(buildMessage("offer_new", ORDER, ctx)).toEqual({
      title: "Pedido nuevo para ofertar",
      body: "Ana Resto · Cantera · $5.000",
      url: "/admin/repartidor",
      tag: `order-${ORDER.id}-offer_new`,
      kind: "offer_new",
      urgent: false,
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

describe("aviso fuerte de pedido nuevo — ADMIN-PWA-33 y 37", () => {
  const NOW = new Date("2026-10-12T15:06:30.000Z");

  it("el recordatorio dice cuánto hace que espera y lleva número y total", () => {
    const message = buildMessage("local_new_order_reminder", { ...ORDER, new_order_reminders: 2 }, { ...ctx, now: NOW });

    expect(message).toMatchObject({
      title: "Pedido #0042 sin atender hace 6 min",
      url: "/admin/dashboard/orders",
      kind: "local_new_order_reminder",
      urgent: true,
      number: "0042",
      total: "$12.500",
    });
  });

  it("nunca dice 0 min ni resta si el reloj está atrasado", () => {
    const early = buildMessage("local_new_order_reminder", ORDER, { ...ctx, now: new Date("2026-10-12T15:00:10.000Z") });
    expect(early.title).toBe("Pedido #0042 sin atender hace 1 min");

    const behind = buildMessage("local_new_order_reminder", ORDER, { ...ctx, now: new Date("2026-10-12T14:00:00.000Z") });
    expect(behind.title).toBe("Pedido #0042 sin atender hace 1 min");
  });

  it("el recordatorio reemplaza al aviso del pedido: mismo tag por pedido", () => {
    const nuevo = buildMessage("local_new_order", ORDER, ctx);
    const recordatorio = buildMessage("local_new_order_reminder", ORDER, { ...ctx, now: NOW });

    expect(recordatorio.tag).toBe(nuevo.tag);
    expect(nuevo).toMatchObject({ urgent: true, kind: "local_new_order", number: "0042", total: "$12.500" });
  });

  it("solo el pedido nuevo y el recordatorio son urgentes; el resto no cambia", () => {
    expect(isUrgent("local_new_order")).toBe(true);
    expect(isUrgent("local_new_order_reminder")).toBe(true);

    for (const kind of ["offer_new", "courier_chosen", "courier_not_chosen", "order_cancelled", "local_courier_chosen", "local_no_offers"] as const) {
      expect(isUrgent(kind)).toBe(false);
      expect(buildMessage(kind, ORDER, ctx)).not.toHaveProperty("number");
    }
  });

  it("el payload lleva urgent y kind, y el TTL es de 60 s solo para los urgentes", () => {
    const urgent = buildMessage("local_new_order", ORDER, ctx);
    const common = buildMessage("offer_new", ORDER, ctx);

    expect(JSON.parse(pushPayload(urgent))).toEqual({
      title: "Pedido nuevo #0042",
      body: "Lucía · Envío a domicilio",
      tag: urgent.tag,
      url: "/admin/dashboard/orders",
      kind: "local_new_order",
      urgent: true,
      number: "0042",
      total: "$12.500",
    });
    expect(JSON.parse(pushPayload(common))).toMatchObject({ kind: "offer_new", urgent: false });
    expect(JSON.parse(pushPayload(common))).not.toHaveProperty("number");

    expect(ttlSeconds(urgent)).toBe(60);
    expect(ttlSeconds(common)).toBe(600);
  });
});
