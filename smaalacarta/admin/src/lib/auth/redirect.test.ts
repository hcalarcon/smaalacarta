import { describe, expect, it } from "vitest";

import { callbackDestination, safeNextPath } from "./redirect";

describe("safeNextPath — ADMIN-AUTH-6", () => {
  it("conserva una ruta del panel", () => {
    expect(safeNextPath("/dashboard/menu")).toBe("/dashboard/menu");
  });

  it("conserva la query de una ruta del panel", () => {
    expect(safeNextPath("/dashboard/menu?cat=1")).toBe(
      "/dashboard/menu?cat=1",
    );
  });

  it("acepta /dashboard a secas", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
  });

  it.each([
    ["nada", null],
    ["undefined", undefined],
    ["vacío", ""],
    ["otro sitio", "https://malo.com/dashboard"],
    ["protocolo relativo", "//malo.com"],
    ["barra invertida", "/\malo.com"],
    ["fuera del panel", "/login"],
    ["prefijo parecido", "/dashboardx"],
    ["sin barra inicial", "dashboard/menu"],
    ["javascript:", "javascript:alert(1)"],
    ["salto de línea", "/dashboard\nLocation: https://malo.com"],
  ])("cae a /dashboard con %s", (_caso, valor) => {
    expect(safeNextPath(valor)).toBe("/dashboard");
  });
});

describe("callbackDestination — ADMIN-AUTH-6", () => {
  it("lleva a /restablecer cuando el link es de recuperación", () => {
    expect(callbackDestination("/restablecer")).toBe("/restablecer");
  });

  it("lleva a una ruta del panel", () => {
    expect(callbackDestination("/dashboard/menu")).toBe("/dashboard/menu");
  });

  it.each([null, "", "https://malo.com", "//malo.com", "/login", "/restablecerx"])(
    "cae a /dashboard con %j",
    (valor) => {
      expect(callbackDestination(valor)).toBe("/dashboard");
    },
  );
});
