import { describe, expect, it } from "vitest";

import { compareByUrgency, orderUrgency, stepIndex } from "./urgency";

const now = new Date("2026-10-15T20:00:00Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

const base = {
  status: "confirmed",
  created_at: at(-20),
  scheduled_for: null,
  preorder: false,
  prep_ready_at: at(15),
  courier_status: null,
  offered_at: null,
  delivery_mode: null,
};

// ADMIN-PEDIDOS-53 y 54
describe("urgencia del pedido — ADMIN-PEDIDOS-54", () => {
  it("atrasado respecto de la demora: alta", () => {
    expect(orderUrgency({ ...base, prep_ready_at: at(-3) }, now)).toBe(2);
  });

  it("buscando repartidor sin ofertas pasados 10 minutos: alta", () => {
    const searching = { ...base, status: "ready", courier_status: "searching", offered_at: at(-12) };
    expect(orderUrgency(searching, now, 0)).toBe(2);
    expect(orderUrgency(searching, now, 1)).toBe(0);
  });

  it("le quedan 5 minutos o menos: media", () => {
    expect(orderUrgency({ ...base, prep_ready_at: at(4) }, now)).toBe(1);
  });

  it("pendiente sin atender hace 5 minutos o más: media", () => {
    expect(orderUrgency({ ...base, status: "pending", prep_ready_at: null, created_at: at(-6) }, now)).toBe(1);
    expect(orderUrgency({ ...base, status: "pending", prep_ready_at: null, created_at: at(-2) }, now)).toBe(0);
  });

  it("en orden: ninguna", () => {
    expect(orderUrgency(base, now)).toBe(0);
  });

  it("el pedido programado no cuenta la demora", () => {
    expect(orderUrgency({ ...base, scheduled_for: at(120), prep_ready_at: at(-30) }, now)).toBe(0);
  });
});

describe("orden por urgencia — ADMIN-PEDIDOS-54", () => {
  it("primero lo urgente y, a igual urgencia, el más viejo", () => {
    const old = { ...base, id: "old", created_at: at(-30) };
    const late = { ...base, id: "late", created_at: at(-10), prep_ready_at: at(-5) };
    const fresh = { ...base, id: "fresh", created_at: at(-5) };

    const sorted = [fresh, old, late].sort((a, b) => compareByUrgency(a, b, now));

    expect(sorted.map((o) => o.id)).toEqual(["late", "old", "fresh"]);
  });
});

describe("paso del circuito — ADMIN-PEDIDOS-53", () => {
  it.each([
    ["pending", 0],
    ["confirmed", 1],
    ["preparing", 2],
    ["ready", 3],
    ["handed_to_courier", 4],
    ["on_the_way", 4],
    ["delivered", 4],
    ["desconocido", -1],
  ])("%s → %i", (status, index) => {
    expect(stepIndex(status)).toBe(index);
  });
});
