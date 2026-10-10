import { describe, expect, it } from "vitest";

import {
  accessState,
  courierAccess,
  hasTemporaryPassword,
  redirectForRoute,
  superAdminAccess,
} from "./access";

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

  it("manda al panel a quien ya tiene sesión y entra a /login", () => {
    expect(redirectForRoute("/login", true)).toBe("/dashboard");
  });

  it("deja ver /login a quien no tiene sesión", () => {
    expect(redirectForRoute("/login", false)).toBeNull();
  });

  it("no hay registro público: /registro no recibe trato especial", () => {
    expect(redirectForRoute("/registro", true)).toBeNull();
    expect(redirectForRoute("/registro", false)).toBeNull();
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

describe("rutas de /superadmin — ADMIN-SUPER-7", () => {
  it("sin sesión lleva a /login recordando el destino", () => {
    expect(redirectForRoute("/superadmin", false)).toBe(
      "/login?next=%2Fsuperadmin",
    );
    expect(redirectForRoute("/superadmin/negocios/x", false)).toBe(
      "/login?next=%2Fsuperadmin%2Fnegocios%2Fx",
    );
  });

  it("con sesión deja pasar: el permiso de superadmin lo decide la página", () => {
    expect(redirectForRoute("/superadmin", true)).toBeNull();
  });

  it("no confunde prefijos parecidos", () => {
    expect(redirectForRoute("/superadminx", false)).toBeNull();
  });
});

describe("superAdminAccess — ADMIN-SUPER-7", () => {
  it("sin usuario: login", () => {
    expect(superAdminAccess({ user: null, isSuperAdmin: false })).toBe("login");
  });

  it("usuario común: a su panel", () => {
    expect(superAdminAccess({ user: { id: "u" }, isSuperAdmin: false })).toBe(
      "panel",
    );
  });

  it("superadmin: pasa", () => {
    expect(superAdminAccess({ user: { id: "u" }, isSuperAdmin: true })).toBe(
      "ok",
    );
  });
});

describe("accessState con superadmin — ADMIN-SUPER-9", () => {
  it("un superadmin sin negocio va a /superadmin, no a /sin-negocio", () => {
    expect(
      accessState({ user: { id: "u" }, business: null, isSuperAdmin: true }),
    ).toBe("superadmin");
  });

  it("un superadmin con negocio entra a su panel", () => {
    expect(
      accessState({
        user: { id: "u" },
        business: { id: "b" },
        isSuperAdmin: true,
      }),
    ).toBe("ok");
  });

  it("un usuario común sin negocio sigue yendo a /sin-negocio", () => {
    expect(
      accessState({ user: { id: "u" }, business: null, isSuperAdmin: false }),
    ).toBe("sin-negocio");
  });

  it("sin usuario, ser superadmin no cambia nada", () => {
    expect(
      accessState({ user: null, business: null, isSuperAdmin: true }),
    ).toBe("login");
  });
});

describe("contraseña temporal — ADMIN-SUPER-10", () => {
  it.each(["/dashboard", "/dashboard/menu", "/superadmin", "/superadmin/negocios/x", "/login", "/sin-negocio"])(
    "manda %s al cambio de contraseña",
    (path) => {
      expect(redirectForRoute(path, true, true)).toBe("/cambiar-contrasena");
    },
  );

  it("deja pasar /cambiar-contrasena: ahí se elige la contraseña propia", () => {
    expect(redirectForRoute("/cambiar-contrasena", true, true)).toBeNull();
  });

  it("sin la marca no cambia nada", () => {
    expect(redirectForRoute("/dashboard", true, false)).toBeNull();
    expect(redirectForRoute("/dashboard", true)).toBeNull();
  });

  it("la pantalla de cambio pide sesión", () => {
    expect(redirectForRoute("/cambiar-contrasena", false)).toBe(
      "/login?next=%2Fcambiar-contrasena",
    );
    expect(redirectForRoute("/cambiar-contrasena", true)).toBeNull();
  });

  it("sin sesión la marca no importa", () => {
    expect(redirectForRoute("/login", false, true)).toBeNull();
  });
});

describe("hasTemporaryPassword — ADMIN-SUPER-10", () => {
  it("es verdadero solo con la marca en true", () => {
    expect(hasTemporaryPassword({ must_change_password: true })).toBe(true);
  });

  it.each([
    [undefined],
    [null],
    [{}],
    [{ must_change_password: false }],
    [{ must_change_password: "true" }],
    [{ must_change_password: 1 }],
  ])("es falso con %j", (metadata) => {
    expect(hasTemporaryPassword(metadata as never)).toBe(false);
  });
});

describe("rutas de /repartidor — ENVIO-30", () => {
  it("sin sesión lleva a /login recordando el destino", () => {
    expect(redirectForRoute("/repartidor", false)).toBe("/login?next=%2Frepartidor");
    expect(redirectForRoute("/repartidor/zonas", false)).toBe("/login?next=%2Frepartidor%2Fzonas");
  });

  it("con sesión deja pasar: que sea repartidor lo decide la página", () => {
    expect(redirectForRoute("/repartidor", true)).toBeNull();
    expect(redirectForRoute("/repartidor/zonas", true)).toBeNull();
  });

  it("no confunde prefijos parecidos", () => {
    expect(redirectForRoute("/repartidorx", false)).toBeNull();
  });

  it("con contraseña temporal, también va al cambio de contraseña", () => {
    expect(redirectForRoute("/repartidor", true, true)).toBe("/cambiar-contrasena");
  });
});

describe("accessState con repartidor — ENVIO-30", () => {
  it("un usuario sin negocio que es repartidor va a /repartidor", () => {
    expect(accessState({ user: { id: "u" }, business: null, isCourier: true })).toBe("repartidor");
  });

  it("con negocio entra a su panel aunque también sea repartidor", () => {
    expect(accessState({ user: { id: "u" }, business: { id: "b" }, isCourier: true })).toBe("ok");
  });

  it("un superadmin sigue yendo a /superadmin", () => {
    expect(
      accessState({ user: { id: "u" }, business: null, isSuperAdmin: true, isCourier: true }),
    ).toBe("superadmin");
  });

  it("sin ser repartidor, sin negocio sigue yendo a /sin-negocio", () => {
    expect(accessState({ user: { id: "u" }, business: null, isCourier: false })).toBe("sin-negocio");
  });

  it("sin usuario pide login", () => {
    expect(accessState({ user: null, business: null, isCourier: true })).toBe("login");
  });
});

describe("courierAccess — ENVIO-30", () => {
  it("sin usuario: login", () => {
    expect(courierAccess({ user: null, isCourier: false })).toBe("login");
  });

  it("un usuario que no es repartidor vuelve a su panel", () => {
    expect(courierAccess({ user: { id: "u" }, isCourier: false })).toBe("panel");
  });

  it("el repartidor pasa", () => {
    expect(courierAccess({ user: { id: "u" }, isCourier: true })).toBe("ok");
  });
});
