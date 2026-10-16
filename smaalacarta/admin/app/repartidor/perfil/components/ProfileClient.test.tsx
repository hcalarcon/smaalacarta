import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfileClient from "./ProfileClient";

const mocks = vi.hoisted(() => ({ savePrefs: vi.fn(), saveVehicles: vi.fn() }));

vi.mock("../../actions", () => ({
  savePreferencesAction: mocks.savePrefs,
  saveVehiclesAction: mocks.saveVehicles,
}));

const PREFS = { shopsOnTheWay: false, seeksOrders: false, note: "" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.savePrefs.mockResolvedValue({ ok: true });
  mocks.saveVehicles.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

// ENVIO-174 y 175
describe("el vehículo en Mi perfil", () => {
  it("con el interruptor apagado no hay casillas de vehículo", () => {
    render(<ProfileClient initial={PREFS} vehicles={{ moto: true, auto: false }} vehicleEnabled={false} />);

    expect(screen.queryByRole("checkbox", { name: /Moto/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Auto/ })).toBeNull();
  });

  it("prendido muestra Moto y Auto con lo guardado", () => {
    render(<ProfileClient initial={PREFS} vehicles={{ moto: true, auto: false }} vehicleEnabled />);

    expect((screen.getByRole("checkbox", { name: /Moto/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Auto/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("guarda las dos marcadas", async () => {
    render(<ProfileClient initial={PREFS} vehicles={{ moto: true, auto: false }} vehicleEnabled />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Auto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.saveVehicles).toHaveBeenCalledWith({ moto: true, auto: true }));
    expect(mocks.savePrefs).not.toHaveBeenCalled();
  });

  it("no deja sin ningún vehículo: no guarda y avisa", async () => {
    render(<ProfileClient initial={PREFS} vehicles={{ moto: true, auto: false }} vehicleEnabled />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Moto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/al menos un vehículo/i);
    expect(mocks.saveVehicles).not.toHaveBeenCalled();
  });

  it("apagado, guardar las preferencias no toca el vehículo", async () => {
    render(<ProfileClient initial={PREFS} vehicles={{ moto: true, auto: false }} vehicleEnabled={false} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Compro cosas en el camino/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.savePrefs).toHaveBeenCalled());
    expect(mocks.saveVehicles).not.toHaveBeenCalled();
  });
});
