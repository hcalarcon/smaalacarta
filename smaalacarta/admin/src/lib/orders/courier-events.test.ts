import { describe, expect, it } from "vitest";

import { detectCourierEvents, type CourierWatched } from "./courier-events";

const name = (id: string | null) => ({ c1: "Ana Moto", c2: "Beto" })[id ?? ""] ?? null;

const order = (over: Partial<CourierWatched> = {}): CourierWatched => ({
  id: "o1",
  order_number: "12",
  status: "confirmed",
  courier_id: null,
  courier_status: "searching",
  returned_reason_kind: null,
  returned_reason: null,
  delivery_events: [],
  ...over,
});

const taken = (over: Partial<CourierWatched> = {}) =>
  order({ courier_id: "c1", courier_status: "accepted", ...over });

const event = (note: string) => ({ kind: "delivery", status: "confirmed", created_at: "t", note });

describe("avisos del repartidor en Pedidos — ADMIN-PEDIDOS-61", () => {
  it("avisa cuando un repartidor toma el pedido", () => {
    expect(detectCourierEvents([order()], [taken()], name)).toEqual([
      { kind: "taken", orderId: "o1", orderNumber: "12", courierName: "Ana Moto", reason: null },
    ]);
  });

  it("avisa cuando lo devuelve, con el motivo", () => {
    const back = order({ returned_reason_kind: "vehicle" });
    expect(detectCourierEvents([taken()], [back], name)).toEqual([
      { kind: "returned", orderId: "o1", orderNumber: "12", courierName: "Ana Moto", reason: "Problema con el vehículo" },
    ]);
  });

  it("el motivo 'otro' lleva el texto del repartidor", () => {
    const back = order({ returned_reason_kind: "other", returned_reason: " Se me pinchó " });
    expect(detectCourierEvents([taken()], [back], name)[0].reason).toBe("Se me pinchó");
  });

  it("sin motivo cargado, no hay motivo", () => {
    expect(detectCourierEvents([taken()], [order()], name)[0].reason).toBeNull();
  });

  it("si el nombre no se conoce, queda nulo", () => {
    expect(detectCourierEvents([order()], [taken({ courier_id: "zz" })], name)[0].courierName).toBeNull();
  });

  it("no avisa cuando el local lo asigna a mano", () => {
    const assigned = taken({ delivery_events: [event("Envío asignado a Ana Moto, 21:05")] });
    expect(detectCourierEvents([order()], [assigned], name)).toEqual([]);
  });

  it("una asignación a mano anterior no tapa una toma posterior", () => {
    const old = event("Envío asignado a Beto, 20:00");
    const prev = order({ delivery_events: [old] });
    const next = taken({ delivery_events: [old, event("Envío tomado por Ana Moto, 21:00")] });
    expect(detectCourierEvents([prev], [next], name)).toHaveLength(1);
  });

  it("no avisa con 'Lo llevo yo' (el envío pasa a self)", () => {
    expect(detectCourierEvents([order()], [order({ courier_status: "self" })], name)).toEqual([]);
  });

  it("una recarga sin cambios no avisa", () => {
    expect(detectCourierEvents([taken()], [taken()], name)).toEqual([]);
    expect(detectCourierEvents([order()], [order()], name)).toEqual([]);
  });

  it("un pedido que no estaba en la lista anterior no avisa (ya pasó antes)", () => {
    expect(detectCourierEvents([], [taken()], name)).toEqual([]);
  });

  it("un pedido que desaparece de la lista no avisa", () => {
    expect(detectCourierEvents([taken()], [], name)).toEqual([]);
  });

  it("un pedido cancelado que se desasigna no avisa", () => {
    expect(detectCourierEvents([taken()], [order({ status: "cancelled" })], name)).toEqual([]);
  });

  it("junta los avisos de varios pedidos", () => {
    const prev = [order(), order({ id: "o2", order_number: "13" })];
    const next = [taken(), taken({ id: "o2", order_number: "13", courier_id: "c2" })];
    expect(detectCourierEvents(prev, next, name).map((e) => e.courierName)).toEqual(["Ana Moto", "Beto"]);
  });
});
