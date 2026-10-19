import { describe, expect, it } from "vitest";

import { withBusinessVehicles, withCarIfNeeded } from "./vehicle";

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

describe("withBusinessVehicles — ENVIO-204", () => {
  const all = [
    { id: "moto", moto: true, auto: false },
    { id: "auto", moto: false, auto: true },
    { id: "ambos", moto: true, auto: true },
  ];

  it("un negocio solo Moto avisa a quien tiene moto", () => {
    const ids = withBusinessVehicles(all, { enabled: true, business: { moto: true, auto: false } }).map((c) => c.id);
    expect(ids).toEqual(["moto", "ambos"]);
  });

  it("un negocio con los dos avisa a todos", () => {
    expect(withBusinessVehicles(all, { enabled: true, business: { moto: true, auto: true } })).toHaveLength(3);
  });

  it("con el interruptor apagado no filtra a nadie", () => {
    expect(withBusinessVehicles(all, { enabled: false, business: { moto: false, auto: true } })).toHaveLength(3);
  });
});
