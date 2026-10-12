import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ItemNote from "./ItemNote";

afterEach(cleanup);

describe("ItemNote — ADMIN-PEDIDOS-22", () => {
  it("muestra la nota del cliente", () => {
    render(<ItemNote note="sin cheddar, con mostaza" />);

    expect(screen.getByText("sin cheddar, con mostaza")).toBeTruthy();
    expect(screen.getByText(/Nota del cliente/)).toBeTruthy();
  });

  it("sin nota (nula, vacía o solo espacios) no dibuja nada", () => {
    const { container, rerender } = render(<ItemNote note={null} />);
    expect(container.innerHTML).toBe("");

    rerender(<ItemNote note="   " />);
    expect(container.innerHTML).toBe("");

    rerender(<ItemNote />);
    expect(container.innerHTML).toBe("");
  });

  it("es texto: un HTML en la nota no se interpreta", () => {
    const { container } = render(<ItemNote note={'<img src=x onerror="alert(1)">'} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
