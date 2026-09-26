import { describe, expect, it } from "vitest";

import {
  boardColumn,
  canTransition,
  isFinal,
  nextStatuses,
  primaryAction,
  STATUS_LABELS,
  STATUSES,
} from "./status";

describe("estados — ADMIN-PEDIDOS-1", () => {
  it("van de Pendiente a Entregado, y Cancelado aparte", () => {
    expect(STATUSES).toEqual(["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"]);
  });

  it("todos tienen su etiqueta en español", () => {
    expect(STATUS_LABELS).toEqual({
      pending: "Pendiente",
      confirmed: "Confirmado",
      preparing: "En preparación",
      ready: "Listo",
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

  for (const desde of STATUSES) {
    for (const hasta of STATUSES) {
      const esperado = permitidos[desde].includes(hasta);
      it(`${desde} → ${hasta}: ${esperado ? "sí" : "no"}`, () => {
        expect(canTransition(desde, hasta)).toBe(esperado);
      });
    }
  }

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
    ["delivered", "cerrados"],
    ["cancelled", "cerrados"],
  ])("%s va a %s", (status, column) => {
    expect(boardColumn(status)).toBe(column);
  });

  it("un estado desconocido va a cerrados, para no perderlo de vista ni molestar", () => {
    expect(boardColumn("volando")).toBe("cerrados");
  });
});
