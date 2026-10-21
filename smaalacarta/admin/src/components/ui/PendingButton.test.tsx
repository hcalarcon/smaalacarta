import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PendingButton from "./PendingButton";

afterEach(cleanup);

// Una promesa que se resuelve a mano, para ver el botón mientras espera.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("botón con espera — ADMIN-PEDIDOS-51", () => {
  it("mientras espera queda deshabilitado, con el texto en gerundio, y no se puede tocar de nuevo", async () => {
    const wait = deferred();
    const onClick = vi.fn(() => wait.promise);

    render(
      <PendingButton onClick={onClick} pendingLabel="Aceptando…">
        Aceptar
      </PendingButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    fireEvent.click(screen.getByRole("button", { name: /Aceptando/ }));

    const button = screen.getByRole("button", { name: /Aceptando/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => wait.resolve());

    expect(screen.getByRole("button", { name: "Aceptar" })).toBeTruthy();
  });

  it("dos toques en el mismo instante llaman una sola vez, aunque la acción no devuelva una promesa (ENVIO-168)", () => {
    const onClick = vi.fn(() => undefined);

    render(<PendingButton onClick={onClick} pendingLabel="Aceptando…">Aceptar</PendingButton>);

    const button = screen.getByRole("button", { name: "Aceptar" });
    act(() => {
      button.click();
      button.click();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("dos toques en el mismo instante con una acción que devuelve promesa llaman una sola vez (ENVIO-168)", () => {
    const wait = deferred();
    const onClick = vi.fn(() => wait.promise);

    render(<PendingButton onClick={onClick} pendingLabel="Aceptando…">Aceptar</PendingButton>);

    const button = screen.getByRole("button", { name: "Aceptar" });
    act(() => {
      button.click();
      button.click();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("si la acción falla vuelve a estar activo", async () => {
    const onClick = vi.fn(() => Promise.reject(new Error("falló")));

    render(
      <PendingButton onClick={onClick} pendingLabel="Retirando…">
        Retirar
      </PendingButton>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    });

    const button = screen.getByRole("button", { name: "Retirar" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("con `busy` (otra acción en curso) se deshabilita pero no cambia el texto", () => {
    render(
      <PendingButton onClick={() => undefined} pendingLabel="Ofertando…" busy>
        Ofertar
      </PendingButton>,
    );

    expect((screen.getByRole("button", { name: "Ofertar" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("sigue deshabilitado hasta que llega el estado nuevo — ADMIN-PEDIDOS-59", () => {
  const press = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
  };

  it("con `settleKey`, al responder el servidor sigue gris y no se puede tocar de nuevo", async () => {
    const onClick = vi.fn(() => Promise.resolve());

    render(
      <PendingButton onClick={onClick} pendingLabel="Tomando…" settleKey="ready">
        Tomar
      </PendingButton>,
    );

    await press("Tomar");

    const button = screen.getByRole("button", { name: /Tomando/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cuando cambia el `settleKey` (llegó el estado nuevo) vuelve a estar activo", async () => {
    const { rerender } = render(
      <PendingButton onClick={() => Promise.resolve()} pendingLabel="Tomando…" settleKey="ready">
        Tomar
      </PendingButton>,
    );

    await press("Tomar");
    expect(screen.getByRole("button", { name: /Tomando/ })).toBeTruthy();

    rerender(
      <PendingButton onClick={() => Promise.resolve()} pendingLabel="Tomando…" settleKey="on_the_way">
        En camino
      </PendingButton>,
    );

    const button = screen.getByRole("button", { name: "En camino" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("si la acción responde `false` (falló y se muestra el error), vuelve a estar activo", async () => {
    render(
      <PendingButton onClick={() => Promise.resolve(false)} pendingLabel="Tomando…" settleKey="ready">
        Tomar
      </PendingButton>,
    );

    await press("Tomar");

    expect((screen.getByRole("button", { name: "Tomar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("si la acción lanza, vuelve a estar activo", async () => {
    render(
      <PendingButton onClick={() => Promise.reject(new Error("falló"))} pendingLabel="Tomando…" settleKey="ready">
        Tomar
      </PendingButton>,
    );

    await press("Tomar");

    expect((screen.getByRole("button", { name: "Tomar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("si el estado nuevo nunca llega, a los 10 segundos se libera", async () => {
    vi.useFakeTimers();
    try {
      render(
        <PendingButton onClick={() => Promise.resolve()} pendingLabel="Tomando…" settleKey="ready">
          Tomar
        </PendingButton>,
      );

      await press("Tomar");
      expect(screen.getByRole("button", { name: /Tomando/ })).toBeTruthy();

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      expect((screen.getByRole("button", { name: "Tomar" }) as HTMLButtonElement).disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin `settleKey` vuelve a estar activo al responder, como un botón de Guardar", async () => {
    render(
      <PendingButton onClick={() => Promise.resolve()} pendingLabel="Guardando…">
        Guardar
      </PendingButton>,
    );

    await press("Guardar");

    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
