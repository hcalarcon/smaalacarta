import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStoredFlag } from "./use-stored-flag";

afterEach(() => {
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {}
});

describe("useStoredFlag — ADMIN-CONFIG-38", () => {
  it("arranca con el valor por defecto y recuerda lo que se elige", () => {
    const { result, unmount } = renderHook(() => useStoredFlag("sma-test", true));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    unmount();

    const again = renderHook(() => useStoredFlag("sma-test", true));
    expect(again.result.current[0]).toBe(false);
  });

  it("si localStorage tira error, funciona igual con el valor por defecto", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    const { result } = renderHook(() => useStoredFlag("sma-test2", true));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
