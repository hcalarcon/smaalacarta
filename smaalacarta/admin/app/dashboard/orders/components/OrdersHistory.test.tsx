import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OrdersHistory from "./OrdersHistory";
import type { Order } from "@/lib/db/orders";

const order = (id: string, patch: Partial<Record<string, unknown>> = {}) =>
  ({
    id,
    order_number: Number(id),
    source: "menu",
    customer_name: "Ana Pérez",
    status: "delivered",
    total: 4500,
    delivery_type: "retiro",
    payment_method: "efectivo",
    scheduled_for: null,
    created_at: "2026-10-09T20:00:00Z",
    updated_at: "2026-10-09T20:40:00Z",
    order_events: [],
    ...patch,
  }) as unknown as Order;

// ADMIN-MOVIL-9
describe("OrdersHistory — ADMIN-MOVIL-9", () => {
  it("en el celular cada pedido es una tarjeta (lista visible solo bajo md) y la tabla queda para md en adelante", () => {
    render(<OrdersHistory orders={[order("12"), order("13", { status: "cancelled" })]} onOpen={vi.fn()} />);

    const cards = screen.getByRole("list", { name: "Pedidos terminados" });
    expect(cards.className).toContain("md:hidden");
    expect(within(cards).getAllByRole("listitem")).toHaveLength(2);

    const table = screen.getByRole("table");
    expect(table.parentElement?.className).toContain("hidden");
    expect(table.parentElement?.className).toContain("md:block");
  });

  it("la tarjeta lleva número, cliente, estado, total y el botón Detalle abre el pedido", () => {
    const onOpen = vi.fn();
    render(<OrdersHistory orders={[order("12")]} onOpen={onOpen} />);

    const card = within(screen.getByRole("list", { name: "Pedidos terminados" })).getByRole("listitem");
    expect(card).toHaveTextContent("#12");
    expect(card).toHaveTextContent("Ana Pérez");
    expect(card).toHaveTextContent("Entregado");
    expect(card).toHaveTextContent("4.500");

    fireEvent.click(within(card).getByRole("button", { name: "Detalle" }));
    expect(onOpen).toHaveBeenCalledWith("12");
  });

  it("un nombre largo no empuja el ancho de la tarjeta (break-words)", () => {
    render(<OrdersHistory orders={[order("12", { customer_name: "Nombre".repeat(20) })]} onOpen={vi.fn()} />);

    const card = within(screen.getByRole("list", { name: "Pedidos terminados" })).getByRole("listitem");
    expect(card.innerHTML).toContain("break-words");
  });
});
