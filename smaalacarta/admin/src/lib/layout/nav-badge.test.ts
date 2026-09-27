import { describe, expect, it } from "vitest";

import { navBadgeLabel } from "./nav-badge";

describe("navBadgeLabel — ADMIN-RESUMEN-3", () => {
  it("sin pedidos no muestra nada", () => {
    expect(navBadgeLabel(0)).toBeNull();
    expect(navBadgeLabel(undefined)).toBeNull();
    expect(navBadgeLabel(-2)).toBeNull();
  });

  it("muestra el número hasta 9 y '9+' desde 10", () => {
    expect(navBadgeLabel(1)).toBe("1");
    expect(navBadgeLabel(9)).toBe("9");
    expect(navBadgeLabel(10)).toBe("9+");
    expect(navBadgeLabel(250)).toBe("9+");
  });
});
