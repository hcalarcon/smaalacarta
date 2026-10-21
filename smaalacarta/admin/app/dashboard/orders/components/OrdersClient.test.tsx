import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrdersClient from "./OrdersClient";
import { acceptOrderAction, adjustPrepAction, setOrderStatusAction, setPrepAction } from "../actions";
import type { Order } from "@/lib/db/orders";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

const manualSetup = {
  businessName: "Ana Resto",
  slug: "ana",
  courier: false,
  menu: { items: [], delivery: [], payments: [] },
  delivery: { zones: [], favorite: null },
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({
  setOrderStatusAction: vi.fn(),
  acceptOrderAction: vi.fn(),
  setPrepAction: vi.fn(),
  adjustPrepAction: vi.fn(),
  assignCourierAction: vi.fn(),
  selfDeliveryAction: vi.fn(),
  confirmSettlementAction: vi.fn(),
}));
vi.mock("@/lib/orders/badge", () => ({
  setAppBadgeSafe: vi.fn(async () => undefined),
  clearAppBadgeSafe: vi.fn(async () => undefined),
  updateFavicon: vi.fn(),
  restoreFavicon: vi.fn(),
}));
vi.mock("./ManualOrderDialog", () => ({ default: () => null }));
vi.mock("./OrderDetailDialog", () => ({ default: () => null }));
vi.mock("./OrdersHistory", () => ({ default: () => null }));
vi.mock("./OrderCard", () => ({
  default: ({
    order,
    onAdvance,
    onSetPrep,
    onAdjust,
  }: {
    order: Order;
    onAdvance: (status: string) => void;
    onSetPrep: () => void;
    onAdjust: (delta: number, reason: string | null) => void;
  }) => (
    <div>
      pedido {order.id}
      <button onClick={() => onAdvance("confirmed")}>avanzar {order.id}</button>
      <button onClick={() => onAdvance("preparing")}>preparar {order.id}</button>
      <button onClick={onSetPrep}>poner tiempo {order.id}</button>
      <button onClick={() => onAdjust(-5, "busy")}>demorar {order.id}</button>
    </div>
  ),
}));

const PREF_KEY = "sma-orders-sound";

let oscillatorsStarted: number;
// Los volúmenes de cada tono: la alarma sube de volumen con la espera (ADMIN-PEDIDOS-26).
let rampVolumes: number[];
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
      linearRampToValueAtTime: vi.fn((volume: number) => {
        rampVolumes.push(volume);
      }),
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
      manualSetup={manualSetup}
      serverNow="2026-09-30T10:00:00Z"
    />
  );
}

const soundButton = () => screen.getByRole("button", { name: /sonido/i });

describe("repartidores disponibles ahora — ENVIO-200", () => {
  const withAvailability = (availability: { enabled: boolean; total: number; emptyZoneIds: string[] }) => (
    <OrdersClient
      slug="demo"
      orders={[order("1")]}
      manualSetup={manualSetup}
      serverNow="2026-09-30T10:00:00Z"
      availability={availability}
    />
  );

  it("muestra la cantidad, sin nombres", () => {
    render(withAvailability({ enabled: true, total: 3, emptyZoneIds: [] }));

    const chip = screen.getByRole("status");
    expect(chip.textContent).toBe("Repartidores disponibles ahora: 3");
    expect(chip.className).not.toContain("amber");
  });

  it("con 0, en ámbar: Ningún repartidor disponible", () => {
    render(withAvailability({ enabled: true, total: 0, emptyZoneIds: ["z1"] }));

    const chip = screen.getByRole("status");
    expect(chip.textContent).toBe("Ningún repartidor disponible");
    expect(chip.className).toContain("amber");
  });

  it("con el interruptor de la plataforma apagado, no se muestra nada", () => {
    render(withAvailability({ enabled: false, total: 0, emptyZoneIds: [] }));

    expect(screen.queryByRole("status")).toBeNull();
  });
});

