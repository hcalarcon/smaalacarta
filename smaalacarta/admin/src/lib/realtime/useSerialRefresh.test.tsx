import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { useSerialRefresh } from "./useSerialRefresh";

const probe: { refresh: () => void } = { refresh: () => {} };

// `signal` hace de la hora del servidor: cambia cuando llegan datos nuevos.
function Probe({ signal }: { signal: string }) {
  const refresh = useSerialRefresh(signal);
  useEffect(() => {
    probe.refresh = refresh;
  });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("refrescos en serie — ENVIO-210", () => {
  it("mientras un refresco sigue en camino, los demás no lanzan otro", () => {
    render(<Probe signal="a" />);

    act(() => {
      probe.refresh();
      probe.refresh();
      vi.advanceTimersByTime(5000);
      probe.refresh();
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("cuando llegan los datos nuevos sale una sola vez lo que quedó pendiente", () => {
    const view = render(<Probe signal="a" />);

    act(() => {
      probe.refresh();
      probe.refresh();
      probe.refresh();
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    view.rerender(<Probe signal="b" />);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);

    view.rerender(<Probe signal="c" />);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("con los datos al día, el siguiente pedido sale enseguida", () => {
    const view = render(<Probe signal="a" />);

    act(() => probe.refresh());
    view.rerender(<Probe signal="b" />);
    act(() => probe.refresh());

    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("si la respuesta no llega, se libera a los 10 segundos", () => {
    render(<Probe signal="a" />);

    act(() => probe.refresh());
    act(() => {
      vi.advanceTimersByTime(10_000);
      probe.refresh();
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
});
