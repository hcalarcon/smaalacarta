import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CoverageClient from "./CoverageClient";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), setCoverage: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../../actions", () => ({ setZoneCoverageAction: mocks.setCoverage }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setCoverage.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

const zones = [
  { id: "z1", name: "Cantera", price: 5000, covered: true },
  { id: "z2", name: "Oasis", price: 5500, covered: false },
];

describe("Mis zonas — ENVIO-57", () => {
  it("lista las zonas con su precio de referencia y marca las que lleva", () => {
    render(<CoverageClient zones={zones} />);

    expect(screen.getByText("Cantera")).toBeTruthy();
    expect(screen.getByText(/\$\s?5\.500/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Cantera/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Oasis/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("rotula el precio como de referencia y dice que se puede cambiar al aceptar un pedido", () => {
    render(<CoverageClient zones={zones} />);

    expect(screen.getByText(/Precio de referencia/)).toBeTruthy();
    expect(screen.getByText(/se puede cambiar al aceptar un pedido/)).toBeTruthy();
  });

  it("no ofrece editar nombres ni precios", () => {
    render(<CoverageClient zones={zones} />);

    expect(screen.queryByRole("button", { name: /editar|borrar|agregar/i })).toBeNull();
    expect(screen.queryByLabelText("Precio")).toBeNull();
  });

  it("guarda al tocar la casilla", async () => {
    render(<CoverageClient zones={zones} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Oasis/ }));
    await waitFor(() => expect(mocks.setCoverage).toHaveBeenCalledWith("z2", true));

    fireEvent.click(screen.getByRole("checkbox", { name: /Cantera/ }));
    await waitFor(() => expect(mocks.setCoverage).toHaveBeenCalledWith("z1", false));
  });

  it("si no se pudo guardar, vuelve la marca y lo dice", async () => {
    mocks.setCoverage.mockResolvedValue({ ok: false, error: "No pudimos guardar el cambio. Probá de nuevo." });
    render(<CoverageClient zones={zones} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Oasis/ }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/No pudimos guardar/));
    expect((screen.getByRole("checkbox", { name: /Oasis/ }) as HTMLInputElement).checked).toBe(false);
  });
});
