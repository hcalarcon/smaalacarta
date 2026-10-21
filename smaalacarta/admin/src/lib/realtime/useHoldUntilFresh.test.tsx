import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHoldUntilFresh } from "./useHoldUntilFresh";

afterEach(() => vi.useRealTimers());

// ADMIN-PEDIDOS-60: un pedido con una acción que salió bien sigue ocupado hasta que llegan datos nuevos.
describe("useHoldUntilFresh", () => {
  it("nada está retenido al empezar", () => {
    const { result } = renderHook(({ fresh }) => useHoldUntilFresh(fresh), { initialProps: { fresh: "t1" } });

    expect(result.current.holding("a")).toBe(false);
  });

  it("retiene solo el pedido pedido, hasta que cambian los datos", () => {
    const { result, rerender } = renderHook(({ fresh }) => useHoldUntilFresh(fresh), { initialProps: { fresh: "t1" } });

    act(() => result.current.hold("a"));
    expect(result.current.holding("a")).toBe(true);
    expect(result.current.holding("b")).toBe(false);

    rerender({ fresh: "t1" });
    expect(result.current.holding("a")).toBe(true);

    rerender({ fresh: "t2" });
    expect(result.current.holding("a")).toBe(false);
  });

  it("si los datos nuevos nunca llegan, a los 10 segundos se libera", () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ fresh }) => useHoldUntilFresh(fresh), { initialProps: { fresh: "t1" } });

    act(() => result.current.hold("a"));
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(result.current.holding("a")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.holding("a")).toBe(false);
  });

  it("se puede soltar a mano (la acción falló)", () => {
    const { result } = renderHook(({ fresh }) => useHoldUntilFresh(fresh), { initialProps: { fresh: "t1" } });

    act(() => result.current.hold("a"));
    act(() => result.current.release());

    expect(result.current.holding("a")).toBe(false);
  });
});