beforeEach(() => {
  mocks.refresh.mockClear();
  document.title = "Pedidos";
  oscillatorsStarted = 0;
  rampVolumes = [];
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
  it("los pedidos que ya estaban al abrir no suenan hasta que la persona activa el sonido (autoplay)", async () => {
    render(board([order("1")]));
    await act(async () => {});
    expect(oscillatorsStarted).toBe(0);

    await act(async () => fireEvent.click(soundButton()));
    expect(oscillatorsStarted).toBeGreaterThan(0);
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
  it("con pendientes sin atender la alarma suena en bucle, sin esperar 30 s", async () => {
    vi.useFakeTimers();
    render(board([order("1")]));
    await act(async () => fireEvent.click(soundButton()));
    oscillatorsStarted = 0;

    await act(async () => vi.advanceTimersByTime(10_000));
    const first = oscillatorsStarted;
    expect(first).toBeGreaterThan(0);

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(oscillatorsStarted).toBeGreaterThan(first);
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

describe("título de la pestaña — ADMIN-PEDIDOS-12 y 27", () => {
  it("con pendientes parpadea entre el aviso y el título original y, sin ninguno, vuelve al original", async () => {
    vi.useFakeTimers();
    const { rerender } = render(board([order("1"), order("2")]));
    expect(document.title).toBe("(2) NUEVO PEDIDO");

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(document.title).toBe("Pedidos");

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(document.title).toBe("(2) NUEVO PEDIDO");

    rerender(board([order("1", "confirmed"), order("2", "confirmed")]));
    expect(document.title).toBe("Pedidos");

    await act(async () => vi.advanceTimersByTime(5_000));
    expect(document.title).toBe("Pedidos");
  });

  it("con prefers-reduced-motion no parpadea: queda fijo con la cantidad", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(board([order("1"), order("2")]));
    expect(document.title).toBe("(2) Nuevo pedido · Pedidos");

    await act(async () => vi.advanceTimersByTime(3_000));
    expect(document.title).toBe("(2) Nuevo pedido · Pedidos");
  });

  it("al salir del tablero restaura el título original", () => {
    const { unmount } = render(board([order("1")]));
    unmount();
    expect(document.title).toBe("Pedidos");
  });
});

describe("pantalla encendida — ADMIN-PEDIDOS-13", () => {
  let requests: number;
  let released: number;
  let locks: { released: boolean }[];

  function stubWakeLock() {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: vi.fn(async () => {
          requests += 1;
          const lock = { released: false, release: vi.fn(async () => { released += 1; }) };
          locks.push(lock);
          return lock;
        }),
      },
    });
  }

  beforeEach(() => {
    requests = 0;
    released = 0;
    locks = [];
    stubWakeLock();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "wakeLock");
    setVisibility("visible");
  });

  it("no la pide mientras el sonido está desactivado", async () => {
    render(board([]));
    await act(async () => {});
    expect(requests).toBe(0);
  });

  it("la pide al activar el sonido y la libera al desactivarlo", async () => {
    render(board([]));
    await act(async () => fireEvent.click(soundButton()));
    expect(requests).toBe(1);

    await act(async () => fireEvent.click(soundButton()));
    expect(released).toBe(1);
  });

  it("la vuelve a pedir cuando la pestaña vuelve a estar visible", async () => {
    render(board([]));
    await act(async () => fireEvent.click(soundButton()));

    // Al ocultarse, el navegador suelta el bloqueo por su cuenta.
    setVisibility("hidden");
    locks.forEach((lock) => (lock.released = true));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requests).toBe(1);

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requests).toBe(2);
  });

  it("la libera al salir de la página", async () => {
    const { unmount } = render(board([]));
    await act(async () => fireEvent.click(soundButton()));
    unmount();
    expect(released).toBe(1);
  });

  it("si el navegador no la soporta, el sonido se activa igual y sin errores", async () => {
    Reflect.deleteProperty(navigator, "wakeLock");
    render(board([]));
    await act(async () => fireEvent.click(soundButton()));
    expect(soundButton().textContent).toBe("🔔 Sonido activado");
  });

  it("avisa debajo del botón que hay que mantener la pantalla abierta", async () => {
    render(board([]));
    expect(screen.queryByText(/Mantené esta pantalla abierta/)).toBeNull();

    await act(async () => fireEvent.click(soundButton()));
    expect(screen.getByText("Mantené esta pantalla abierta para recibir avisos")).toBeTruthy();
  });
});

