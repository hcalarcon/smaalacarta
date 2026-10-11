import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OrderCard from "./OrderCard";
import OrderDetailDialog from "./OrderDetailDialog";
import SettlementStatus from "./SettlementStatus";
import SettlementSummary from "./SettlementSummary";
import type { Order } from "@/lib/db/orders";
import type { OrderOffers } from "@/lib/orders/courier";

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

describe("rendición del efectivo — ENVIO-43", () => {
  const delivered = (extra: Partial<Order> = {}) =>
    order({
      status: "delivered",
      payment: "efectivo",
      payment_status: "not_required",
      courier_id: "7a0c0e00-0000-4000-8000-000000000001",
      settled_at: null,
      settlement_received_at: null,
      ...extra,
    });

  it("entregado en efectivo y sin rendir: A rendir, sin botón", () => {
    const onReceived = vi.fn();
    render(<SettlementStatus order={delivered()} onReceived={onReceived} />);

    expect(screen.getByText(/A rendir/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Recibido" })).toBeNull();
  });

  it("cuando el repartidor ya lo marcó, ofrece Recibido", () => {
    const onReceived = vi.fn();
    render(
      <SettlementStatus order={delivered({ settled_at: "2026-10-08T12:00:00Z" })} onReceived={onReceived} />,
    );

    expect(screen.getByText(/Rendido, esperando confirmación/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recibido" }));
    expect(onReceived).toHaveBeenCalledTimes(1);
  });

  it("recibido: queda fijo, sin botón", () => {
    render(
      <SettlementStatus
        order={delivered({ settled_at: "2026-10-08T12:00:00Z", settlement_received_at: "2026-10-08T13:00:00Z" })}
        onReceived={vi.fn()}
      />,
    );

    expect(screen.getByText(/Recibido por el local/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Recibido" })).toBeNull();
  });

  it("con transferencia, o sin repartidor, no aparece nada", () => {
    const { container, rerender } = render(
      <SettlementStatus order={delivered({ payment: "transferencia" })} onReceived={vi.fn()} />,
    );
    expect(container.textContent).toBe("");

    rerender(<SettlementStatus order={delivered({ courier_id: null })} onReceived={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("el detalle del pedido muestra el estado y el botón Recibido", () => {
    const onConfirmSettlement = vi.fn();
    render(
      <OrderDetailDialog
        order={delivered({ settled_at: "2026-10-08T12:00:00Z" })}
        slug="ana"
        busy={false}
        onClose={vi.fn()}
        onChangeStatus={vi.fn()}
        onConfirmSettlement={onConfirmSettlement}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Recibido" }));
    expect(onConfirmSettlement).toHaveBeenCalled();
  });

  it("el resumen suma pendiente, rendido sin confirmar y recibido", () => {
    render(
      <SettlementSummary
        orders={[
          delivered({ id: "1", total: 8000 }),
          delivered({ id: "2", total: 2000, settled_at: "2026-10-08T12:00:00Z" }),
          delivered({
            id: "3",
            total: 1000,
            settled_at: "2026-10-08T12:00:00Z",
            settlement_received_at: "2026-10-08T13:00:00Z",
          }),
          delivered({ id: "4", total: 9999, payment: "transferencia" }),
        ]}
      />,
    );

    const text = screen.getByRole("region", { name: /Rendiciones/ }).textContent!.replace(/\s/g, " ");
    expect(text).toMatch(/Pendiente de rendir\$ 8\.000/);
    expect(text).toMatch(/Rendido, por confirmar\$ 2\.000/);
    expect(text).toMatch(/Recibido\$ 1\.000/);
    expect(text).not.toContain("9.999");
  });

  it("el resumen no aparece si no hay efectivo con envío", () => {
    const { container } = render(<SettlementSummary orders={[delivered({ payment: "transferencia" })]} />);
    expect(container.textContent).toBe("");
  });
});

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

// Envío con repartidor: la búsqueda abierta — ENVIO-80 a 85.
describe("pedido con envío — ENVIO-80 a 85", () => {
  const ZONA = "aaaaaaaa-0000-4000-8000-000000000001";
  const DAMIAN = "7a0c0e00-0000-4000-8000-000000000001";
  const OTRO = "7a0c0e00-0000-4000-8000-000000000002";
  const LEJOS = "7a0c0e00-0000-4000-8000-000000000003";

  const couriers = [
    { id: DAMIAN, name: "Damián", whatsapp: "5493644277105", zone_ids: [ZONA] },
    { id: OTRO, name: "Moto Express", whatsapp: null, zone_ids: [ZONA, "otra"] },
    { id: LEJOS, name: "Lejos", whatsapp: null, zone_ids: ["otra"] },
  ];

  // Un pedido confirmado con la búsqueda abierta a las 07:00 (10:00Z), sin repartidor todavía.
  const searching = (extra: Partial<Order> = {}) =>
    order({
      status: "confirmed",
      payment: "efectivo",
      payment_status: "not_required",
      code: "0123456789abcdef0123",
      courier_id: null,
      delivery_zone_id: ZONA,
      delivery_zone_name: "Cantera",
      delivery_fee_list: 5000,
      delivery_fee: 5000,
      delivery_fee_reason: null,
      delivery_fee_changed_at: null,
      customer_phone: "3644277105",
      delivery_address: "Av. Siempre Viva 742",
      courier_status: "searching",
      courier_note: null,
      courier_responded_at: null,
      offered_at: "2026-10-08T10:00:00Z",
      delivery_events: [],
      ...extra,
    } as unknown as Partial<Order>);

  const card2 = (o: Order, at = now, offers?: OrderOffers) =>
    render(
      <OrderCard
        order={o}
        now={at}
        busy={false}
        onAdvance={vi.fn()}
        onOpen={vi.fn()}
        couriers={couriers}
        offers={offers}
      />,
    );

  // Dos ofertas abiertas: el favorito (Damián) y otra más barata (ENVIO-117).
  const OFFERS: OrderOffers = {
    order_id: "p1",
    cierra_en: "2026-10-08T10:05:00Z",
    ofertas: [
      { id: "o1", courier_id: DAMIAN, repartidor: "Damián", precio: 5000, motivo: null, favorito: true },
      { id: "o2", courier_id: "otro", repartidor: "Moto Express", precio: 4500, motivo: "Cerca", favorito: false },
    ],
  };

  const full = (
    o: Order,
    handlers: { onAssign?: () => void; onSelf?: () => void } = {},
    at = now,
    offers?: OrderOffers,
  ) =>
    render(
      <OrderDetailDialog
        order={o}
        slug="ana"
        busy={false}
        onClose={vi.fn()}
        onChangeStatus={vi.fn()}
        couriers={couriers}
        offers={offers}
        now={at}
        onAssignCourier={handlers.onAssign ?? vi.fn()}
        onSelfDelivery={handlers.onSelf ?? vi.fn()}
      />,
    );

  it("un pedido pendiente con la búsqueda abierta, y confirmar no se bloquea", () => {
    card2(searching({ status: "pending" } as Partial<Order>));

    expect(screen.getByText("Esperando ofertas")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("buscando: barrio, precio, desde qué hora y esperando ofertas", () => {
    card2(searching());

    expect(screen.getByText(/Cantera/)).toBeTruthy();
    expect(screen.getByText(/\$\s?5\.000/)).toBeTruthy();
    expect(screen.getByText("Buscando repartidor desde las 07:00")).toBeTruthy();
    expect(screen.getByText("Esperando ofertas")).toBeTruthy();
  });

  it("con ofertas: cuántas hay, en cuánto se elige sola, y quién ofreció cuánto", () => {
    card2(searching(), new Date("2026-10-08T10:02:00Z"), OFFERS);

    expect(screen.getByText("2 ofertas, el cliente está eligiendo (se elige sola en 3:00)")).toBeTruthy();
    expect(screen.getByText(/⭐ Damián · \$\s?5\.000/)).toBeTruthy();
    expect(screen.getByText(/Moto Express · \$\s?4\.500/)).toBeTruthy();
    // Con ofertas no hay aviso de "nadie ofertó", aunque pasen los 10 minutos.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a los 10 minutos sin ninguna oferta avisa y ofrece resolverlo", () => {
    card2(searching(), new Date("2026-10-08T10:10:00Z"));

    expect(screen.getByRole("alert").textContent).toMatch(/Nadie ofertó todavía/);
    expect(screen.getByRole("button", { name: "Resolver envío" })).toBeTruthy();
  });

  it("antes de los 10 minutos no avisa", () => {
    card2(searching(), new Date("2026-10-08T10:09:00Z"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver envío" })).toBeNull();
  });

  it("tomado: dice quién lo tomó", () => {
    card2(searching({ courier_status: "accepted", courier_id: DAMIAN } as Partial<Order>));
    expect(screen.getByText("Lo tomó Damián")).toBeTruthy();
  });

  it("si lo lleva el local lo dice, y el paso que sigue es Marcar entregado", () => {
    card2(searching({ courier_status: "self", status: "ready" } as Partial<Order>));

    expect(screen.getByText("Lo llevás vos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcar entregado" })).toBeTruthy();
  });

  it("si cambió el precio, muestra el de lista y el motivo", () => {
    card2(
      searching({
        courier_status: "accepted",
        courier_id: DAMIAN,
        delivery_fee: 6500,
        delivery_fee_reason: "Fuera de zona",
      } as Partial<Order>),
    );
    expect(screen.getByText(/\$\s?6\.500/)).toBeTruthy();
    expect(screen.getByText(/Antes.*5\.000.*Fuera de zona/)).toBeTruthy();
  });

  it("con el pedido listo y un repartidor, el siguiente paso es Entregar al repartidor", () => {
    card2(searching({ status: "ready", courier_status: "accepted", courier_id: DAMIAN } as Partial<Order>));

    expect(screen.getByRole("button", { name: "Entregar al repartidor" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar entregado" })).toBeNull();
  });

  it("con el pedido listo y la búsqueda abierta no hay botón de entregar", () => {
    card2(searching({ status: "ready" } as Partial<Order>));

    expect(screen.queryByRole("button", { name: /entregar|marcar entregado/i })).toBeNull();
  });

  it("entregado al repartidor, el local ya no tiene botón de avance", () => {
    card2(searching({ status: "handed_to_courier", courier_status: "accepted", courier_id: DAMIAN } as Partial<Order>));

    expect(screen.queryByRole("button", { name: /marcar|entregar|confirmar|preparar/i })).toBeNull();
    expect(screen.getByText("Entregado al repartidor")).toBeTruthy();
  });

  it("un pedido sin envío no cambia", () => {
    card(order({ payment: "efectivo", payment_status: "not_required", courier_id: null, courier_status: null } as Partial<Order>));

    expect(screen.queryByText(/repartidor/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("el teléfono del cliente se ve en la tarjeta de cualquier pedido, con llamar y WhatsApp", () => {
    card(order({ payment: "efectivo", payment_status: "not_required", customer_phone: "3644277105" } as Partial<Order>));

    expect(screen.getByText("3644277105")).toBeTruthy();
    expect((screen.getByText("Llamar") as HTMLAnchorElement).getAttribute("href")).toBe("tel:3644277105");
    expect((screen.getByText("WhatsApp") as HTMLAnchorElement).href).toBe(
      "https://api.whatsapp.com/send?phone=5493644277105",
    );
  });

  it("y también en el detalle, aunque no lleve envío", () => {
    detail(order({ payment: "efectivo", payment_status: "not_required", customer_phone: "3644277105" } as Partial<Order>));

    expect(screen.getByText("3644277105")).toBeTruthy();
    expect((screen.getByText("Llamar") as HTMLAnchorElement).getAttribute("href")).toBe("tel:3644277105");
  });

  it("un pedido viejo sin teléfono no muestra nada de más", () => {
    card(order({ customer_phone: null } as unknown as Partial<Order>));
    expect(screen.queryByText("Llamar")).toBeNull();
  });

  it("el detalle ofrece Asignar a mano y Lo llevo yo durante toda la búsqueda, con las ofertas a la vista", () => {
    full(searching(), {}, new Date("2026-10-08T10:02:00Z"), OFFERS);

    expect(screen.getByRole("button", { name: "Asignar a mano" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lo llevo yo" })).toBeTruthy();
    expect(screen.getByText("2 ofertas, el cliente está eligiendo (se elige sola en 3:00)")).toBeTruthy();
    expect(screen.getByText("Cerca")).toBeTruthy();
    expect(screen.getByText(/tu favorito/)).toBeTruthy();
  });

  it("asignar a mano: solo los repartidores que cubren la zona, con nota opcional", () => {
    const onAssign = vi.fn();
    full(searching(), { onAssign });

    fireEvent.click(screen.getByRole("button", { name: "Asignar a mano" }));

    const options = Array.from(screen.getByLabelText("Repartidor").querySelectorAll("option")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual(["Elegí un repartidor", "Damián", "Moto Express"]);

    // Sin elegir nadie no avisa a la base.
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    expect(onAssign).not.toHaveBeenCalled();
    expect(screen.getByText("Elegí un repartidor.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Repartidor"), { target: { value: DAMIAN } });
    fireEvent.change(screen.getByLabelText(/Nota/), { target: { value: "Hablamos por WhatsApp" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    expect(onAssign).toHaveBeenCalledWith(DAMIAN, "Hablamos por WhatsApp");
  });

  it("Lo llevo yo pide confirmación antes de avisar", () => {
    const onSelf = vi.fn();
    full(searching(), { onSelf });

    fireEvent.click(screen.getByRole("button", { name: "Lo llevo yo" }));
    expect(onSelf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sí, lo llevo yo" }));
    expect(onSelf).toHaveBeenCalledTimes(1);
  });

  it("a los 10 minutos las dos acciones siguen igual y el aviso aparece en el detalle", () => {
    full(searching(), {}, new Date("2026-10-08T10:12:00Z"));

    expect(screen.getByRole("alert").textContent).toMatch(/Nadie ofertó todavía \(12 min\)/);
    expect(screen.getByRole("button", { name: "Asignar a mano" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lo llevo yo" })).toBeTruthy();
  });

  it("tomado: no hay acciones de resolver y sí un WhatsApp al repartidor", () => {
    full(searching({ courier_status: "accepted", courier_id: DAMIAN } as Partial<Order>));

    expect(screen.queryByRole("button", { name: "Asignar a mano" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lo llevo yo" })).toBeNull();
    expect(screen.getByText("Lo tomó Damián")).toBeTruthy();

    const chat = screen.getByText("WhatsApp a Damián") as HTMLAnchorElement;
    expect(chat.href).toContain("https://api.whatsapp.com/send?phone=5493644277105");
  });

  it("el local no ve más Pedir envío, Repartidor aceptó ni No puede", () => {
    full(searching());

    for (const name of [/pedir envío/i, /volver a pedir/i, /repartidor aceptó/i, /no puede/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("el detalle con un pedido por confirmar no bloquea el cambio de estado", () => {
    full(searching({ status: "pending" } as Partial<Order>));

    expect(screen.getByRole("button", { name: "Confirmado" })).toBeTruthy();
    expect(screen.queryByText(/aceptado por el repartidor/i)).toBeNull();
  });

  it("el detalle muestra el historial del envío y no usa HTML del repartidor", () => {
    const { container } = full(
      searching({
        courier_status: "accepted",
        courier_id: DAMIAN,
        courier_note: "<img src=x onerror=alert(1)>",
        delivery_events: [
          { kind: "delivery", status: "confirmed", created_at: "2026-10-08T10:01:00Z", note: "Envío tomado por Damián: Juan, 21:30" },
        ],
      } as unknown as Partial<Order>),
    );

    expect(screen.getByText("Envío tomado por Damián: Juan, 21:30")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("entregado al repartidor, el detalle no ofrece En camino ni Entregado", () => {
    full(searching({ status: "handed_to_courier", courier_status: "accepted", courier_id: DAMIAN } as Partial<Order>));

    expect(screen.queryByRole("button", { name: "En camino" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Entregado" })).toBeNull();
    expect(screen.getByText(/lo lleva el repartidor/i)).toBeTruthy();
  });
});
