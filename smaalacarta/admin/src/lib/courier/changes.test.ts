import { describe, expect, it } from "vitest";

import { changeText, courierChanges, snapshotOrders } from "./changes";

const base = { id: "o1", numero: "001", negocio: { nombre: "Ana Resto" }, estado: "confirmed", tiempos: { listo_a: "2026-10-12T15:30:00Z" } };

const prev = (...orders: Array<Record<string, unknown>>) => snapshotOrders(orders as never);
const next = (...orders: Array<Record<string, unknown>>) => orders as never;

describe("avisos con la página abierta del repartidor — ENVIO-168", () => {
  it("el local marca Listo: avisa", () => {
    expect(courierChanges(prev(base), next({ ...base, estado: "ready" }))).toEqual([
      { id: "o1", numero: "001", negocio: "Ana Resto", kind: "ready" },
    ]);
  });

  it("el texto del aviso de Listo nombra el local — ENVIO-238", () => {
    const [change] = courierChanges(prev(base), next({ ...base, estado: "ready" }));
    expect(changeText(change)).toBe("Pedido #001: listo para retirar en Ana Resto.");
  });

  it("el local cambia la demora: avisa; la misma hora escrita distinto no", () => {
    const changed = { ...base, tiempos: { listo_a: "2026-10-12T16:00:00Z" } };
    expect(courierChanges(prev(base), next(changed))).toEqual([
      { id: "o1", numero: "001", negocio: "Ana Resto", kind: "prep_changed" },
    ]);

    const same = { ...base, tiempos: { listo_a: "2026-10-12T15:30:00.000+00:00" } };
    expect(courierChanges(prev(base), next(same))).toEqual([]);
  });

  it("el local cancela: avisa", () => {
    expect(courierChanges(prev(base), next({ ...base, estado: "cancelled" }))).toEqual([
      { id: "o1", numero: "001", negocio: "Ana Resto", kind: "cancelled" },
    ]);
  });

  it("los demás cambios de estado no avisan", () => {
    expect(courierChanges(prev(base), next({ ...base, estado: "preparing" }))).toEqual([]);
    expect(courierChanges(prev({ ...base, estado: "ready" }), next({ ...base, estado: "handed_to_courier" }))).toEqual([]);
    expect(courierChanges(prev({ ...base, estado: "on_the_way" }), next({ ...base, estado: "delivered" }))).toEqual([]);
  });

  it("un pedido que no estaba en la lectura anterior no avisa", () => {
    expect(courierChanges(prev(), next({ ...base, estado: "ready" }))).toEqual([]);
  });

  it("cancelado y con otra demora a la vez: un solo aviso, el de cancelado", () => {
    const both = { ...base, estado: "cancelled", tiempos: { listo_a: "2026-10-12T16:00:00Z" } };
    expect(courierChanges(prev(base), next(both)).map((change) => change.kind)).toEqual(["cancelled"]);
  });
});
