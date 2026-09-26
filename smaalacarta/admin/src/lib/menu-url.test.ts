import { describe, expect, it } from "vitest";

import { menuUrl } from "./menu-url";

describe("menuUrl — ADMIN-RESUMEN-2", () => {
  it("el slug es el subdominio", () => {
    expect(menuUrl("santa-julia-resto")).toBe("https://santa-julia-resto.smaalacarta.com.ar");
  });
});
