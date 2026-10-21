import { describe, expect, it } from "vitest";

import { availableActions } from "@/lib/courier/panel";
import {
  PRACTICE_ID,
  practiceAvailable,
  practicePhase,
  practiceTaken,
  statusFromRow,
  tutorialSteps,
  visibleSteps,
} from "@/lib/courier/tutorial";

const NOW = new Date("2026-10-24T15:00:00Z");

describe("el estado del tutorial — ENVIO-212", () => {
  it("lee lo que responde la base", () => {
    expect(statusFromRow({ seen: true, mode: "offers", zone_price: "1800.00" })).toEqual({
      seen: true,
      mode: "offers",
      zonePrice: 1800,
    });
  });

  it("ante datos raros no abre el tutorial por su cuenta: dice que ya lo vio", () => {
    expect(statusFromRow(null).seen).toBe(true);
    expect(statusFromRow({ seen: "no" }).seen).toBe(true);
    expect(statusFromRow({ seen: false, mode: "otro" }).mode).toBe("fixed");
    expect(statusFromRow({ seen: false, zone_price: null }).zonePrice).toBeNull();
  });
});

describe("los pasos — ENVIO-214 y 215", () => {
  it("son diez, en este orden, con Saltear posible en todos (no hay paso sin salida)", () => {
    expect(tutorialSteps("fixed").map((step) => step.id)).toEqual([
      "welcome",
      "available",
      "zones",
      "practice",
      "take",
      "in_progress",
      "on_the_way",
      "delivered",
      "settlements",
      "done",
    ]);
  });

  it("el paso de tomar cambia con el modo", () => {
    const text = (mode: "fixed" | "offers") => tutorialSteps(mode).find((step) => step.id === "take")!.text;

    expect(text("fixed")).toBe("Tocá Tomar para quedártelo.");
    expect(text("offers")).toContain("Podés ofertar");
  });

  it("tomar, En camino y Entregado esperan el toque del repartidor; el resto sigue con Siguiente", () => {
    const waiting = tutorialSteps("fixed")
      .filter((step) => step.waitsForTap)
      .map((step) => step.id);

    expect(waiting).toEqual(["take", "on_the_way", "delivered"]);
  });

  it("un paso cuyo elemento no existe se saltea y la cuenta se ajusta", () => {
    const steps = visibleSteps(tutorialSteps("fixed"), (target) => target !== "available");

    expect(steps).toHaveLength(9);
    expect(steps.some((step) => step.id === "available")).toBe(false);
  });

  it("los pasos del pedido de práctica no se descartan aunque la tarjeta todavía no exista", () => {
    const steps = visibleSteps(tutorialSteps("fixed"), () => false);

    expect(steps.map((step) => step.id)).toEqual([
      "welcome",
      "practice",
      "take",
      "in_progress",
      "on_the_way",
      "delivered",
      "done",
    ]);
  });
});

describe("el pedido de práctica — ENVIO-216 y 217", () => {
  it("se ve solo entre su aparición y Entregado, y avanza con los pasos", () => {
    expect(practicePhase("zones")).toBeNull();
    expect(practicePhase("practice")).toBe("available");
    expect(practicePhase("take")).toBe("available");
    expect(practicePhase("in_progress")).toBe("taken");
    expect(practicePhase("on_the_way")).toBe("taken");
    expect(practicePhase("delivered")).toBe("on_the_way");
    expect(practicePhase("settlements")).toBeNull();
    expect(practicePhase("done")).toBeNull();
  });

  it("está marcado como práctica y usa el precio de lista que se le da", () => {
    const order = practiceAvailable("fixed", 1800, NOW);

    expect(order.id).toBe(PRACTICE_ID);
    expect(order.numero).toContain("PRÁCTICA");
    expect(order.negocio.nombre).toBe("Local de práctica");
    expect(order.envio).toEqual({ zona: "Centro", precio_lista: 1800 });
    expect(order.modo).toBe("fixed");
    expect(order.mi_oferta).toBeNull();
    expect(order.resultado).toBeNull();
  });

  it("sin zona real a mano usa un precio de ejemplo", () => {
    expect(practiceAvailable("offers", null, NOW).envio.precio_lista).toBeGreaterThan(0);
  });

  it("ya tomado ofrece En camino, y en camino ofrece Entregado, con los mismos botones de un pedido real", () => {
    const taken = practiceTaken("taken", 1800, NOW);
    const onTheWay = practiceTaken("on_the_way", 1800, NOW);

    expect(availableActions(taken)).toMatchObject({ onTheWay: true, delivered: false });
    expect(availableActions(onTheWay)).toMatchObject({ onTheWay: false, delivered: true });
    expect(taken.negocio.nombre).toBe("Local de práctica");
  });
});
