import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeliveryModeCard from "./DeliveryModeCard";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), setMode: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({ setDeliveryModeAction: mocks.setMode }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setMode.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

// ENVIO-152
describe("el interruptor del modo de envíos", () => {
  it("muestra los dos modos con su explicación y marca el activo", () => {
    render(<DeliveryModeCard mode="fixed" searching={0} />);

    const fixed = screen.getByRole("radio", { name: /Precio fijo/ });
    const offers = screen.getByRole("radio", { name: /Ofertas/ });
    expect(fixed.getAttribute("aria-checked")).toBe("true");
    expect(offers.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/primer repartidor que toma el pedido/i)).toBeTruthy();
    expect(screen.getByText(/el cliente elige/i)).toBeTruthy();
  });

  it("cuenta los pedidos que están buscando", () => {
    const { rerender } = render(<DeliveryModeCard mode="fixed" searching={0} />);
    expect(screen.getByText(/no hay pedidos buscando/i)).toBeTruthy();

    rerender(<DeliveryModeCard mode="fixed" searching={1} />);
    expect(screen.getByText(/hay 1 pedido buscando/i)).toBeTruthy();

    rerender(<DeliveryModeCard mode="fixed" searching={4} />);
    expect(screen.getByText(/hay 4 pedidos buscando/i)).toBeTruthy();
  });

  it("cambiar pide confirmar y no guarda hasta que se confirma", async () => {
    render(<DeliveryModeCard mode="fixed" searching={2} />);

    fireEvent.click(screen.getByRole("radio", { name: /Ofertas/ }));

    expect(
      screen.getByText(/Los pedidos en curso siguen con el modo anterior\. Los nuevos usan Ofertas\./),
    ).toBeTruthy();
    expect(mocks.setMode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));

    await waitFor(() => expect(mocks.setMode).toHaveBeenCalledWith("offers"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("cancelar el diálogo no cambia nada", () => {
    render(<DeliveryModeCard mode="fixed" searching={0} />);

    fireEvent.click(screen.getByRole("radio", { name: /Ofertas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mocks.setMode).not.toHaveBeenCalled();
    expect(screen.queryByText(/siguen con el modo anterior/)).toBeNull();
  });

  it("tocar el modo que ya está activo no abre nada", () => {
    render(<DeliveryModeCard mode="offers" searching={0} />);

    fireEvent.click(screen.getByRole("radio", { name: /Ofertas/ }));

    expect(screen.queryByText(/siguen con el modo anterior/)).toBeNull();
  });

  it("si falla, lo dice", async () => {
    mocks.setMode.mockResolvedValue({ ok: false, error: "No pudimos guardar el cambio. Probá de nuevo." });
    render(<DeliveryModeCard mode="fixed" searching={0} />);

    fireEvent.click(screen.getByRole("radio", { name: /Ofertas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/No pudimos guardar/));
  });
});
