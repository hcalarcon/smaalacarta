import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: { installControl: "prompt" as "hidden" | "prompt" | "ios-steps", promptInstall: vi.fn() },
}));

vi.mock("./pwa-store", () => ({
  usePwa: () => ({ installControl: store.installControl }),
  promptInstall: store.promptInstall,
  start: vi.fn(),
}));

import InstallPrompt from "./InstallPrompt";

beforeEach(() => {
  store.installControl = "prompt";
  store.promptInstall.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

// ADMIN-MOVIL-4 a 6
describe("InstallPrompt — ADMIN-MOVIL-4", () => {
  it("aparece si la app se puede instalar", () => {
    render(<InstallPrompt />);

    expect(screen.getByRole("dialog", { name: "Instalá SMA a la Carta" })).toBeInTheDocument();
  });

  it("no aparece si ya está instalada o el navegador no la ofrece (control oculto)", () => {
    store.installControl = "hidden";
    render(<InstallPrompt />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("es solo del celular: en escritorio no se ve (lg:hidden)", () => {
    render(<InstallPrompt />);

    expect(screen.getByRole("dialog").parentElement?.className).toContain("lg:hidden");
  });
});

describe("InstallPrompt — ADMIN-MOVIL-5", () => {
  it("'Ahora no' lo cierra y no vuelve a aparecer en la misma visita", () => {
    const { unmount } = render(<InstallPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Otra página de la misma visita: se monta de nuevo y sigue cerrado.
    unmount();
    render(<InstallPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("en una visita nueva (sessionStorage vacío) vuelve a aparecer", () => {
    const first = render(<InstallPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    first.unmount();

    window.sessionStorage.clear();
    render(<InstallPrompt />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("InstallPrompt — ADMIN-MOVIL-6", () => {
  it("'Instalar' dispara la instalación del navegador", () => {
    render(<InstallPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Instalar" }));

    expect(store.promptInstall).toHaveBeenCalledTimes(1);
  });

  it("en iPhone 'Instalar' muestra los pasos de Compartir → Agregar a inicio", () => {
    store.installControl = "ios-steps";
    render(<InstallPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Instalar" }));

    expect(store.promptInstall).not.toHaveBeenCalled();
    expect(screen.getByText("Agregar a inicio")).toBeInTheDocument();
  });
});
