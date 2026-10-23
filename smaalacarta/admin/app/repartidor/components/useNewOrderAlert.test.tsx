import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alarm: vi.fn(),
  speak: vi.fn(),
  unlock: vi.fn(),
  ctx: { state: "running" } as { state: string },
}));

vi.mock("@/lib/orders/sound", () => ({
  ALARM_LOOP_MS: 2500,
  playAlarmSound: mocks.alarm,
  playChosenSound: vi.fn(),
}));
vi.mock("@/lib/orders/sound-pref", () => ({
  sharedAudioContext: () => mocks.ctx,
  unlockSharedAudio: mocks.unlock,
}));
vi.mock("@/lib/orders/speech", () => ({
  cancelSpeech: vi.fn(),
  primeSpeech: vi.fn(),
  speakText: mocks.speak,
}));

import { useNewOrderAlert } from "./useNewOrderAlert";

type Order = { id: string; zona: string | null; pendiente: boolean };

const isPending = (order: Order) => order.pendiente;
const zoneOf = (order: Order) => order.zona;
const props = (orders: Order[]) => ({ orders, isPending, zoneOf, label: "Pedido disponible" });

// ENVIO-234, 235 y 240: el aviso del pedido nuevo con sonido y voz, y el sonido sin recuadro.
describe("aviso del pedido nuevo del repartidor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.alarm.mockClear();
    mocks.speak.mockClear();
    mocks.unlock.mockReset();
    mocks.unlock.mockResolvedValue(mocks.ctx);
    localStorage.clear();
  });

  async function ready(initial: Order[]) {
    const hook = renderHook((orders: Order[]) => useNewOrderAlert(props(orders)), { initialProps: initial });
    // El primer toque en cualquier lugar habilita el audio.
    await act(async () => {
      document.body.click();
    });
    return hook;
  }

  it("antes del primer toque muestra el aviso chico, y el toque lo saca y lo recuerda", async () => {
    const { result } = renderHook(() => useNewOrderAlert(props([])));
    expect(result.current.hint).toBe("Tocá la pantalla para activar el sonido");

    await act(async () => {
      document.body.click();
    });

    expect(result.current.hint).toBeNull();
    expect(result.current.audioReady).toBe(true);
    expect(localStorage.getItem("sma-courier-sound")).toBe("1");
  });

  it("un pedido nuevo suena al máximo, se repite y dice la zona; los que ya estaban no avisan", async () => {
    const old: Order = { id: "old", zona: "Oasis", pendiente: true };
    const { result, rerender } = await ready([old]);
    expect(result.current.alerts).toEqual([]);

    rerender([old, { id: "new", zona: "Cantera", pendiente: true }]);

    expect(result.current.alerts).toEqual([{ id: "new", zone: "Cantera" }]);
    expect(mocks.alarm).toHaveBeenCalledWith(mocks.ctx, 1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mocks.speak).toHaveBeenCalledWith("Nuevo envío a zona Cantera");

    mocks.alarm.mockClear();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(mocks.alarm).toHaveBeenCalledTimes(1);
  });

  it("'Visto' o tomar el pedido lo callan", async () => {
    const { result, rerender } = await ready([]);
    const order: Order = { id: "a", zona: "Cantera", pendiente: true };

    rerender([order]);
    expect(result.current.alerts).toHaveLength(1);

    act(() => result.current.dismissAlerts());
    expect(result.current.alerts).toEqual([]);

    rerender([order, { id: "b", zona: "Oasis", pendiente: true }]);
    expect(result.current.alerts).toHaveLength(1);

    rerender([order, { id: "b", zona: "Oasis", pendiente: false }]);
    expect(result.current.alerts).toEqual([]);
  });

  it("apagado con la campana no suena ni habla, y no se pide el toque", async () => {
    localStorage.setItem("sma-courier-sound", "0");
    const { result, rerender } = renderHook((orders: Order[]) => useNewOrderAlert(props(orders)), {
      initialProps: [] as Order[],
    });

    await act(async () => {
      document.body.click();
    });
    rerender([{ id: "a", zona: "Cantera", pendiente: true }]);

    expect(result.current.soundOn).toBe(false);
    expect(result.current.hint).toBeNull();
    expect(mocks.unlock).not.toHaveBeenCalled();
    expect(mocks.alarm).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
  });
});
