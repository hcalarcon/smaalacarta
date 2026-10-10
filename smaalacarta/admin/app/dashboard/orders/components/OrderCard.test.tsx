import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

// Envío con Repartos al Toque — ENVIO-24 a 26.
describe("pedido con envío — ENVIO-24 a 26", () => {
  const courierOrder = (extra: Partial<Order> = {}) =>
    order({
      payment: "efectivo",
      payment_status: "not_required",
      code: "0123456789abcdef0123",
      courier_id: "7a0c0e00-0000-4000-8000-000000000001",
      delivery_zone_name: "Cantera",
      delivery_fee_list: 5000,
      delivery_fee: 5000,
      delivery_fee_reason: null,
      delivery_fee_changed_at: null,
      customer_phone: "3644277105",
      delivery_address: "Av. Siempre Viva 742",
      courier_status: "waiting",
      courier_note: null,
      courier_requested_at: null,
      courier_responded_at: null,
      delivery_events: [],
      ...extra,
    } as unknown as Partial<Order>);

  const courier = { name: "Repartos al Toque", whatsapp: "5493644277105" };
  const full = (o: Order, onCourierAction = vi.fn(), at = now) =>
    render(
      <OrderDetailDialog
        order={o}
        slug="ana"
        busy={false}
        onClose={vi.fn()}
        onChangeStatus={vi.fn()}
        businessName="Ana Resto"
        courier={courier}
        now={at}
        onCourierAction={onCourierAction}
      />,
    );

  it("la tarjeta muestra barrio, precio y estado del envío", () => {
    card(courierOrder());
    expect(screen.getByText(/Cantera/)).toBeTruthy();
    expect(screen.getByText(/\$\s?5\.000/)).toBeTruthy();
    expect(screen.getByText("Sin pedir al repartidor")).toBeTruthy();
  });

  it("sin aceptar, confirmar está deshabilitado con el motivo a la vista", () => {
    card(courierOrder());
    const confirm = screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement;

    expect(confirm.disabled).toBe(true);
    expect(confirm.title).toMatch(/aceptado por el repartidor/i);
    expect(screen.getAllByText(/aceptado por el repartidor/i).length).toBeGreaterThan(0);
  });

  it("aceptado, confirmar se habilita y ya no ofrece pedir el envío", () => {
    card(courierOrder({ courier_status: "accepted" }));
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /pedir envío|volver a pedir/i })).toBeNull();
  });

  it("si cambió el precio, muestra el de lista y el motivo", () => {
    card(courierOrder({ courier_status: "accepted", delivery_fee: 6500, delivery_fee_reason: "Fuera de zona" }));
    expect(screen.getByText(/\$\s?6\.500/)).toBeTruthy();
    expect(screen.getByText(/Antes.*5\.000.*Fuera de zona/)).toBeTruthy();
  });

  it("a los 10 minutos sin respuesta avisa en la tarjeta", () => {
    const requested = courierOrder({
      courier_status: "requested",
      courier_requested_at: "2026-10-08T09:55:00Z",
    });
    card(requested);
    expect(screen.getByRole("alert").textContent).toMatch(/10 min sin respuesta/);
  });

  it("con el pedido listo, el siguiente paso es Entregar al repartidor", () => {
    card(courierOrder({ status: "ready", courier_status: "accepted" }));
    expect(screen.getByRole("button", { name: "Entregar al repartidor" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar entregado" })).toBeNull();
  });

  it("entregado al repartidor, el local ya no tiene botón de avance", () => {
    card(courierOrder({ status: "handed_to_courier", courier_status: "accepted" }));
    expect(screen.queryByRole("button", { name: /marcar|entregar|confirmar|preparar/i })).toBeNull();
    expect(screen.getByText("Entregado al repartidor")).toBeTruthy();
  });

  it("un pedido sin envío no cambia", () => {
    card(order({ payment: "efectivo", payment_status: "not_required", courier_id: null } as Partial<Order>));
    expect(screen.queryByText(/repartidor/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("el detalle sin aceptar solo ofrece cancelar y dice por qué", () => {
    full(courierOrder());
    expect(screen.getByRole("button", { name: "Cancelado" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmado" })).toBeNull();
    expect(screen.getAllByText(/aceptado por el repartidor/i).length).toBeGreaterThan(0);
  });

  it("Pedir envío abre WhatsApp con el pedido armado y registra la consulta", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const onCourierAction = vi.fn();
    full(courierOrder(), onCourierAction);

    fireEvent.click(screen.getByRole("button", { name: "Pedir envío" }));

    const [url] = open.mock.calls[0];
    expect(url).toContain("https://api.whatsapp.com/send?phone=5493644277105");
    const text = decodeURIComponent(String(url).split("text=")[1]);
    expect(text).toContain("Ana Resto");
    expect(text).toContain("Barrio: Cantera");
    expect(text).toContain("Seguimiento: https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123");
    expect(onCourierAction).toHaveBeenCalledWith("request", { note: "", fee: "", reason: "" });
    vi.unstubAllGlobals();
  });

  it("registrar que aceptó, con nota; el mismo precio no pide motivo", () => {
    const onCourierAction = vi.fn();
    full(courierOrder(), onCourierAction);

    fireEvent.click(screen.getByRole("button", { name: "Repartidor aceptó" }));
    fireEvent.change(screen.getByPlaceholderText("Juan, 21:30"), { target: { value: "Juan, 21:30" } });
    expect(screen.queryByLabelText(/motivo del cambio/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar: aceptó" }));

    expect(onCourierAction).toHaveBeenCalledWith("accept", { note: "Juan, 21:30", fee: "5000", reason: "" });
  });

  it("un precio distinto exige motivo antes de guardar", () => {
    const onCourierAction = vi.fn();
    full(courierOrder(), onCourierAction);

    fireEvent.click(screen.getByRole("button", { name: "Repartidor aceptó" }));
    fireEvent.change(screen.getByLabelText(/precio final del envío/i), { target: { value: "26000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar: aceptó" }));

    expect(onCourierAction).not.toHaveBeenCalled();
    expect(screen.getByText(/por qué cambia el precio/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/motivo del cambio/i), { target: { value: "Fuera de zona" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar: aceptó" }));

    expect(onCourierAction).toHaveBeenCalledWith("accept", { note: "", fee: "26000", reason: "Fuera de zona" });
  });

  it("No puede registra el rechazo", () => {
    const onCourierAction = vi.fn();
    full(courierOrder(), onCourierAction);

    fireEvent.click(screen.getByRole("button", { name: "No puede" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar: no puede" }));

    expect(onCourierAction).toHaveBeenCalledWith("reject", { note: "", fee: "", reason: "" });
  });

  it("sin WhatsApp del repartidor no hay link, pero se puede registrar la respuesta", () => {
    render(
      <OrderDetailDialog
        order={courierOrder()}
        slug="ana"
        busy={false}
        onClose={vi.fn()}
        onChangeStatus={vi.fn()}
        businessName="Ana Resto"
        courier={{ name: "Repartos al Toque", whatsapp: null }}
        now={now}
        onCourierAction={vi.fn()}
      />,
    );

    expect((screen.getByRole("button", { name: "Pedir envío" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Repartidor aceptó" })).toBeTruthy();
  });

  it("el detalle muestra el historial del envío y no usa HTML del repartidor", () => {
    const { container } = full(
      courierOrder({
        courier_status: "accepted",
        courier_note: "<img src=x onerror=alert(1)>",
        delivery_events: [
          { kind: "delivery", status: "pending", created_at: "2026-10-08T10:01:00Z", note: "Envío aceptado: Juan, 21:30" },
        ],
      } as unknown as Partial<Order>),
    );

    expect(screen.getByText("Envío aceptado: Juan, 21:30")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("entregado al repartidor, el detalle no ofrece En camino ni Entregado", () => {
    full(courierOrder({ status: "handed_to_courier", courier_status: "accepted" }));
    expect(screen.queryByRole("button", { name: "En camino" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Entregado" })).toBeNull();
    expect(screen.getByText(/lo lleva el repartidor/i)).toBeTruthy();
  });
});
