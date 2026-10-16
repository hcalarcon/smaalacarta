import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VehicleSwitchCard from "./VehicleSwitchCard";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), setSwitch: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({ setVehicleSwitchAction: mocks.setSwitch }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setSwitch.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

// ENVIO-175
describe("el interruptor del vehículo del repartidor", () => {
  it("dice qué hace y refleja si está apagado", () => {
    render(<VehicleSwitchCard enabled={false} />);

    const toggle = screen.getByRole("switch", { name: /Vehículo del repartidor \(moto\/auto\)/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Apagado: no se ve ni filtra nada/i)).toBeTruthy();
  });

  it("prender guarda y refresca", async () => {
    render(<VehicleSwitchCard enabled={false} />);

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(mocks.setSwitch).toHaveBeenCalledWith(true));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("apagar guarda false", async () => {
    render(<VehicleSwitchCard enabled />);

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(mocks.setSwitch).toHaveBeenCalledWith(false));
  });

  it("si no se pudo guardar, lo dice", async () => {
    mocks.setSwitch.mockResolvedValue({ ok: false, error: "No pudimos guardar el cambio. Probá de nuevo." });
    render(<VehicleSwitchCard enabled={false} />);

    fireEvent.click(screen.getByRole("switch"));

    expect((await screen.findByRole("alert")).textContent).toMatch(/No pudimos guardar/);
  });
});
