import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/components/pwa/InstallAppButton", () => ({
  default: ({ variant }: { variant?: string }) => <button>Instalar app ({variant})</button>,
}));
vi.mock("@/components/pwa/PushToggle", () => ({
  default: ({ variant }: { variant?: string }) => <button>Avisos ({variant})</button>,
}));
vi.mock("@/components/pwa/PushEndpointField", () => ({ default: () => <input type="hidden" name="pushEndpoint" /> }));

import MobileMenu from "./MobileMenu";

const base = { showChangePassword: false, showAppControls: false };

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
}

// ADMIN-MOVIL-1 a 3
describe("MobileMenu — ADMIN-MOVIL-2 y 3", () => {
  it("empieza cerrado: solo se ve el botón ⋯", () => {
    render(<MobileMenu {...base} />);

    expect(screen.getByRole("button", { name: "Más opciones" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menuitem", { name: "Salir" })).not.toBeInTheDocument();
  });

  it("lista los accesos rápidos con su nombre completo, en pestaña nueva", () => {
    render(
      <MobileMenu
        {...base}
        quickLinks={[{ href: "https://x.test/menu", label: "Ver menú", short: "Menú" }]}
      />,
    );
    open();

    const link = screen.getByRole("menuitem", { name: "Ver menú" });
    expect(link).toHaveAttribute("href", "https://x.test/menu");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("con showAppControls suma avisos e instalar, y el formulario de salir lleva la dirección del aparato", () => {
    const { container } = render(<MobileMenu {...base} showAppControls />);
    open();

    expect(screen.getByRole("button", { name: /Avisos/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Instalar app/ })).toBeInTheDocument();
    expect(container.querySelector('input[name="pushEndpoint"]')).not.toBeNull();
  });

  it("sin showAppControls no hay avisos ni instalar ni dirección del aparato", () => {
    const { container } = render(<MobileMenu {...base} />);
    open();

    expect(screen.queryByRole("button", { name: /Avisos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Instalar app/ })).not.toBeInTheDocument();
    expect(container.querySelector('input[name="pushEndpoint"]')).toBeNull();
  });

  it("muestra Superadmin y Cambiar contraseña solo si corresponde, y Salir va al final", () => {
    render(
      <MobileMenu {...base} showChangePassword switchLink={{ href: "/superadmin", label: "Superadmin" }} />,
    );
    open();

    expect(screen.getByRole("menuitem", { name: "Superadmin" })).toHaveAttribute("href", "/superadmin");
    expect(screen.getByRole("menuitem", { name: "Cambiar contraseña" })).toBeInTheDocument();

    const items = screen.getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveTextContent("Salir");
  });

  it("se cierra con Escape y al tocar afuera", () => {
    render(<MobileMenu {...base} />);

    open();
    expect(screen.getByRole("menuitem", { name: "Salir" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Salir" })).not.toBeInTheDocument();

    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menuitem", { name: "Salir" })).not.toBeInTheDocument();
  });

  it("cada ítem mide al menos 44 px (min-h-11)", () => {
    render(<MobileMenu {...base} showChangePassword />);
    open();

    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.className).toContain("min-h-11");
    }
  });
});
