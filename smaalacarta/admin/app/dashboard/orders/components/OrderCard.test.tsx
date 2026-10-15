import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("el resumen se titula por repartidores y separa lo de cada uno si hay varios — ENVIO-127", () => {
    const couriers = [
      { id: "c1", name: "Repartos al Toque" },
      { id: "c2", name: "Moto Express" },
    ] as never;
    render(
      <SettlementSummary
        couriers={couriers}
        orders={[
          delivered({ id: "1", total: 8000, courier_id: "c1" }),
          delivered({ id: "2", total: 2000, courier_id: "c2" }),
        ]}
      />,
    );

    const region = screen.getByRole("region", { name: "Rendiciones de repartidores" });
    expect(region.textContent).not.toMatch(/Rendiciones de Repartos al Toque/);
    const text = region.textContent!.replace(/\s/g, " ");
    expect(text).toMatch(/Repartos al Toque.*\$ 8\.000/);
    expect(text).toMatch(/Moto Express.*\$ 2\.000/);
  });

  it("con un solo repartidor no repite su nombre — ENVIO-127", () => {
    render(
      <SettlementSummary
        couriers={[{ id: "c1", name: "Moto Express" }] as never}
        orders={[delivered({ id: "1", total: 8000, courier_id: "c1" })]}
      />,
    );

    expect(screen.queryByText("Moto Express")).toBeNull();
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
    expect(screen.getByText(/Precio de lista.*5\.000.* · Fuera de zona/)).toBeTruthy();
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

describe("nota por ítem — ADMIN-PEDIDOS-22", () => {
  const withNote = (note: string | null) =>
    order({
      order_items: [
        { name: "Hamburguesa", quantity: 1, unit_price: 1500, sort_order: 1, options: null, note },
        { name: "Gaseosa", quantity: 1, unit_price: 500, sort_order: 2, options: null, note: null },
      ],
    });

  it("el tablero muestra la nota destacada bajo el ítem que la lleva", () => {
    card(withNote("Sin cheddar y con mostaza"));

    const note = screen.getByText("Sin cheddar y con mostaza");
    expect(note.closest("li")?.textContent).toContain("Hamburguesa");
    expect(screen.getAllByText(/Nota del cliente/)).toHaveLength(1);
  });

  it("el detalle también la muestra", () => {
    detail(withNote("Sin cheddar y con mostaza"));

    expect(screen.getByText("Sin cheddar y con mostaza")).toBeTruthy();
  });

  it("es texto del cliente: un HTML en la nota no se interpreta", () => {
    const { container } = detail(withNote("<img src=x onerror=alert(1)>"));

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("sin nota no dibuja nada extra", () => {
    card(withNote(null));

    expect(screen.queryByText(/Nota del cliente/)).toBeNull();
  });
});

describe("tiempo estimado en la tarjeta — ADMIN-PEDIDOS-34 y 35", () => {
  // 21:00 en Argentina.
  const at21 = new Date("2026-10-12T00:00:00Z");
  const inMinutes = (minutes: number) => new Date(at21.getTime() + minutes * 60_000).toISOString();

  const timed = (extra: Partial<Order> = {}) =>
    order({
      status: "confirmed",
      payment: "efectivo",
      payment_status: "not_required",
      prep_ready_at: inMinutes(35),
      ...extra,
    });

  const prepCard = (o: Order, at = at21) => {
    const handlers = { onSetPrep: vi.fn(), onAdjust: vi.fn() };
    render(<OrderCard order={o} now={at} busy={false} onAdvance={vi.fn()} onOpen={vi.fn()} {...handlers} />);
    return handlers;
  };

  it("dice a qué hora estará listo y en cuánto, en hora de Argentina", () => {
    prepCard(timed());

    expect(screen.getByText(/Listo 21:35 \(en 35 min\)/)).toBeTruthy();
  });

  it("pasada la hora queda en alerta con el atraso", () => {
    prepCard(timed(), new Date(at21.getTime() + 39 * 60_000));

    const text = screen.getByText(/Listo 21:35 \(atrasado 4 min\)/);
    expect(text.className).toMatch(/red/);
  });

  it("'Cambiar demora' ofrece −5, +5, +10, +15 y +30 y manda el salto con un toque", () => {
    const { onAdjust } = prepCard(timed());

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));

    for (const name of ["−5 min", "+5 min", "+10 min", "+15 min", "+30 min"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "−5 min" }));

    expect(onAdjust).toHaveBeenCalledWith(-5, null);
  });

  it("el motivo es opcional: elegido, viaja con el salto", () => {
    const { onAdjust } = prepCard(timed());

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));
    fireEvent.click(screen.getByRole("button", { name: "Mucho movimiento" }));
    fireEvent.click(screen.getByRole("button", { name: "+15 min" }));

    expect(onAdjust).toHaveBeenCalledWith(15, "busy");
  });

  it("ofrece los cuatro motivos", () => {
    prepCard(timed());

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));

    for (const name of ["Mucho movimiento", "Clima", "Falta de insumo", "Otro"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("'Otro valor…' abre el selector para escribir los minutos", () => {
    const { onSetPrep } = prepCard(timed());

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));
    fireEvent.click(screen.getByRole("button", { name: "Otro valor…" }));

    expect(onSetPrep).toHaveBeenCalled();
  });

  it("un pedido aceptado sin tiempo ofrece ponerlo", () => {
    const { onSetPrep } = prepCard(timed({ prep_ready_at: null }));

    expect(screen.queryByText(/Listo 21:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Poner tiempo" }));

    expect(onSetPrep).toHaveBeenCalledTimes(1);
  });

  it("un pedido pendiente, listo o programado no muestra nada de esto", () => {
    for (const extra of [
      { status: "pending" },
      { status: "ready" },
      { scheduled_for: inMinutes(120) },
      { preorder: true, scheduled_for: inMinutes(2000) },
    ]) {
      cleanup();
      prepCard(timed(extra));

      expect(screen.queryByText(/Listo 21:/), JSON.stringify(extra)).toBeNull();
      expect(screen.queryByRole("button", { name: "Cambiar demora" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Poner tiempo" })).toBeNull();
    }
  });
});

// ADMIN-MOVIL-11 y 12
describe("pedidos en el celular — ADMIN-MOVIL-11 y 12", () => {
  it("los botones de la tarjeta hacen wrap y miden al menos 44 px en el celular", () => {
    card(order());

    const detail = screen.getByRole("button", { name: "Detalle" });
    expect(detail.className).toContain("min-h-11");
    expect(detail.parentElement?.className).toContain("flex-wrap");
  });

  it("el detalle del pedido sube como hoja desde abajo en el celular y scrollea por dentro", () => {
    const { container } = detail(order());

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("rounded-t-3xl");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(container.firstElementChild?.className).toContain("items-end");
  });

  it("las notas largas del cliente no empujan el ancho (break-words)", () => {
    detail(order({ notes: "x".repeat(200) }));

    expect(screen.getByText("x".repeat(200)).className).toContain("break-words");
  });
});

// ADMIN-PEDIDOS-53 a 55: la tarjeta rediseñada.
describe("tarjeta del tablero — ADMIN-PEDIDOS-53 a 55", () => {
  const at21 = new Date("2026-10-12T00:00:00Z");
  const inMinutes = (minutes: number) => new Date(at21.getTime() + minutes * 60_000).toISOString();
  const kitchen = (extra: Partial<Order> = {}) =>
    order({
      status: "confirmed",
      payment: "efectivo",
      payment_status: "not_required",
      created_at: inMinutes(-10),
      prep_ready_at: inMinutes(35),
      ...extra,
    });

  const render21 = (o: Order, handlers: Record<string, unknown> = {}) =>
    render(
      <OrderCard
        order={o}
        now={at21}
        busy={false}
        onAdvance={vi.fn()}
        onOpen={vi.fn()}
        onSetPrep={vi.fn()}
        onAdjust={vi.fn()}
        {...handlers}
      />,
    );

  it("la cinta marca el paso: un pedido aceptado tiene dos tramos llenos de cinco", () => {
    const { container } = render21(kitchen());

    const strip = container.querySelector("[data-steps]") as HTMLElement;
    expect(strip.children).toHaveLength(5);
    expect(strip.querySelectorAll("[data-done]")).toHaveLength(2);
  });

  it("muestra como máximo dos productos y cuántos más hay", () => {
    const items = [1, 2, 3, 4].map((n) => ({ name: `Plato ${n}`, quantity: 1, unit_price: 10, sort_order: n }));
    render21(kitchen({ order_items: items } as unknown as Partial<Order>));

    expect(screen.getByText("1 × Plato 2")).toBeTruthy();
    expect(screen.queryByText("1 × Plato 3")).toBeNull();
    expect(screen.getByText("y 2 más…")).toBeTruthy();
  });

  it("el borde dice la urgencia: rojo si está atrasado, ámbar si falta poco, neutro si está en orden", () => {
    const border = (o: Order) => {
      cleanup();
      return render21(o).container.querySelector("article")!.className;
    };

    expect(border(kitchen({ prep_ready_at: inMinutes(-3) }))).toContain("border-l-red-500");
    expect(border(kitchen({ prep_ready_at: inMinutes(4) }))).toContain("border-l-amber-500");
    expect(border(kitchen())).not.toMatch(/border-l-(red|amber)/);
  });

  it("tocar la tarjeta abre el detalle, pero tocar un botón no lo abre dos veces", () => {
    const onOpen = vi.fn();
    const onAdvance = vi.fn();
    const { container } = render21(kitchen(), { onOpen, onAdvance });

    fireEvent.click(container.querySelector("article")!);
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Preparar" }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("cambiar la demora abre un panel superpuesto: el alto de la tarjeta no cambia de lugar los botones", () => {
    const { container } = render21(kitchen());
    const footerBefore = screen.getByRole("button", { name: "Detalle" }).parentElement;

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));

    const panel = screen.getByRole("dialog", { name: "Cambiar la demora" });
    expect(panel.className).toContain("absolute");
    expect(container.querySelector("article")!.contains(panel)).toBe(true);
    expect(screen.getByRole("button", { name: "Detalle" }).parentElement).toBe(footerBefore);
  });

  it("al elegir un salto lo aplica y el panel se cierra solo", async () => {
    const onAdjust = vi.fn().mockResolvedValue(undefined);
    render21(kitchen(), { onAdjust });

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));
    fireEvent.click(screen.getByRole("button", { name: "+10 min" }));

    expect(onAdjust).toHaveBeenCalledWith(10, null);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cambiar la demora" })).toBeNull());
  });

  it("si el cambio falla, el panel sigue abierto", async () => {
    const onAdjust = vi.fn().mockRejectedValue(new Error("no"));
    render21(kitchen(), { onAdjust });

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));
    fireEvent.click(screen.getByRole("button", { name: "+10 min" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "+10 min" }) as HTMLButtonElement).disabled).toBe(false));

    expect(screen.getByRole("dialog", { name: "Cambiar la demora" })).toBeTruthy();
  });

  it("la ✕ y Escape cierran el panel", () => {
    render21(kitchen());

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog", { name: "Cambiar la demora" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar demora" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Cambiar la demora" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Cambiar la demora" })).toBeNull();
  });

  it("el botón principal de la tarjeta no se puede tocar dos veces", async () => {
    let release: () => void = () => {};
    const onAdvance = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    render21(kitchen(), { onAdvance });

    const button = screen.getByRole("button", { name: "Preparar" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onAdvance).toHaveBeenCalledTimes(1);
    release();
  });
});
