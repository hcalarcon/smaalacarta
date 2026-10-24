import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeliveryFeeEditor from "./DeliveryFeeEditor";
import OrderCard from "./OrderCard";
import type { Order } from "@/lib/db/orders";

afterEach(cleanup);

describe("costo de envío a confirmar — ENVIO-253 y 262", () => {
  it("pendiente: se ve bien destacado, con el campo para cargarlo", () => {
    render(<DeliveryFeeEditor pending busy={false} onSave={vi.fn()} />);

    expect(screen.getByText(/Costo de envío a confirmar/)).toBeTruthy();
    expect(screen.getByLabelText("Costo del envío")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cargar" })).toBeTruthy();
  });

  it("carga el precio con coma o con punto decimal", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<DeliveryFeeEditor pending busy={false} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Costo del envío"), { target: { value: "1500,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("1500,50"));
  });

  it("un precio que no es un número no llega al servidor", async () => {
    const onSave = vi.fn();
    render(<DeliveryFeeEditor pending busy={false} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Costo del envío"), { target: { value: "mucho" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/precio válido/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza el precio, muestra el motivo y deja el campo", async () => {
    const onSave = vi.fn().mockResolvedValue("El pedido ya terminó.");
    render(<DeliveryFeeEditor pending busy={false} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Costo del envío"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("El pedido ya terminó.");
    expect(screen.getByLabelText("Costo del envío")).toBeTruthy();
  });

  it("cargado, muestra el costo y se puede corregir", async () => {
    render(<DeliveryFeeEditor pending={false} current="$ 1.800" busy={false} onSave={vi.fn()} />);

    expect(screen.getByText("$ 1.800")).toBeTruthy();
    expect(screen.queryByText(/Costo de envío a confirmar/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    expect(screen.getByLabelText("Costo del envío")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });
});

describe("tarjeta del tablero con envío a coordinar — ENVIO-262", () => {
  const order = (extra: Partial<Order> = {}) =>
    ({
      id: "1",
      order_number: "7",
      status: "confirmed",
      total: 3000,
      customer_name: "Ana",
      payment: "efectivo",
      payment_status: "not_required",
      source: "web",
      delivery: "delivery",
      scheduled_for: null,
      preorder: false,
      code: "abc",
      created_at: "2026-10-08T10:00:00Z",
      order_items: [{ name: "Café", quantity: 2, unit_price: 1500, sort_order: 1 }],
      order_events: [],
      delivery_events: [],
      delivery_zone_id: null,
      delivery_zone_name: "Villa Rural",
      delivery_fee: null,
      delivery_fee_list: null,
      delivery_fee_coordinated: true,
      courier_status: "accepted",
      courier_id: null,
      ...extra,
    }) as unknown as Order;

  const now = new Date("2026-10-08T10:05:00Z");
  const card = (o: Order, onSetFee?: (fee: string) => Promise<string | void>) =>
    render(<OrderCard order={o} now={now} busy={false} onAdvance={vi.fn()} onOpen={vi.fn()} onSetFee={onSetFee} />);

  it("pendiente: dice que el costo está por confirmarse y deja cargarlo", async () => {
    const onSetFee = vi.fn().mockResolvedValue(undefined);
    card(order(), onSetFee);

    expect(screen.getByText(/Villa Rural · costo a confirmar/)).toBeTruthy();
    expect(screen.getByText(/⚠ Costo de envío a confirmar/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Costo del envío"), { target: { value: "1800" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar" }));
    await waitFor(() => expect(onSetFee).toHaveBeenCalledWith("1800"));
  });

  it("cargado: muestra el precio y el 'Corregir'", () => {
    card(order({ delivery_fee: 1800, delivery_fee_list: 1800 }), vi.fn());

    expect(screen.queryByText(/costo a confirmar/)).toBeNull();
    expect(screen.getByRole("button", { name: "Corregir" })).toBeTruthy();
  });

  it("un envío con precio de zona no muestra el campo", () => {
    card(
      order({ delivery_fee_coordinated: false, delivery_fee: 1500, delivery_fee_list: 1500, delivery_zone_name: "Norte" }),
      vi.fn(),
    );

    expect(screen.queryByLabelText("Costo del envío")).toBeNull();
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
  });

  it("un pedido terminado ya no se edita", () => {
    card(order({ status: "delivered" }), vi.fn());

    expect(screen.queryByLabelText("Costo del envío")).toBeNull();
  });
});