describe("estados de envío en el tablero — ENVIO-27", () => {
  const columnOf = (title: string) =>
    screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

  it("Entregado al repartidor y En camino van en Listos", () => {
    render(
      board([
        order("1", "pending"),
        order("2", "preparing"),
        order("3", "ready"),
        order("4", "handed_to_courier"),
        order("5", "on_the_way"),
      ]),
    );

    const listos = columnOf("Listos").textContent ?? "";
    expect(listos).toContain("pedido 3");
    expect(listos).toContain("pedido 4");
    expect(listos).toContain("pedido 5");
    expect(columnOf("En curso").textContent).not.toContain("pedido 4");
    expect(columnOf("Nuevos").textContent).not.toContain("pedido 5");
  });

  it("Entregado sale del tablero (va al historial)", () => {
    render(board([order("1", "delivered"), order("2", "on_the_way")]));

    for (const title of ["Nuevos", "En curso", "Listos"]) {
      expect(columnOf(title).textContent).not.toContain("pedido 1");
    }
    expect(columnOf("Listos").textContent).toContain("pedido 2");
  });
});

// --- Aviso fuerte de pedido nuevo -------------------------------------------------------------------

const full = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    status: "pending",
    source: "web",
    payment_status: "not_required",
    order_number: `00${id}`,
    customer_name: "Lucía",
    delivery: "retiro",
    total: 12500,
    created_at: "2026-09-30T10:00:00Z",
    order_items: [
      { name: "Milanesa", quantity: 2, unit_price: 5000, sort_order: 0, options: null },
      { name: "Flan", quantity: 1, unit_price: 2500, sort_order: 1, options: null },
    ],
    ...extra,
  }) as unknown as Order;

const modal = () => screen.queryByRole("alertdialog");

