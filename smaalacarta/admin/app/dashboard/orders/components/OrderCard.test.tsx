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

describe("opciones bajo cada ítem — ADMIN-PEDIDOS-20", () => {
  const withOptions = order({
    payment_status: "paid",
    order_items: [
      {
        name: "Helado",
        quantity: 2,
        unit_price: 3300,
        sort_order: 1,
        options: [
          { grupo: "Sabores", nombre: "Frutilla", cantidad: 2, precio: 0 },
          { grupo: "Toppings", nombre: "Chocolate", cantidad: 1, precio: 300 },
        ],
      },
      { name: "Café", quantity: 1, unit_price: 1000, sort_order: 2, options: null },
    ],
  } as unknown as Partial<Order>);

  it("el tablero muestra las opciones bajo el ítem", () => {
    card(withOptions);

    expect(screen.getByText("2 × Helado")).toBeTruthy();
    expect(screen.getByText("+ Frutilla ×2")).toBeTruthy();
    expect(screen.getByText("+ Chocolate")).toBeTruthy();
    expect(screen.getByText("1 × Café")).toBeTruthy();
  });

  it("el detalle (que también se abre desde el historial) las muestra, con el subtotal con extras", () => {
    detail(withOptions);

    expect(screen.getByText("+ Frutilla ×2")).toBeTruthy();
    expect(screen.getByText("+ Chocolate")).toBeTruthy();
    expect(screen.getByText(/6\.600/)).toBeTruthy();
  });

  it("un pedido sin opciones (manual o anterior) se ve como siempre", () => {
    const { container } = card(order());

    expect(screen.getByText("2 × Café")).toBeTruthy();
    expect(container.textContent).not.toContain("+ ");
  });

  it("las opciones se escriben como texto, nunca como HTML", () => {
    const peligroso = order({
      order_items: [
        {
          name: "X",
          quantity: 1,
          unit_price: 1,
          sort_order: 1,
          options: [{ grupo: "g", nombre: "<img src=x onerror=alert(1)>", cantidad: 1, precio: 0 }],
        },
      ],
    } as unknown as Partial<Order>);
    const { container } = card(peligroso);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("+ <img src=x onerror=alert(1)>")).toBeTruthy();
  });
});
