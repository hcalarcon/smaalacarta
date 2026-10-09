import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsLayout from "./SettingsLayout";

const sections = [{ id: "datos", label: "Datos del negocio" }];

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  try {
    localStorage.clear();
  } catch {}
});

const layout = () =>
  render(
    <SettingsLayout sections={sections}>
      <p>contenido</p>
    </SettingsLayout>,
  );

describe("SettingsLayout — ADMIN-CONFIG-38", () => {
  it("el índice arranca abierto y se oculta con el botón, dejando el control para volver a abrirlo", () => {
    const { container } = layout();
    expect(container.firstElementChild!.className).toContain("lg:grid-cols-[10rem_");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar el índice de secciones" }));
    expect(container.firstElementChild!.className).toContain("lg:grid-cols-[2.5rem_");
    expect(screen.getByRole("button", { name: "Mostrar el índice de secciones" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("recuerda la elección la próxima vez que se abre la pantalla", () => {
    const first = layout();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar el índice de secciones" }));
    first.unmount();

    layout();
    expect(screen.getByRole("button", { name: "Mostrar el índice de secciones" })).toBeInTheDocument();
  });

  it("funciona aunque el navegador no deje usar localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    layout();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar el índice de secciones" }));
    expect(screen.getByRole("button", { name: "Mostrar el índice de secciones" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
