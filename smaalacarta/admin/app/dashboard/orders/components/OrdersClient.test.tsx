import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrdersClient from "./OrdersClient";
import type { Order } from "@/lib/db/orders";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({ setOrderStatusAction: vi.fn() }));
vi.mock("./ManualOrderDialog", () => ({ default: () => null }));
vi.mock("./OrderDetailDialog", () => ({ default: () => null }));
vi.mock("./OrdersHistory", () => ({ default: () => null }));
vi.mock("./OrderCard", () => ({
  default: ({ order }: { order: Order }) => <div>pedido {order.id}</div>,
}));

const PREF_KEY = "sma-orders-sound";

let oscillatorsStarted: number;
let contextState: "running" | "suspended";

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  get state() {
    return contextState;
  }
  resume = vi.fn(async () => {
    contextState = "running";
  });
  createGain = () => ({
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  });
  createOscillator = () => ({
    frequency: { setValueAtTime: vi.fn(), value: 0 },
    type: "sine",
    connect: vi.fn(),
    start: () => {
      oscillatorsStarted += 1;
    },
    stop: vi.fn(),
  });
}

const order = (id: string, status = "pending") =>
  ({ id, status, created_at: `2026-09-30T10:0${id}:00Z` }) as unknown as Order;

function board(orders: Order[]) {
  return (
    <OrdersClient
      slug="demo"
      orders={orders}
      products={[]}
      serverNow="2026-09-30T10:00:00Z"
    />
  );
}

const soundButton = () => screen.getByRole("button", { name: /sonido/i });

beforeEach(() => {
  mocks.refresh.mockClear();
  document.title = "Pedidos";
  oscillatorsStarted = 0;
  contextState = "suspended";
  localStorage.clear();
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("aviso de pedidos nuevos — ADMIN-PEDIDOS-8 y 9", () => {
  it("no suena por los pedidos que ya estaban al abrir el tablero", async () => {
    render(board([order("1")]));
    await act(async () => fireEvent.click(soundButton()));
    oscillatorsStarted = 0; // descarta el sonido de prueba

    await act(async () => {});
    expect(oscillatorsStarted).toBe(0);
  });

  it("suena una sola vez cuando aparecen pedidos pendientes nuevos", async () => {
    const { rerender } = render(board([order("1")]));
    await act(async () => fireEvent.click(soundButton()));
    oscillatorsStarted = 0;

    rerender(board([order("1"), order("2"), order("3")]));
    const perSound = oscillatorsStarted;
    expect(perSound).toBeGreaterThan(0);

    // Un refresco más con los mismos pedidos no repite el aviso.
    rerender(board([order("1"), order("2"), order("3")]));
    expect(oscillatorsStarted).toBe(perSound);
  });

  it("no suena si el sonido no está activado", () => {
    const { rerender } = render(board([order("1")]));
    rerender(board([order("1"), order("2")]));
    expect(oscillatorsStarted).toBe(0);
  });

  it("no suena por un pedido nuevo que no está pendiente", async () => {
    const { rerender } = render(board([order("1")]));
    await act(async () => fireEvent.click(soundButton()));
    oscillatorsStarted = 0;

    rerender(board([order("1"), order("2", "confirmed")]));
    expect(oscillatorsStarted).toBe(0);
  });

  it("al activar el sonido suena una prueba y el botón lo dice", async () => {
    render(board([]));
    expect(soundButton().textContent).toBe("🔔 Activar sonido");

    await act(async () => fireEvent.click(soundButton()));

    expect(oscillatorsStarted).toBeGreaterThan(0);
    expect(soundButton().textContent).toBe("🔔 Sonido activado");
    expect(localStorage.getItem(PREF_KEY)).toBe("1");
  });

  it("tocarlo de nuevo lo desactiva", async () => {
    render(board([]));
    await act(async () => fireEvent.click(soundButton()));
    await act(async () => fireEvent.click(soundButton()));

    expect(soundButton().textContent).toBe("🔔 Activar sonido");
    expect(localStorage.getItem(PREF_KEY)).toBe("0");
  });

  it("tras recargar con el sonido activado pide tocar de nuevo, porque el navegador lo exige", async () => {
    localStorage.setItem(PREF_KEY, "1");
    render(board([]));
    await act(async () => {});

    expect(soundButton().textContent).toBe("🔕 Tocá para activar el sonido");

    await act(async () => fireEvent.click(soundButton()));
    expect(soundButton().textContent).toBe("🔔 Sonido activado");
  });

  it("el botón mide al menos 44 px de alto", () => {
    render(board([]));
    expect(soundButton().className).toContain("min-h-11");
  });
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("consulta con la pestaña oculta — ADMIN-PEDIDOS-10", () => {
  afterEach(() => setVisibility("visible"));

  it("con sonido activado sigue consultando cada 20 s aunque esté oculta", async () => {
    vi.useFakeTimers();
    render(board([]));
    await act(async () => fireEvent.click(soundButton()));
    setVisibility("hidden");

    await act(async () => vi.advanceTimersByTime(20_000));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("sin sonido no consulta con la pestaña oculta", async () => {
    vi.useFakeTimers();
    render(board([]));
    setVisibility("hidden");

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("al salir del tablero deja de consultar", async () => {
    vi.useFakeTimers();
    const { unmount } = render(board([]));
    await act(async () => fireEvent.click(soundButton()));
    setVisibility("hidden");
    unmount();

    await act(async () => vi.advanceTimersByTime(120_000));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("repetir el aviso — ADMIN-PEDIDOS-11", () => {
  it("con pendientes sin atender repite el sonido cada 30 s", async () => {
    vi.useFakeTimers();
    render(board([order("1")]));
    await act(async () => fireEvent.click(soundButton()));
    const perSound = oscillatorsStarted; // sonido de prueba
    oscillatorsStarted = 0;

    await act(async () => vi.advanceTimersByTime(29_000));
    expect(oscillatorsStarted).toBe(0);

    await act(async () => vi.advanceTimersByTime(6_000));
    expect(oscillatorsStarted).toBe(perSound);
  });

  it("deja de repetir cuando no queda ningún pendiente", async () => {
    vi.useFakeTimers();
    const { rerender } = render(board([order("1")]));
    await act(async () => fireEvent.click(soundButton()));
    rerender(board([order("1", "confirmed")]));
    oscillatorsStarted = 0;

    await act(async () => vi.advanceTimersByTime(120_000));
    expect(oscillatorsStarted).toBe(0);
  });

  it("sin sonido activado no repite", async () => {
    vi.useFakeTimers();
    render(board([order("1")]));

    await act(async () => vi.advanceTimersByTime(120_000));
    expect(oscillatorsStarted).toBe(0);
  });
});

describe("título de la pestaña — ADMIN-PEDIDOS-12", () => {
  it("con pendientes lleva la cantidad y, sin ninguno, vuelve al original", () => {
    const { rerender } = render(board([order("1"), order("2")]));
    expect(document.title).toBe("(2) Nuevo pedido · Pedidos");

    rerender(board([order("1", "confirmed"), order("2", "confirmed")]));
    expect(document.title).toBe("Pedidos");
  });

  it("al salir del tablero restaura el título original", () => {
    const { unmount } = render(board([order("1")]));
    unmount();
    expect(document.title).toBe("Pedidos");
  });
});
