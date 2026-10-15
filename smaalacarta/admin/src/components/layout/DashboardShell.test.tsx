import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("../../../app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/components/pwa/InstallAppButton", () => ({ default: () => <button>Instalar app</button> }));
vi.mock("@/components/pwa/PushToggle", () => ({ default: () => <button>Activar avisos</button> }));
vi.mock("@/components/pwa/PushEndpointField", () => ({ default: () => <input type="hidden" name="pushEndpoint" /> }));
vi.mock("@/components/pwa/InstallPrompt", () => ({ default: () => <div data-testid="install-prompt" /> }));
vi.mock("@/components/pwa/ServiceWorkerRegister", () => ({ default: () => <span data-testid="sw-register" /> }));

import DashboardShell from "./DashboardShell";

const base = {
  title: "Ana Resto",
  subtitle: "Administración del negocio",
  sidebarSubtitle: "Panel administrador",
  userEmail: "ana@x.com",
  links: [{ href: "/dashboard", label: "Resumen", icon: "M0 0" }],
};

// ADMIN-PWA-16: los botones de instalar y de avisos solo salen donde el layout pasa `showAppControls`.
describe("DashboardShell — ADMIN-PWA-16", () => {
  it("con showAppControls muestra Instalar app y Activar avisos, y registra el service worker", () => {
    render(
      <DashboardShell {...base} showAppControls>
        contenido
      </DashboardShell>,
    );

    expect(screen.getByRole("button", { name: "Instalar app" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar avisos" })).toBeInTheDocument();
    expect(screen.getByTestId("sw-register")).toBeInTheDocument();
  });

  it("sin showAppControls (superadmin) no muestra nada de eso", () => {
    render(<DashboardShell {...base}>contenido</DashboardShell>);

    expect(screen.queryByRole("button", { name: "Instalar app" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar avisos" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("sw-register")).not.toBeInTheDocument();
  });
});

// ADMIN-PEDIDOS-56
describe("DashboardShell — menú lateral achicable, ADMIN-PEDIDOS-56", () => {
  const withLinks = {
    ...base,
    links: [
      { href: "/dashboard", label: "Resumen", icon: "M0 0" },
      { href: "/dashboard/orders", label: "Pedidos", icon: "M0 0", badge: 3 },
    ],
  };

  afterEach(() => localStorage.clear());

  it("achicado deja solo íconos con el nombre en el tooltip, y la elección se recuerda", () => {
    const { unmount } = render(<DashboardShell {...withLinks}>contenido</DashboardShell>);

    fireEvent.click(screen.getByRole("button", { name: "Achicar menú lateral" }));

    const link = screen.getByRole("link", { name: "Pedidos, 3 pendientes" });
    expect(link.getAttribute("title")).toBe("Pedidos");
    expect(link.textContent).toBe("3");
    expect(localStorage.getItem("sma.sidebar.collapsed")).toBe("1");

    unmount();
    render(<DashboardShell {...withLinks}>contenido</DashboardShell>);

    expect(screen.getByRole("button", { name: "Expandir menú lateral" })).toBeTruthy();
  });

  it("al expandirlo vuelven los nombres", () => {
    localStorage.setItem("sma.sidebar.collapsed", "1");
    render(<DashboardShell {...withLinks}>contenido</DashboardShell>);

    fireEvent.click(screen.getByRole("button", { name: "Expandir menú lateral" }));

    expect(screen.getByRole("link", { name: /Pedidos/ }).textContent).toContain("Pedidos");
  });
});
