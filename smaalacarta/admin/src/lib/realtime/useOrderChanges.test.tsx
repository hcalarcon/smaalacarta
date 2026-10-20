import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = () => void;

const state = vi.hoisted(() => ({
  handlers: [] as { table: string; handler: Handler }[],
  removed: 0,
  throwOnCreate: false,
}));

vi.mock("@/lib/supabase-browser", () => ({
  createClient: () => {
    if (state.throwOnCreate) throw new Error("sin variables");

    const channel = {
      on: (_type: string, filter: { table: string }, handler: Handler) => {
        state.handlers.push({ table: filter.table, handler });
        return channel;
      },
      subscribe: () => channel,
    };

    return {
      channel: () => channel,
      removeChannel: () => {
        state.removed += 1;
      },
    };
  },
}));

import { useCourierOrderChanges, useOrderChanges } from "./useOrderChanges";

function Probe({ onChange }: { onChange: () => void }) {
  useOrderChanges(onChange);
  return null;
}

function CourierProbe({ onChange }: { onChange: () => void }) {
  useCourierOrderChanges(onChange);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.handlers = [];
  state.removed = 0;
  state.throwOnCreate = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("cambios del repartidor en tiempo real — ENVIO-209", () => {
  it("escucha su pulso de pedidos, sus ofertas y la disponibilidad, y no `orders` (no le llega por el RLS)", () => {
    render(<CourierProbe onChange={vi.fn()} />);

    expect(state.handlers.map((entry) => entry.table).sort()).toEqual([
      "courier_availability_pulse",
      "courier_offers",
      "courier_order_pulse",
    ]);
  });

  it("un pulso vuelve a pedir los datos, juntando los que llegan casi a la vez", () => {
    const onChange = vi.fn();
    render(<CourierProbe onChange={onChange} />);

    const pulse = state.handlers.find((entry) => entry.table === "courier_order_pulse")!;
    act(() => {
      pulse.handler();
      pulse.handler();
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("cambios de pedidos en tiempo real — ENVIO-172", () => {
  it("escucha los pedidos, las ofertas y la disponibilidad de los repartidores", () => {
    render(<Probe onChange={vi.fn()} />);

    expect(state.handlers.map((entry) => entry.table).sort()).toEqual([
      "courier_availability_pulse",
      "courier_offers",
      "orders",
    ]);
  });

  it("un cambio dispara una sola actualización aunque lleguen varios seguidos", () => {
    const onChange = vi.fn();
    render(<Probe onChange={onChange} />);

    act(() => {
      state.handlers[0].handler();
      state.handlers[1].handler();
      state.handlers[0].handler();
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("al desmontar cierra el canal y no actualiza más", () => {
    const onChange = vi.fn();
    const view = render(<Probe onChange={onChange} />);

    act(() => state.handlers[0].handler());
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(state.removed).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("si no se puede abrir el canal no rompe la pantalla (queda la consulta periódica)", () => {
    state.throwOnCreate = true;

    expect(() => render(<Probe onChange={vi.fn()} />)).not.toThrow();
  });
});