describe("tarjeta de pedido nuevo — ADMIN-PEDIDOS-24", () => {
  it("muestra el pedido sin atender a pantalla completa, con su resumen y los dos botones", () => {
    render(board([full("1")]));

    const card = modal()!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("NUEVO PEDIDO #001");
    expect(card.textContent).toContain("Lucía");
    expect(card.textContent).toContain("2 × Milanesa");
    expect(card.textContent).toContain("1 × Flan");
    expect(card.textContent).toMatch(/12.500/);
    expect(screen.getByRole("button", { name: "Aceptar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver pedidos" })).toBeTruthy();
  });

  it("no aparece sin pedidos sin atender: confirmados, manuales o de Mercado Pago sin pagar", () => {
    render(
      board([
        full("1", { status: "confirmed" }),
        full("2", { source: "manual" }),
        full("3", { payment_status: "awaiting" }),
      ]),
    );

    expect(modal()).toBeNull();
  });

  it("'Aceptar' abre el selector de tiempo en vez de confirmar de golpe — ADMIN-PEDIDOS-31", async () => {
    render(board([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));

    expect(screen.getByRole("dialog", { name: /Aceptar pedido #001/ })).toBeTruthy();
    expect(acceptOrderAction).not.toHaveBeenCalled();
    expect(setOrderStatusAction).not.toHaveBeenCalled();
  });

  it("con varios pendientes muestra el más viejo y cuántos más hay", () => {
    render(
      board([
        full("2", { created_at: "2026-09-30T10:05:00Z" }),
        full("1", { created_at: "2026-09-30T10:00:00Z" }),
        full("3", { created_at: "2026-09-30T10:09:00Z" }),
      ]),
    );

    expect(modal()!.textContent).toContain("NUEVO PEDIDO #001");
    expect(modal()!.textContent).toContain("2 pedidos más");
  });

  it("'Ver pedidos' la cierra y vuelve cuando llega otro pedido nuevo", async () => {
    const { rerender } = render(board([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ver pedidos" })));
    expect(modal()).toBeNull();

    rerender(board([full("1"), full("2", { created_at: "2026-09-30T10:03:00Z" })]));
    expect(modal()!.textContent).toContain("NUEVO PEDIDO #002");
  });

  it("desaparece sola cuando el pedido se atiende desde otro lado", () => {
    const { rerender } = render(board([full("1")]));
    expect(modal()).not.toBeNull();

    rerender(board([full("1", { status: "confirmed" })]));
    expect(modal()).toBeNull();
  });

  it("tiene nombre accesible y el foco queda en 'Aceptar'", () => {
    render(board([full("1")]));

    expect(modal()!.getAttribute("aria-modal")).toBe("true");
    expect(modal()!.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Aceptar" }));
  });
});

describe("tiempo de preparación al aceptar — ADMIN-PEDIDOS-31 a 33", () => {
  const accept = vi.mocked(acceptOrderAction);

  beforeEach(() => {
    vi.mocked(acceptOrderAction).mockReset().mockResolvedValue({ ok: true } as never);
    vi.mocked(setPrepAction).mockReset().mockResolvedValue({ ok: true } as never);
    vi.mocked(adjustPrepAction).mockReset().mockResolvedValue({ ok: true } as never);
    vi.mocked(setOrderStatusAction).mockReset().mockResolvedValue({ ok: true } as never);
  });

  const picker = () => screen.queryByRole("dialog", { name: /pedido #/i });

  function withPrep(orders: Order[], extra: { suggested?: number | null; defaultMinutes?: number } = {}) {
    return (
      <OrdersClient
        slug="demo"
        orders={orders}
        manualSetup={manualSetup}
        serverNow="2026-09-30T10:00:00Z"
        suggestedPrepMinutes={extra.suggested ?? null}
        defaultPrepMinutes={extra.defaultMinutes ?? 20}
      />
    );
  }

  function withCar(orders: Order[], vehicleEnabled: boolean) {
    return (
      <OrdersClient
        slug="demo"
        orders={orders}
        manualSetup={manualSetup}
        serverNow="2026-09-30T10:00:00Z"
        vehicleEnabled={vehicleEnabled}
      />
    );
  }

  it("Necesita auto: con el interruptor prendido y un envío con repartidor, se acepta pidiendo auto — ENVIO-176", async () => {
    render(withCar([full("1", { courier_status: "waiting" })], true));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    fireEvent.click(screen.getByRole("checkbox", { name: /Necesita auto/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Aceptar con/ })));

    expect(accept).toHaveBeenCalledWith("1", expect.any(Number), true);
  });

  it("Necesita auto no aparece con el interruptor apagado ni en un pedido sin envío con repartidor — ENVIO-175", async () => {
    const { unmount } = render(withCar([full("1", { courier_status: "waiting" })], false));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    expect(screen.queryByRole("checkbox", { name: /Necesita auto/ })).toBeNull();
    unmount();

    render(withCar([full("2")], true));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    expect(screen.queryByRole("checkbox", { name: /Necesita auto/ })).toBeNull();
  });

  it("el modal de pedido nuevo abre el selector con la sugerencia y acepta de un toque", async () => {
    render(withPrep([full("1")], { suggested: 22 }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    expect(screen.getByText("Sugerido: 22 min según tus últimos pedidos")).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar con 22 min" })));

    expect(accept).toHaveBeenCalledWith("1", 22, false);
    expect(picker()).toBeNull();
  });

  it("al aceptar, el cartel de pedido nuevo se va en el momento, sin esperar al servidor (ADMIN-PEDIDOS-58)", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    accept.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)) as never);
    render(withPrep([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Aceptar con/ })));

    // La acción sigue en vuelo y el pedido sigue "pending" en las props: el cartel ya no está.
    expect(modal()).toBeNull();

    await act(async () => finish({ ok: true }));
    expect(modal()).toBeNull();
  });

  it("si aceptar falla, el cartel vuelve y se muestra el error (ADMIN-PEDIDOS-58)", async () => {
    accept.mockResolvedValueOnce({ ok: false, error: "No se pudo" } as never);
    render(withPrep([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Aceptar con/ })));

    expect(screen.getAllByText("No se pudo")).toBeTruthy();
  });

  it("con el selector abierto la tarjeta de pedido nuevo no queda debajo: un solo diálogo (ENVIO-168)", async () => {
    render(withPrep([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));

    expect(picker()).toBeTruthy();
    expect(modal()).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
  });

  it("dos toques en Aceptar dejan un solo selector y no aceptan nada (ENVIO-171)", async () => {
    render(withPrep([full("1")]));
    const button = screen.getByRole("button", { name: "Aceptar" });

    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(accept).not.toHaveBeenCalled();
  });

  it("dos toques en el botón de la tarjeta del tablero dejan un solo selector (ENVIO-171)", async () => {
    render(withPrep([full("1", { created_at: "2026-09-30T10:00:00Z" })]));
    fireEvent.click(screen.getByRole("button", { name: "Ver pedidos" }));
    const button = screen.getByRole("button", { name: "avanzar 1" });

    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("sin sugerencia ofrece el tiempo por defecto del negocio", async () => {
    render(withPrep([full("1")], { defaultMinutes: 35 }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar con 35 min" })));

    expect(accept).toHaveBeenCalledWith("1", 35, false);
  });

  it("'Aceptar sin tiempo' confirma sin minutos", async () => {
    render(withPrep([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar sin tiempo" })));

    expect(accept).toHaveBeenCalledWith("1", null, false);
  });

  it("el botón de la tarjeta del tablero abre el mismo selector", async () => {
    render(withPrep([full("1", { created_at: "2026-09-30T10:00:00Z" })]));
    fireEvent.click(screen.getByRole("button", { name: "Ver pedidos" }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "avanzar 1" })));

    expect(picker()).toBeTruthy();
    expect(setOrderStatusAction).not.toHaveBeenCalled();
  });

  it("un pedido programado o anticipado se confirma directo, sin selector", async () => {
    render(withPrep([full("1", { scheduled_for: "2026-09-30T23:00:00Z" })]));
    fireEvent.click(screen.queryByRole("button", { name: "Ver pedidos" }) ?? document.body);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "avanzar 1" })));

    expect(picker()).toBeNull();
    expect(setOrderStatusAction).toHaveBeenCalledWith("1", "confirmed", undefined, "pending");
  });

  it("otros pasos de estado no pasan por el selector", async () => {
    render(withPrep([full("1", { status: "confirmed" })]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "preparar 1" })));

    expect(picker()).toBeNull();
    expect(setOrderStatusAction).toHaveBeenCalledWith("1", "preparing", undefined, "confirmed");
  });

  it("un pedido aceptado sin tiempo lo carga después, sin 'Aceptar sin tiempo'", async () => {
    render(withPrep([full("1", { status: "confirmed" })], { defaultMinutes: 20 }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "poner tiempo 1" })));
    expect(screen.queryByRole("button", { name: "Aceptar sin tiempo" })).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar 20 min" })));

    expect(setPrepAction).toHaveBeenCalledWith("1", 20, null);
    expect(accept).not.toHaveBeenCalled();
  });

  it("cambiar la demora llama a la acción con el salto y el motivo", async () => {
    render(withPrep([full("1", { status: "confirmed" })]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "demorar 1" })));

    expect(adjustPrepAction).toHaveBeenCalledWith("1", -5, "busy");
  });

  it("arranca con el último tiempo que usó el local, y lo guarda al aceptar — ADMIN-PEDIDOS-52", async () => {
    window.localStorage.removeItem("sma:prep-last:demo");
    const { unmount } = render(withPrep([full("1")], { suggested: 22 }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    fireEvent.click(screen.getByRole("button", { name: "45 min" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar con 45 min" })));
    expect(window.localStorage.getItem("sma:prep-last:demo")).toBe("45");
    unmount();

    render(withPrep([full("2")], { suggested: 22 }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));

    expect(screen.getByRole("button", { name: "Aceptar con 45 min" })).toBeTruthy();
    expect(screen.getByText("Último que usaste: 45 min")).toBeTruthy();
    window.localStorage.removeItem("sma:prep-last:demo");
  });

  it("dos toques seguidos en Aceptar piden aceptar una sola vez y muestran 'Aceptando…' — ADMIN-PEDIDOS-51", async () => {
    let finish!: (value: { ok: true }) => void;
    accept.mockReturnValue(new Promise((resolve) => (finish = resolve)) as never);
    render(withPrep([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    const button = screen.getByRole("button", { name: /Aceptar con/ });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(accept).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: /Aceptando/ }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finish({ ok: true }));
  });

  it("si falla, el selector sigue abierto y dice por qué", async () => {
    accept.mockResolvedValue({ ok: false, error: "Tu cuenta está suspendida." } as never);
    render(withPrep([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar con 20 min" })));

    expect(picker()).toBeTruthy();
    expect(screen.getAllByRole("alert").some((node) => /suspendida/.test(node.textContent ?? ""))).toBe(true);
  });

  it("si el pedido ya quedó confirmado, el selector se cierra y el aviso queda en pantalla", async () => {
    accept.mockResolvedValue({ ok: false, error: "El pedido se aceptó, pero no pudimos guardar el tiempo." } as never);
    const { rerender } = render(withPrep([full("1")]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aceptar con 20 min" })));
    rerender(withPrep([full("1", { status: "confirmed" })]));

    expect(picker()).toBeNull();
    expect(screen.getByText(/se aceptó, pero no pudimos guardar el tiempo/)).toBeTruthy();
  });
});

describe("alarma, silenciar y voz — ADMIN-PEDIDOS-25 a 27", () => {
  let spoken: string[];

  beforeEach(() => {
    spoken = [];
    class Utterance {
      lang = "";
      constructor(public text: string) {}
    }
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    vi.stubGlobal("speechSynthesis", {
      speak: (utterance: { text: string }) => spoken.push(utterance.text),
      cancel: vi.fn(),
    });
  });

  it("no suena ni habla mientras la persona no activó el sonido (autoplay)", async () => {
    vi.useFakeTimers();
    render(board([full("1")]));

    await act(async () => vi.advanceTimersByTime(120_000));
    expect(oscillatorsStarted).toBe(0);
    expect(spoken).toEqual([]);
  });

  it("al activar el sonido dice 'Nuevo pedido' y lo repite cada 30 s mientras haya pendientes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T10:00:10Z"));
    render(board([full("1")]));
    await act(async () => fireEvent.click(soundButton()));
    expect(spoken).toEqual(["Nuevo pedido"]);

    await act(async () => vi.advanceTimersByTime(29_000));
    expect(spoken).toHaveLength(1);

    await act(async () => vi.advanceTimersByTime(2_000));
    expect(spoken).toHaveLength(2);
  });

  it("sin la API de voz el sonido sigue andando", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    render(board([full("1")]));

    await act(async () => fireEvent.click(soundButton()));
    expect(oscillatorsStarted).toBeGreaterThan(0);
  });

  it("la alarma sube de volumen a los 60 s sin atender", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T10:00:30Z"));
    render(board([full("1", { created_at: "2026-09-30T10:00:00Z" })]));
    await act(async () => fireEvent.click(soundButton()));

    const early = Math.max(...rampVolumes);
    rampVolumes = [];

    await act(async () => vi.advanceTimersByTime(35_000));
    expect(rampVolumes.length).toBeGreaterThan(0);
    expect(Math.max(...rampVolumes)).toBeGreaterThan(early);
  });

  it("'Silenciar' calla el sonido y la voz 5 minutos, pero deja el título y la tarjeta", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T10:00:10Z"));
    render(board([full("1")]));
    await act(async () => fireEvent.click(soundButton()));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Silenciar/ })));
    oscillatorsStarted = 0;
    spoken = [];

    await act(async () => vi.advanceTimersByTime(4 * 60_000 + 50_000));
    expect(oscillatorsStarted).toBe(0);
    expect(spoken).toEqual([]);
    expect(document.title).toMatch(/NUEVO PEDIDO|^Pedidos$/);
    expect(modal()).not.toBeNull();
    expect(screen.getByRole("button", { name: /Silenciado/ })).toBeTruthy();

    await act(async () => vi.advanceTimersByTime(15_000));
    expect(oscillatorsStarted).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Silenciar/ })).toBeTruthy();
  });
});

