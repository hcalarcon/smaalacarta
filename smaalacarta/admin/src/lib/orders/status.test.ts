import { describe, expect, it } from "vitest";

import {
  type DeliveryContext,
  boardColumn,
  canTransition,
  isFinal,
  nextStatuses,
  primaryAction,
  STATUS_LABELS,
  STATUSES,
} from "./status";

// Los estados que existen en un pedido sin envío (ENVIO-10).
const SIN_ENVIO = STATUSES.filter((s) => s !== "handed_to_courier" && s !== "on_the_way");

describe("estados — ADMIN-PEDIDOS-1", () => {
  it("van de Pendiente a Entregado, y Cancelado aparte", () => {
    expect(STATUSES).toEqual([
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "handed_to_courier",
      "on_the_way",
      "delivered",
      "cancelled",
    ]);
  });

  it("todos tienen su etiqueta en español", () => {
    expect(STATUS_LABELS).toEqual({
      pending: "Pendiente",
      confirmed: "Confirmado",
      preparing: "En preparación",
      ready: "Listo",
      handed_to_courier: "Entregado al repartidor",
      on_the_way: "En camino",
      delivered: "Entregado",
      cancelled: "Cancelado",
    });
  });
});

describe("canTransition — igual que la base de datos", () => {
  // La matriz completa: la misma regla que `set_order_status` en la migración.
  const permitidos: Record<string, string[]> = {
    pending: ["confirmed", "preparing", "ready", "delivered", "cancelled"],
    confirmed: ["preparing", "ready", "delivered", "cancelled"],
    preparing: ["ready", "delivered", "cancelled"],
    ready: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  };

  for (const desde of SIN_ENVIO) {
    for (const hasta of SIN_ENVIO) {
      const esperado = permitidos[desde].includes(hasta);
      it(`${desde} → ${hasta}: ${esperado ? "sí" : "no"}`, () => {
        expect(canTransition(desde, hasta)).toBe(esperado);
      });
    }
  }

  it("sin envío no existen los estados del repartidor — ENVIO-10", () => {
    for (const desde of SIN_ENVIO) {
      expect(canTransition(desde, "handed_to_courier")).toBe(false);
      expect(canTransition(desde, "on_the_way")).toBe(false);
    }
    expect(nextStatuses("handed_to_courier")).toEqual([]);
    expect(nextStatuses("on_the_way")).toEqual([]);
  });

  it("un estado desconocido no cambia ni se acepta", () => {
    expect(canTransition("volando", "ready")).toBe(false);
    expect(canTransition("pending", "volando")).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("lista los destinos posibles en orden, con cancelar al final", () => {
    expect(nextStatuses("pending")).toEqual(["confirmed", "preparing", "ready", "delivered", "cancelled"]);
    expect(nextStatuses("ready")).toEqual(["delivered", "cancelled"]);
  });

  it("los estados finales no tienen destinos", () => {
    expect(nextStatuses("delivered")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
  });

  it("cada destino es una transición permitida", () => {
    for (const from of STATUSES) {
      for (const to of nextStatuses(from)) expect(canTransition(from, to)).toBe(true);
    }
    const envio = { courier: true, courierStatus: "accepted" };
    for (const from of STATUSES) {
      for (const to of nextStatuses(from, null, envio)) {
        expect(canTransition(from, to, null, envio)).toBe(true);
      }
    }
  });
});

describe("isFinal", () => {
  it.each([
    ["delivered", true],
    ["cancelled", true],
    ["pending", false],
    ["confirmed", false],
    ["preparing", false],
    ["ready", false],
  ])("%s → %s", (status, esperado) => {
    expect(isFinal(status)).toBe(esperado);
  });
});

describe("primaryAction — el botón principal de cada pedido", () => {
  it.each([
    ["pending", "confirmed", "Confirmar"],
    ["confirmed", "preparing", "Preparar"],
    ["preparing", "ready", "Marcar listo"],
    ["ready", "delivered", "Marcar entregado"],
  ])("desde %s: pasa a %s (%s)", (status, next, label) => {
    expect(primaryAction(status)).toEqual({ status: next, label });
  });

  it("con envío, Listo pasa a Entregado al repartidor y el resto igual — ENVIO-9", () => {
    const envio = { courier: true, courierStatus: "accepted" };
    expect(primaryAction("ready", envio)).toEqual({
      status: "handed_to_courier",
      label: "Entregar al repartidor",
    });
    expect(primaryAction("pending", envio)).toEqual({ status: "confirmed", label: "Confirmar" });
    expect(primaryAction("handed_to_courier", envio)).toBeNull();
    expect(primaryAction("on_the_way", envio)).toBeNull();
  });

  it("los pedidos terminados no tienen acción", () => {
    expect(primaryAction("delivered")).toBeNull();
    expect(primaryAction("cancelled")).toBeNull();
  });

  it("la acción principal siempre es una transición permitida", () => {
    for (const s of STATUSES) {
      const action = primaryAction(s);
      if (action) expect(canTransition(s, action.status)).toBe(true);
    }
  });
});

describe("boardColumn", () => {
  it.each([
    ["pending", "nuevos"],
    ["confirmed", "en_curso"],
    ["preparing", "en_curso"],
    ["ready", "listos"],
    ["handed_to_courier", "listos"],
    ["on_the_way", "listos"],
    ["delivered", "cerrados"],
    ["cancelled", "cerrados"],
  ])("%s va a %s", (status, column) => {
    expect(boardColumn(status)).toBe(column);
  });

  it("un estado desconocido va a cerrados, para no perderlo de vista ni molestar", () => {
    expect(boardColumn("volando")).toBe("cerrados");
  });
});

describe("pago pendiente — ADMIN-PEDIDOS-18", () => {
  // Con Mercado Pago sin pagar (awaiting) o con el pago fallido, solo se puede cancelar: la misma
  // regla que `set_order_status` en la base.
  it.each(["awaiting", "failed"])("con el pago %s solo se puede cancelar, desde cualquier estado", (pago) => {
    for (const desde of SIN_ENVIO) {
      const esperado = isFinal(desde) ? [] : ["cancelled"];
      expect(nextStatuses(desde, pago)).toEqual(esperado);

      for (const hasta of STATUSES) {
        expect(canTransition(desde, hasta, pago)).toBe(esperado.includes(hasta));
      }
    }
  });

  it.each(["paid", "not_required", undefined, null])("con el pago %s no cambia nada", (pago) => {
    for (const desde of SIN_ENVIO) {
      expect(nextStatuses(desde, pago)).toEqual(nextStatuses(desde));
    }
  });
});

describe("pedido con envío — ENVIO-8 y ENVIO-9", () => {
  const aceptado: DeliveryContext = { courier: true, courierStatus: "accepted" };

  // La matriz del local para un pedido con envío aceptado: la misma regla que `set_order_status`.
  const local: Record<string, string[]> = {
    pending: ["confirmed", "preparing", "ready", "handed_to_courier", "cancelled"],
    confirmed: ["preparing", "ready", "handed_to_courier", "cancelled"],
    preparing: ["ready", "handed_to_courier", "cancelled"],
    ready: ["handed_to_courier", "cancelled"],
    handed_to_courier: ["cancelled"],
    on_the_way: ["cancelled"],
    delivered: [],
    cancelled: [],
  };

  for (const desde of STATUSES) {
    for (const hasta of STATUSES) {
      const esperado = local[desde].includes(hasta);
      it(`local, envío aceptado, ${desde} → ${hasta}: ${esperado ? "sí" : "no"}`, () => {
        expect(canTransition(desde, hasta, null, aceptado)).toBe(esperado);
      });
    }
  }

  it.each(["waiting", "requested", "rejected", null, undefined])(
    "con el envío %s, un pedido pendiente solo se puede cancelar",
    (courierStatus) => {
      expect(nextStatuses("pending", null, { courier: true, courierStatus })).toEqual(["cancelled"]);
    },
  );

  it("el repartidor avanza de a un paso y no cancela", () => {
    const repartidor: DeliveryContext = { courier: true, courierStatus: "accepted", actor: "courier" };
    expect(nextStatuses("handed_to_courier", null, repartidor)).toEqual(["on_the_way"]);
    expect(nextStatuses("on_the_way", null, repartidor)).toEqual(["delivered"]);
    expect(nextStatuses("ready", null, repartidor)).toEqual([]);
    expect(nextStatuses("delivered", null, repartidor)).toEqual([]);
  });

  it("con el pago pendiente solo se cancela, también con envío", () => {
    expect(nextStatuses("confirmed", "awaiting", aceptado)).toEqual(["cancelled"]);
  });
});
