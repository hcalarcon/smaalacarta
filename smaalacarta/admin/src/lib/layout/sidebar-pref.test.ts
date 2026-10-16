import { afterEach, describe, expect, it, vi } from "vitest";

import { readCollapsed, SIDEBAR_KEY, writeCollapsed } from "./sidebar-pref";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ADMIN-PEDIDOS-56
describe("menú lateral achicado — ADMIN-PEDIDOS-56", () => {
  it("por defecto está abierto", () => {
    expect(readCollapsed()).toBe(false);
  });

  it("recuerda la elección", () => {
    writeCollapsed(true);
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("1");
    expect(readCollapsed()).toBe(true);

    writeCollapsed(false);
    expect(readCollapsed()).toBe(false);
  });

  it("si el almacenamiento falla, no rompe y queda abierto", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(readCollapsed()).toBe(false);
    expect(() => writeCollapsed(true)).not.toThrow();
  });
});
