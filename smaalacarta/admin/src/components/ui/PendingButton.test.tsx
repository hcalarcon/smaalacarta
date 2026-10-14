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