describe("globito de pendientes — ADMIN-PEDIDOS-28", () => {
  it("lleva la cantidad sin atender al favicon y a la app instalada, y lo saca al atenderlos", async () => {
    const badge = await import("@/lib/orders/badge");
    const { rerender, unmount } = render(board([full("1"), full("2"), full("3", { status: "confirmed" })]));

    expect(badge.updateFavicon).toHaveBeenLastCalledWith(2);
    expect(badge.setAppBadgeSafe).toHaveBeenLastCalledWith(2);

    rerender(board([full("1", { status: "confirmed" }), full("2", { status: "confirmed" })]));
    expect(badge.updateFavicon).toHaveBeenLastCalledWith(0);
    expect(badge.setAppBadgeSafe).toHaveBeenLastCalledWith(0);

    unmount();
    expect(badge.clearAppBadgeSafe).toHaveBeenCalled();
    expect(badge.restoreFavicon).toHaveBeenCalled();
  });
});

// ADMIN-PEDIDOS-54: lo urgente primero y las columnas como pestañas en el celular.
describe("tablero por urgencia y pestañas — ADMIN-PEDIDOS-54", () => {
  const columnOf = (title: string) =>
    screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

  const kitchen = (id: string, readyAt: string | null) =>
    ({ ...order(id, "confirmed"), prep_ready_at: readyAt, scheduled_for: null, preorder: false }) as unknown as Order;

  it("en curso: el atrasado va primero aunque haya llegado después", () => {
    render(board([kitchen("1", "2026-09-30T10:40:00Z"), kitchen("2", "2026-09-30T09:50:00Z")]));

    const text = columnOf("En curso").textContent ?? "";
    expect(text.indexOf("pedido 2")).toBeLessThan(text.indexOf("pedido 1"));
  });

  it("el título dice cuántos son urgentes", () => {
    render(board([kitchen("1", "2026-09-30T10:40:00Z"), kitchen("2", "2026-09-30T09:50:00Z")]));

    expect(within(columnOf("En curso")).getByText("1 urgente")).toBeTruthy();
    expect(within(columnOf("Nuevos")).queryByText(/urgente/)).toBeNull();
  });

  it("las pestañas muestran cada columna con su contador y cambian la que se ve", () => {
    render(board([order("1", "pending"), order("2", "confirmed"), order("3", "confirmed")]));

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Nuevos1", "En curso2", "Listos0"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(columnOf("En curso").className).toContain("hidden");

    fireEvent.click(tabs[1]);

    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(columnOf("En curso").className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(columnOf("Nuevos").className).toMatch(/(^|\s)hidden(\s|$)/);
  });
});
