import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ZonesClient from "./ZonesClient";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  setActive: vi.fn(),
  deleteZone: vi.fn(),
  reorder: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({
  createZoneAction: mocks.createZone,
  updateZoneAction: mocks.updateZone,
  setZoneActiveAction: mocks.setActive,
  deleteZoneAction: mocks.deleteZone,
  reorderZonesAction: mocks.reorder,
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(mocks)) {
    if (fn !== mocks.refresh) fn.mockResolvedValue({ ok: true });
  }
});

afterEach(cleanup);

describe("zonas de la plataforma — ENVIO-56", () => {
  const zones = [
    { id: "z1", name: "Cantera", price: 5000, sort_order: 1, active: true },
    { id: "z2", name: "Oasis", price: 5500, sort_order: 2, active: false },
  ];

  it("lista las zonas con su precio de referencia", () => {
    render(<ZonesClient zones={zones} />);

    expect(screen.getByText("Cantera")).toBeTruthy();
    expect(screen.getByText(/\$\s?5\.500/)).toBeTruthy();
  });

  it("no guarda una zona con el nombre repetido ni con un precio inválido", () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "cantera" } });
    fireEvent.change(screen.getByLabelText("Precio"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByText(/ya existe una zona/i)).toBeTruthy();
    expect(screen.getByText(/precio válido/i)).toBeTruthy();
    expect(mocks.createZone).not.toHaveBeenCalled();
  });

  it("agrega una zona válida", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Arenal" } });
    fireEvent.change(screen.getByLabelText("Precio"), { target: { value: "7.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(mocks.createZone).toHaveBeenCalledWith({ name: "Arenal", price: "7.000" }));
  });

  it("edita nombre y precio", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    fireEvent.change(screen.getByDisplayValue("5000"), { target: { value: "6000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.updateZone).toHaveBeenCalledWith("z1", { name: "Cantera", price: "6000" }));
  });

  it("activa y desactiva", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.click(screen.getByLabelText("Activo: Oasis"));

    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith("z2", true));
  });

  it("borra solo después de confirmar", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Borrar" })[0]);
    expect(mocks.deleteZone).not.toHaveBeenCalled();
    expect(screen.getByText(/Borrar Cantera/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mocks.deleteZone).toHaveBeenCalledWith("z1"));
  });

  it("si la zona ya tiene pedidos y quedó desactivada, lo avisa en pantalla", async () => {
    mocks.deleteZone.mockResolvedValue({
      ok: true,
      notice: "Esa zona ya tiene pedidos, así que no se borró: quedó desactivada.",
    });
    render(<ZonesClient zones={zones} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Borrar" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.getByText(/quedó desactivada/i)).toBeTruthy());
  });
});
