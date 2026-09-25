import { describe, expect, it } from "vitest";

import { accessState, redirectForRoute } from "./access";

describe("redirectForRoute — ADMIN-AUTH-7", () => {
  it("manda a /login a quien no tiene sesión y pide el panel", () => {
    expect(redirectForRoute("/dashboard", false)).toBe("/login?next=%2Fdashboard");
  });

  it("recuerda la subruta pedida", () => {
    expect(redirectForRoute("/dashboard/menu", false)).toBe(
      "/login?next=%2Fdashboard%2Fmenu",
    );
  });

  it("deja pasar el panel a quien tiene sesión", () => {
    expect(redirectForRoute("/dashboard/menu", true)).toBeNull();
  });

  it.each(["/login", "/registro", "/recuperar"])(
    "manda al panel a quien ya tiene sesión y entra a %s",
    (path) => {
      expect(redirectForRoute(path, true)).toBe("/dashboard");
    },
  );

  it.each(["/login", "/registro", "/recuperar"])(
    "deja ver %s a quien no tiene sesión",
    (path) => {
      expect(redirectForRoute(path, false)).toBeNull();
    },
  );

  it("no toca /restablecer: se entra con el link del mail, ya con sesión", () => {
    expect(redirectForRoute("/restablecer", true)).toBeNull();
    expect(redirectForRoute("/restablecer", false)).toBeNull();
  });

  it("no toca /auth/callback", () => {
    expect(redirectForRoute("/auth/callback", false)).toBeNull();
    expect(redirectForRoute("/auth/callback", true)).toBeNull();
  });

  it("no confunde prefijos parecidos con el panel", () => {
    expect(redirectForRoute("/dashboardx", false)).toBeNull();
  });
});

describe("accessState — ADMIN-AUTH-8", () => {
  it("sin usuario: pide login", () => {
    expect(accessState({ user: null, business: null })).toBe("login");
  });

  it("con usuario pero sin negocio: sin-negocio, no login", () => {
    expect(accessState({ user: { id: "u1" }, business: null })).toBe(
      "sin-negocio",
    );
  });

  it("con usuario y negocio: ok", () => {
    expect(
      accessState({ user: { id: "u1" }, business: { id: "b1" } }),
    ).toBe("ok");
  });
});
