import { describe, expect, it } from "vitest";

import { zonesLabel } from "./zones-label";

describe("zonesLabel — ENVIO-136", () => {
  it("dice cuántas zonas tiene el local, en singular y plural", () => {
    expect(zonesLabel(39)).toBe("39 zonas");
    expect(zonesLabel(2)).toBe("2 zonas");
    expect(zonesLabel(1)).toBe("1 zona");
  });

  it("sin zonas, lo dice", () => {
    expect(zonesLabel(0)).toBe("Sin zonas");
  });
});
