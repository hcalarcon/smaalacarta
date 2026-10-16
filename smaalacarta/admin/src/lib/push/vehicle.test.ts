import { describe, expect, it } from "vitest";

import { withCarIfNeeded } from "./vehicle";

// ENVIO-177: el aviso de pedido nuevo respeta "Necesita auto".
const COURIERS = [
  { id: "moto", auto: false },
  { id: "auto", auto: true },
];

describe("withCarIfNeeded", () => {
  it("un pedido que necesita auto avisa solo a quien tiene auto", () => {
    expect(withCarIfNeeded(COURIERS, { needsCar: true, enabled: true })).toEqual([{ id: "auto", auto: true }]);
  });

  it("si nadie tiene auto, no avisa a nadie", () => {
    expect(withCarIfNeeded([{ id: "moto", auto: false }], { needsCar: true, enabled: true })).toEqual([]);
  });

  it("un pedido normal avisa a todos", () => {
    expect(withCarIfNeeded(COURIERS, { needsCar: false, enabled: true })).toHaveLength(2);
  });

  it("con el interruptor apagado no filtra a nadie", () => {
    expect(withCarIfNeeded(COURIERS, { needsCar: true, enabled: false })).toHaveLength(2);
  });
});
