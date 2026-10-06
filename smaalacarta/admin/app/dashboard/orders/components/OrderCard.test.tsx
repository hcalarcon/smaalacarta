import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OrderCard from "./OrderCard";
import OrderDetailDialog from "./OrderDetailDialog";
import type { Order } from "@/lib/db/orders";

afterEach(cleanup);

const order = (extra: Partial<Order> = {}) =>
  ({
    id: "1",
    order_number: "7",
    status: "pending",
    total: 3000,
    customer_name: "Ana",
    payment: "mercadopago",
    payment_status: "awaiting",
    source: "web",
    scheduled_for: null,
    preorder: false,
    code: "abc",
    created_at: "2026-10-08T10:00:00Z",
    order_items: [{ name: "Café", quantity: 2, unit_price: 1500, sort_order: 1 }],
    order_events: [],
    ...extra,
  }) as unknown as Order;

const now = new Date("2026-10-08T10:05:00Z");
const card = (o: Order) => render(<OrderCard order={o} now={now} busy={false} onAdvance={vi.fn()} onOpen={vi.fn()} />);
const detail = (o: Order) =>
  render(<OrderDetailDialog order={o} slug="ana" busy={false} onClose={vi.fn()} onChangeStatus={vi.fn()} />);

describe("tarjeta con Mercado Pago — ADMIN-PEDIDOS-17 y 18", () => {
  it.each([
    ["awaiting", "Esperando pago"],
    ["paid", "Pagado"],
    ["failed", "Pago fallido"],
  ])("con el pago %s muestra «%s»", (status, label) => {
    card(order({ payment_status: status }));
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("sin pagar, el botón de avanzar está deshabilitado y dice por qué", () => {
    card(order());
    const button = screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/solo se puede cancelar/i);
    expect(screen.getByText(/esperando el pago de mercado pago/i)).toBeTruthy();
  });

  it("con el pago fallido también está deshabilitado", () => {
    card(order({ payment_status: "failed" }));
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("pagado, avanza como siempre y sin aviso", () => {
    card(order({ payment_status: "paid" }));
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/esperando el pago/i)).toBeNull();
  });

  it("un pedido sin Mercado Pago no muestra etiqueta de pago ni se bloquea", () => {
    card(order({ payment: "efectivo", payment_status: "not_required" }));
    expect(screen.queryByText(/pago fallido|esperando pago|^pagado$/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("detalle con Mercado Pago — ADMIN-PEDIDOS-18", () => {
  it("sin pagar solo ofrece cancelar", () => {
    detail(order());
    expect(screen.getByRole("button", { name: "Cancelado" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmado" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Listo" })).toBeNull();
    expect(screen.getByText(/solo se puede cancelar/i)).toBeTruthy();
  });

  it("pagado ofrece todos los pasos", () => {
    detail(order({ payment_status: "paid" }));
    expect(screen.getByRole("button", { name: "Confirmado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Listo" })).toBeTruthy();
  });
});
