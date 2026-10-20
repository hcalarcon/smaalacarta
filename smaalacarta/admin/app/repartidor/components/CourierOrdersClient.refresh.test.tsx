import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CourierOrdersClient from "./CourierOrdersClient";

// El router de Next es el mismo objeto en cada render.
const mocks = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh }, connected: false };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/realtime/useOrderChanges", () => ({
  useCourierOrderChanges: () => mocks.connected,
}));
vi.mock("../actions", () => ({}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refresh.mockClear();
  // jsdom no se declara visible: el respaldo solo corre con la pestaña a la vista.
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Cada vuelta de la hora del servidor hace de respuesta: libera el refresco en camino.
function panel(serverNow: string) {
  return <CourierOrdersClient orders={[]} available={[]} serverNow={serverNow} />;
}

function run(connected: boolean, ms: number) {
  mocks.connected = connected;
  const view = render(panel("2026-10-20T00:00:00.000Z"));
  for (let t = 1; t <= ms / 1000; t += 1) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    view.rerender(panel(`2026-10-20T00:00:${String(t).padStart(2, "0")}.000Z`));
  }
}

describe("respaldo del panel del repartidor — ENVIO-210", () => {
  it("sin Realtime consulta cada 5 segundos", () => {
    run(false, 20_000);

    expect(mocks.refresh).toHaveBeenCalledTimes(4);
  });

  it("con Realtime conectado no hay tick de 5 segundos: el pulso no espera a ningún refresco del respaldo", () => {
    run(true, 20_000);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("con Realtime conectado queda una red de seguridad lenta, cada 30 segundos", () => {
    run(true, 30_000);

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
