import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/repartidor", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import CourierBottomNav from "./CourierBottomNav";

beforeEach(() => {
  nav.pathname = "/repartidor";
  nav.search = "";
});

// ADMIN-MOVIL-7
describe("CourierBottomNav — ADMIN-MOVIL-7", () => {
  it("muestra Pedidos, Rendiciones, Mis zonas y Mi perfil, y solo se ve en el celular (lg:hidden)", () => {
    render(<CourierBottomNav toSettleCount={0} />);

    const bar = screen.getByRole("navigation", { name: "Secciones del repartidor" });
    expect(bar.className).toContain("lg:hidden");
    expect(screen.getByRole("link", { name: "Pedidos" })).toHaveAttribute("href", "/repartidor");
    expect(screen.getByRole("link", { name: "Rendiciones" })).toHaveAttribute(
      "href",
      "/repartidor?tab=rendiciones",
    );
    expect(screen.getByRole("link", { name: "Mis zonas" })).toHaveAttribute("href", "/repartidor/zonas");
    expect(screen.getByRole("link", { name: "Mi perfil" })).toHaveAttribute("href", "/repartidor/perfil");
  });

  it("marca Pedidos como activo en /repartidor", () => {
    render(<CourierBottomNav toSettleCount={0} />);

    expect(screen.getByRole("link", { name: "Pedidos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Rendiciones" })).not.toHaveAttribute("aria-current");
  });

  it("con ?tab=rendiciones marca Rendiciones", () => {
    nav.search = "tab=rendiciones";
    render(<CourierBottomNav toSettleCount={0} />);

    expect(screen.getByRole("link", { name: "Rendiciones" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Pedidos" })).not.toHaveAttribute("aria-current");
  });

  it("en /repartidor/zonas marca Mis zonas", () => {
    nav.pathname = "/repartidor/zonas";
    render(<CourierBottomNav toSettleCount={0} />);

    expect(screen.getByRole("link", { name: "Mis zonas" })).toHaveAttribute("aria-current", "page");
  });

  it("el contador de pendientes de rendir aparece en Rendiciones", () => {
    render(<CourierBottomNav toSettleCount={4} />);

    expect(screen.getByRole("link", { name: /Rendiciones/ })).toHaveTextContent("4");
    expect(screen.getByLabelText("4 pendientes")).toBeInTheDocument();
  });

  it("cada ítem mide al menos 44 px de alto y respeta el área segura del iPhone", () => {
    render(<CourierBottomNav toSettleCount={0} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-14");
    }
    expect(screen.getByRole("navigation").className).toContain("safe-area-inset-bottom");
  });
});
