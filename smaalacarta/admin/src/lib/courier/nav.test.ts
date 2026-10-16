import { describe, expect, it } from "vitest";

import { courierBarItems, courierTab } from "./nav";

// ADMIN-MOVIL-7 y 8
describe("courierTab — ADMIN-MOVIL-8", () => {
  it("?tab=rendiciones abre Rendiciones", () => {
    expect(courierTab("rendiciones")).toBe("rendiciones");
  });

  it("cualquier otro valor, o ninguno, abre Pedidos", () => {
    expect(courierTab(null)).toBe("pedidos");
    expect(courierTab(undefined)).toBe("pedidos");
    expect(courierTab("")).toBe("pedidos");
    expect(courierTab("zonas")).toBe("pedidos");
  });
});

describe("courierBarItems — ADMIN-MOVIL-7", () => {
  it("tiene Pedidos, Rendiciones, Mis zonas y Mi perfil, en ese orden y con sus direcciones", () => {
    const items = courierBarItems("/repartidor", "pedidos", 0);

    expect(items.map((item) => [item.label, item.href])).toEqual([
      ["Pedidos", "/repartidor"],
      ["Rendiciones", "/repartidor?tab=rendiciones"],
      ["Mis zonas", "/repartidor/zonas"],
      ["Mi perfil", "/repartidor/perfil"],
    ]);
  });

  it("marca como activo solo el ítem de la pantalla en que está", () => {
    const active = (path: string, tab: "pedidos" | "rendiciones") =>
      courierBarItems(path, tab, 0)
        .filter((item) => item.active)
        .map((item) => item.label);

    expect(active("/repartidor", "pedidos")).toEqual(["Pedidos"]);
    expect(active("/repartidor", "rendiciones")).toEqual(["Rendiciones"]);
    expect(active("/repartidor/zonas", "pedidos")).toEqual(["Mis zonas"]);
    // La pestaña de la URL no cuenta fuera de /repartidor.
    expect(active("/repartidor/zonas", "rendiciones")).toEqual(["Mis zonas"]);
    expect(active("/repartidor/perfil", "pedidos")).toEqual(["Mi perfil"]);
  });

  it("el contador de pendientes de rendir va solo en Rendiciones y solo si hay", () => {
    expect(courierBarItems("/repartidor", "pedidos", 3).map((item) => item.badge)).toEqual([0, 3, 0, 0]);
    expect(courierBarItems("/repartidor", "pedidos", 0).map((item) => item.badge)).toEqual([0, 0, 0, 0]);
  });
});
