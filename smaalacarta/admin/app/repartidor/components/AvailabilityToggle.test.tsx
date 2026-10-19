import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AvailabilityToggle from "./AvailabilityToggle";
import type { AvailabilityStatus } from "@/lib/courier/availability";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), set: vi.fn(), handlers: [] as { table: string }[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({ setAvailableAction: mocks.set }));
vi.mock("@/lib/supabase-browser", () => ({
  createClient: () => {
    const channel = {
      on: (_type: string, filter: { table: string }) => {
        mocks.handlers.push({ table: filter.table });
        return channel;
      },
      subscribe: () => channel,
    };

    return { channel: () => channel, removeChannel: vi.fn() };
  },
}));

const OFF: AvailabilityStatus = { enabled: true, available: false, since: null, expiresAt: null };
// 15:30 UTC = 12:30 en Argentina.
const ON: AvailabilityStatus = {
  enabled: true,
  available: true,
  since: "2026-10-19T15:30:00+00:00",
  expiresAt: "2026-10-19T19:30:00+00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.length = 0;
  mocks.set.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe("el interruptor del repartidor — ENVIO-191", () => {
  it("apagado dice No disponible y no muestra la hora", () => {
    render(<AvailabilityToggle status={OFF} lang="es" />);

    expect(screen.getByRole("switch", { name: "No disponible" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(/Disponible desde/)).toBeNull();
  });

  it("prendido dice Estoy disponible y desde qué hora (hora argentina)", () => {
    render(<AvailabilityToggle status={ON} lang="es" />);

    expect(screen.getByRole("switch", { name: "Estoy disponible" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Disponible desde las 12:30")).toBeTruthy();
  });

  it("tocarlo manda el valor contrario y pide los datos nuevos", async () => {
    render(<AvailabilityToggle status={OFF} lang="es" />);

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(mocks.set).toHaveBeenCalledWith(true));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    // Se ve prendido enseguida, sin esperar a la base.
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("si falla, vuelve al estado anterior y avisa", async () => {
    mocks.set.mockResolvedValue({ ok: false, error: "x" });
    render(<AvailabilityToggle status={OFF} lang="es" />);

    fireEvent.click(screen.getByRole("switch"));

    expect((await screen.findByRole("alert")).textContent).toContain("No pudimos guardar el cambio");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("los textos van en inglés y en portugués", () => {
    const { unmount } = render(<AvailabilityToggle status={ON} lang="en" />);
    expect(screen.getByText("I'm available")).toBeTruthy();
    expect(screen.getByText("Available since 12:30")).toBeTruthy();
    unmount();

    render(<AvailabilityToggle status={OFF} lang="pt" />);
    expect(screen.getByText("Indisponível")).toBeTruthy();
  });

  it("se actualiza sola cuando cambia la disponibilidad de alguien (Realtime)", () => {
    render(<AvailabilityToggle status={OFF} lang="es" />);

    expect(mocks.handlers.map((h) => h.table)).toEqual(["courier_availability_pulse"]);
  });
});
