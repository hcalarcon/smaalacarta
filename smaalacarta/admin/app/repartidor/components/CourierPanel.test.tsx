import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AvailableOrderCard from "./AvailableOrderCard";
import CourierOrderCard from "./CourierOrderCard";
import CourierOrdersClient from "./CourierOrdersClient";
import type { AvailableOrder, CourierPanelOrder } from "@/lib/courier/panel";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  offer: vi.fn(),
  withdraw: vi.fn(),
  decline: vi.fn(),
  take: vi.fn(),
  giveBack: vi.fn(),
  advance: vi.fn(),
  settle: vi.fn(),
  setEta: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../actions", () => ({
  makeOfferAction: mocks.offer,
  withdrawOfferAction: mocks.withdraw,
  declineOrderAction: mocks.decline,
  takeOrderAction: mocks.take,
  returnOrderAction: mocks.giveBack,
  advanceOrderAction: mocks.advance,
  markSettledAction: mocks.settle,
  setEtaAction: mocks.setEta,
}));
beforeEach(() => {
  // Las pestañas dejan la URL al día (ADMIN-MOVIL-8): que un test no herede la del anterior.
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
  for (const fn of [
    mocks.offer,
    mocks.take,
    mocks.withdraw,
    mocks.decline,
    mocks.giveBack,
    mocks.advance,
    mocks.settle,
    mocks.setEta,
  ]) {
    fn.mockResolvedValue({ ok: true });
  }
});

afterEach(cleanup);

const order = (id: string, estado: string, envio: string, extra: Partial<CourierPanelOrder> = {}) =>
  ({
    id,
    numero: id,
    estado,
    creado: "2026-10-09T22:00:00Z",
    programado: null,
    anticipado: false,
    negocio: { nombre: "Ana Resto", direccion: "San Martín 100", whatsapp: "5493644000001" },
    cliente: { nombre: "Cliente", telefono: "3644277105", direccion: "Calle 123" },
    total: 8200,
    pago: "efectivo",
    pago_estado: "not_required",
    notas: null,
    items: [
      {
        nombre: "Helado",
        cantidad: 2,
        precio: 3300,
        opciones: [{ grupo: "Sabores", nombre: "Frutilla", cantidad: 2, precio: 0 }],
      },
    ],
    envio: {
      zona: "Cantera",
      precio_lista: 5000,
      precio: 5000,
      motivo_cambio: null,
      cambiado_el: null,
      estado: envio,
      nota: null,
      consultado_el: null,
      respondido_el: null,
    },
    rendicion: { rendido_el: null, recibido_el: null },
    ...extra,
  }) as CourierPanelOrder;

const offer = (id: string, extra: Partial<AvailableOrder> = {}): AvailableOrder => ({
  id,
  numero: id,
  estado: "confirmed",
  creado: "2026-10-09T22:00:00Z",
  ofrecido_el: "2026-10-09T22:01:00Z",
  programado: null,
  anticipado: false,
  negocio: { nombre: "Ana Resto", direccion: "San Martín 100" },
  total: 8200,
  pago: "efectivo",
  pago_estado: "not_required",
  envio: { zona: "Cantera", precio_lista: 5000 },
  ofertas: 0,
  mi_oferta: null,
  resultado: null,
  cerrado_el: null,
  ...extra,
});

const now = new Date("2026-10-09T22:05:00Z");
const card = (o: CourierPanelOrder, onReturn = vi.fn(), onAdvance = vi.fn(), onSettle = vi.fn()) =>
  render(
    <CourierOrderCard
      order={o}
      now={now}
      busy={false}
      error={null}
      onReturn={onReturn}
      onAdvance={onAdvance}
      onSettle={onSettle}
    />,
  );

const offerCard = (o: AvailableOrder, onOffer = vi.fn(), onDecline = vi.fn(), onWithdraw = vi.fn()) =>
  render(
    <AvailableOrderCard
      order={o}
      now={now}
      busy={false}
      error={null}
      onOffer={onOffer}
      onTake={vi.fn()}
      onWithdraw={onWithdraw}
      onDecline={onDecline}
    />,
  );

describe("pedido que ya tomó, en el panel del repartidor — ENVIO-31", () => {
  it("muestra local, cliente, barrio, precio, total del local, pago y productos con opciones", () => {
    card(order("12", "preparing", "accepted"));

    expect(screen.getAllByText(/Ana Resto/).length).toBeGreaterThan(0);
    expect(screen.getByText("San Martín 100")).toBeTruthy();
    expect(screen.getByText("Cliente")).toBeTruthy();
    expect(screen.getByText("Calle 123")).toBeTruthy();
    expect(screen.getByText("3644277105")).toBeTruthy();
    expect(screen.getByText("Cantera")).toBeTruthy();
    expect(screen.getAllByText(/\$\s?8\.200/).length).toBeGreaterThan(0);
    expect(screen.getByText("Efectivo")).toBeTruthy();
    expect(screen.getByText("2 × Helado")).toBeTruthy();
    expect(screen.getByText("+ Frutilla ×2")).toBeTruthy();
  });

  it("los botones de contacto llevan a WhatsApp y a la llamada", () => {
    card(order("12", "preparing", "accepted"));

    expect((screen.getByText("WhatsApp del local") as HTMLAnchorElement).href).toBe(
      "https://api.whatsapp.com/send?phone=5493644000001",
    );
    expect((screen.getByText("WhatsApp del cliente") as HTMLAnchorElement).href).toBe(
      "https://api.whatsapp.com/send?phone=5493644277105",
    );
    expect((screen.getByText("Llamar") as HTMLAnchorElement).getAttribute("href")).toBe("tel:3644277105");
  });

  it("si el precio cambió, muestra el de lista y el motivo", () => {
    card(
      order("12", "pending", "accepted", {
        envio: {
          zona: "Cantera",
          precio_lista: 5000,
          precio: 6500,
          motivo_cambio: "Fuera de zona",
          cambiado_el: null,
          estado: "accepted",
          nota: "Juan, 21:30",
          consultado_el: null,
          respondido_el: null,
        },
        rendicion: { rendido_el: null, recibido_el: null },
      }),
    );

    expect(screen.getByText(/Precio de lista/)).toBeTruthy();
    expect(screen.getByText(/Fuera de zona/)).toBeTruthy();
    expect(screen.getByText("Juan, 21:30")).toBeTruthy();
  });

  it("el texto del local o del cliente nunca se interpreta como HTML", () => {
    const { container } = card(
      order("12", "preparing", "accepted", {
        negocio: { nombre: "<img src=x onerror=alert(1)>", direccion: null, whatsapp: null },
      }),
    );

    expect(container.querySelector("img")).toBeNull();
  });
});

describe("pedido disponible — ENVIO-71 y 113 a 115", () => {
  it("muestra local, barrio, precio de lista, total, pago, hora y cuántas ofertas hay, y nada del cliente", () => {
    const { container } = offerCard(offer("12", { ofertas: 2 }));

    expect(screen.getAllByText(/Ana Resto/).length).toBeGreaterThan(0);
    expect(screen.getByText("San Martín 100")).toBeTruthy();
    expect(screen.getByText("Cantera")).toBeTruthy();
    expect(screen.getAllByText(/\$\s?8\.200/).length).toBeGreaterThan(0);
    expect(screen.getByText("Efectivo")).toBeTruthy();
    expect(screen.getByText("2 ofertas")).toBeTruthy();
    expect(screen.getByText(/Pedido de las/)).toBeTruthy();
    expect(screen.getByText(/cuando te eligen/i)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Llamar|WhatsApp del cliente/);
  });

  it("un pedido programado muestra la hora bien visible", () => {
    offerCard(offer("12", { programado: "2026-10-10T00:30:00Z" }));
    expect(screen.getByText(/🕒/).textContent).toMatch(/21:30/);
  });

  it("Ofertar manda el precio de lista, sin pedir motivo", () => {
    const onOffer = vi.fn();
    offerCard(offer("12"), onOffer);

    fireEvent.click(screen.getByRole("button", { name: /^Ofertar/ }));

    expect(onOffer).toHaveBeenCalledWith({ price: "5000", reason: "" });
  });

  it("Otro precio: con el de lista ya cargado, y un precio distinto exige motivo", () => {
    const onOffer = vi.fn();
    offerCard(offer("12"), onOffer);

    fireEvent.click(screen.getByRole("button", { name: "Otro precio" }));
    expect((screen.getByLabelText(/precio de tu oferta/i) as HTMLInputElement).value).toBe("5000");
    expect(screen.queryByLabelText(/motivo del cambio/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/precio de tu oferta/i), { target: { value: "26000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar oferta" }));

    expect(onOffer).not.toHaveBeenCalled();
    expect(screen.getByText(/por qué cambia el precio/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/motivo del cambio/i), { target: { value: "Fuera de zona" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar oferta" }));

    expect(onOffer).toHaveBeenCalledWith({ price: "26000", reason: "Fuera de zona" });
  });

  it("con oferta hecha: 'Tu oferta', Cambiar y Retirar", () => {
    const onOffer = vi.fn();
    const onWithdraw = vi.fn();
    offerCard(
      offer("12", { ofertas: 1, mi_oferta: { id: "o1", precio: 6000, motivo: "Llueve", creada: "2026-10-09T22:02:00Z" } }),
      onOffer,
      vi.fn(),
      onWithdraw,
    );

    expect(screen.getByText(/Tu oferta: \$\s?6\.000,00, esperando al cliente/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Ofertar/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    expect(onWithdraw).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect((screen.getByLabelText(/precio de tu oferta/i) as HTMLInputElement).value).toBe("6000");
    fireEvent.change(screen.getByLabelText(/precio de tu oferta/i), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar oferta" }));
    expect(onOffer).toHaveBeenCalledWith({ price: "5000", reason: "Llueve" });
  });

  it.each([
    ["chosen_other", "El cliente eligió otro repartidor"],
    ["cancelled", "Cancelado por el local"],
    ["closed", "El local resolvió el envío"],
  ] as const)("oferta cerrada (%s): muestra el aviso y ninguna acción", (resultado, text) => {
    offerCard(offer("12", { resultado }));

    expect(screen.getByRole("status").textContent).toBe(text);
    expect(screen.queryByRole("button", { name: /Ofertar|Otro precio|Rechazar|Cambiar|Retirar/ })).toBeNull();
  });

  it("Rechazar pide confirmación antes de llamar", () => {
    const onDecline = vi.fn();
    offerCard(offer("12"), vi.fn(), onDecline);

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(onDecline).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sí, rechazar" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("cancelar la confirmación no rechaza nada", () => {
    const onDecline = vi.fn();
    offerCard(offer("12"), vi.fn(), onDecline);

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onDecline).not.toHaveBeenCalled();
  });
});

describe("acciones sobre lo que tomó — ENVIO-77", () => {
  it("antes de la entrega del local se puede devolver, con motivo obligatorio", () => {
    const onReturn = vi.fn();
    card(order("12", "preparing", "accepted"), onReturn);

    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolución" }));
    expect(onReturn).not.toHaveBeenCalled();
    expect(screen.getByText(/Elegí por qué devolvés/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Otro" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolución" }));
    expect(onReturn).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/contá el motivo/i), { target: { value: "Se pinchó la moto" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolución" }));

    expect(onReturn).toHaveBeenCalledWith("other", "Se pinchó la moto");
  });

  it("un motivo fijo se devuelve sin texto", () => {
    const onReturn = vi.fn();
    card(order("12", "preparing", "accepted"), onReturn);

    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));
    fireEvent.click(screen.getByRole("button", { name: "Problema con el vehículo" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolución" }));

    expect(onReturn).toHaveBeenCalledWith("vehicle", null);
  });

  it("entregado al repartidor ofrece En camino y ya no Devolver; en camino ofrece Entregado", () => {
    const onAdvance = vi.fn();
    const first = card(order("12", "handed_to_courier", "accepted"), vi.fn(), onAdvance);

    expect(screen.queryByRole("button", { name: "Devolver" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "En camino" }));
    expect(onAdvance).toHaveBeenCalledWith("on_the_way");

    first.unmount();
    card(order("12", "on_the_way", "accepted"), vi.fn(), onAdvance);
    fireEvent.click(screen.getByRole("button", { name: "Entregado" }));
    expect(onAdvance).toHaveBeenCalledWith("delivered");
  });

  it("terminado: sin botones de avance ni de devolución", () => {
    card(order("12", "delivered", "accepted"));
    expect(screen.queryByRole("button", { name: /en camino|entregado|devolver/i })).toBeNull();
  });
});

describe("tablero del repartidor — ENVIO-76 a 78", () => {
  it("separa disponibles, envíos en curso e historial", () => {
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        available={[offer("1")]}
        orders={[
          order("2", "ready", "accepted"),
          order("3", "delivered", "accepted"),
          order("4", "pending", "rejected"),
        ]}
      />,
    );

    const section = (name: string) => screen.getByRole("region", { name }) as HTMLElement;

    expect(section("Disponibles").textContent).toContain("#1 ");
    expect(section("Mis envíos en curso").textContent).toContain("#2 ");
    expect(section("Historial").textContent).toContain("#3 ");
    expect(section("Historial").textContent).toContain("#4 ");
    expect(section("Disponibles").textContent).not.toContain("#2 ");
  });

  it("sin pedidos disponibles lo dice", () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" available={[]} orders={[]} />);
    expect(screen.getByText(/No hay pedidos para ofertar/)).toBeTruthy();
  });

  it("ofertar llama a la acción con el pedido, el input y el precio de lista", async () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" available={[offer("1")]} orders={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /^Ofertar/ }));

    await waitFor(() => expect(mocks.offer).toHaveBeenCalled());
    expect(mocks.offer).toHaveBeenCalledWith("1", { price: "5000", reason: "" }, 5000);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("precio fijo: muestra el precio y Tomar, sin ofertas ni Otro precio (ENVIO-153)", () => {
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        available={[offer("1", { modo: "fixed" })]}
        orders={[]}
      />,
    );

    expect(screen.getByRole("button", { name: /^Tomar/ }).textContent).toMatch(/5\.000/);
    expect(screen.queryByRole("button", { name: /^Ofertar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Otro precio" })).toBeNull();
    expect(screen.queryByText(/Sin ofertas todavía/)).toBeNull();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
  });

  it("precio fijo: Tomar llama a la acción del pedido", async () => {
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        available={[offer("1", { modo: "fixed" })]}
        orders={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Tomar/ }));

    await waitFor(() => expect(mocks.take).toHaveBeenCalledWith("1"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("precio fijo: si lo tomó otro, dice 'Ya lo tomó otro repartidor'", async () => {
    mocks.take.mockResolvedValue({ ok: false, error: "Ya lo tomó otro repartidor.", closed: true });
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        available={[offer("1", { modo: "fixed" })]}
        orders={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Tomar/ }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Ya lo tomó otro repartidor/));
  });

  it("ofertas: sigue con Ofertar y no muestra Tomar", () => {
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        available={[offer("1", { modo: "offers" })]}
        orders={[]}
      />,
    );

    expect(screen.getByRole("button", { name: /^Ofertar/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Tomar/ })).toBeNull();
  });

  it("retirar la oferta llama a la acción del pedido", async () => {
    const mine = { id: "o1", precio: 5000, motivo: null, creada: "2026-10-09T22:02:00Z" };
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        available={[offer("1", { mi_oferta: mine, ofertas: 1 })]}
        orders={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));

    await waitFor(() => expect(mocks.withdraw).toHaveBeenCalledWith("1"));
  });

  it("si el pedido ya no recibe ofertas, avisa", async () => {
    mocks.offer.mockResolvedValue({ ok: false, error: "El pedido ya no recibe ofertas.", closed: true });
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" available={[offer("1")]} orders={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /^Ofertar/ }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/ya no recibe ofertas/));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("un aviso de oferta cerrada no cuenta como pedido disponible", () => {
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        available={[offer("1", { resultado: "chosen_other" })]}
        orders={[]}
      />,
    );

    const section = screen.getByRole("region", { name: "Disponibles" }) as HTMLElement;
    expect(section.textContent).toContain("El cliente eligió otro repartidor");
    expect(section.querySelector("h2")?.textContent).toMatch(/Disponibles\s*0/);
  });

  it("rechazar llama a la acción del pedido", async () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" available={[offer("1")]} orders={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, rechazar" }));

    await waitFor(() => expect(mocks.decline).toHaveBeenCalledWith("1"));
  });

  it("devolver llama a la acción con el motivo", async () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" available={[]} orders={[order("1", "ready", "accepted")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));
    fireEvent.click(screen.getByRole("button", { name: "Otro" }));
    fireEvent.change(screen.getByLabelText(/contá el motivo/i), { target: { value: "No llego" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolución" }));

    await waitFor(() => expect(mocks.giveBack).toHaveBeenCalledWith("1", "other", "No llego"));
  });

  it("si la acción falla, el error se ve en ese pedido", async () => {
    mocks.offer.mockResolvedValue({ ok: false, error: "Ese cambio de estado no está permitido." });
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" available={[offer("1")]} orders={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /^Ofertar/ }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no está permitido/i));
  });
});

describe("cuánto cobrar y rendiciones — ENVIO-41 y 42", () => {
  const settled = { rendido_el: "2026-10-09T23:00:00Z", recibido_el: null };
  const received = { rendido_el: "2026-10-09T23:00:00Z", recibido_el: "2026-10-09T23:30:00Z" };
  const plain = (text: string | null) => (text ?? "").replace(/\s/g, " ").replace(/,00/g, "");

  it("en efectivo muestra cuánto cobrar y cuánto rendir", () => {
    card(order("12", "preparing", "accepted"));
    expect(plain(screen.getByText(/Cobrar al cliente/).textContent)).toContain(
      "Cobrar al cliente: $ 8.200 + $ 5.000 = $ 13.200 (rendir $ 8.200 al local)",
    );
  });

  it("con otro medio solo cobra el envío y no pide rendición", () => {
    card(order("12", "delivered", "accepted", { pago: "transferencia" }));
    expect(plain(screen.getByText(/Pagado con Transferencia/).textContent)).toContain("cobrar solo el envío $ 5.000");
    expect(screen.queryByRole("button", { name: "Rendido" })).toBeNull();
    expect(screen.queryByText(/a rendir/i)).toBeNull();
  });

  it("un pedido todavía no entregado no tiene rendición", () => {
    card(order("12", "on_the_way", "accepted"));
    expect(screen.queryByRole("button", { name: "Rendido" })).toBeNull();
  });

  it("entregado en efectivo: A rendir y botón Rendido, con confirmación", () => {
    const onSettle = vi.fn();
    card(order("12", "delivered", "accepted"), vi.fn(), vi.fn(), onSettle);

    expect(plain(screen.getByText(/^💵 A rendir/).textContent)).toContain("A rendir $ 8.200");

    fireEvent.click(screen.getByRole("button", { name: "Rendido" }));
    expect(onSettle).not.toHaveBeenCalled();
    expect(screen.getByText(/no se puede deshacer/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sí, rendido" }));
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("cancelar la confirmación no marca nada", () => {
    const onSettle = vi.fn();
    card(order("12", "delivered", "accepted"), vi.fn(), vi.fn(), onSettle);

    fireEvent.click(screen.getByRole("button", { name: "Rendido" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onSettle).not.toHaveBeenCalled();
    expect(screen.queryByText(/no se puede deshacer/i)).toBeNull();
  });

  it("rendido: espera confirmación y ya no hay botón", () => {
    card(order("12", "delivered", "accepted", { rendicion: settled }));
    expect(screen.getByText(/Rendido, esperando confirmación/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rendido" })).toBeNull();
  });

  it("recibido: lo confirmó el local y no hay botón", () => {
    card(order("12", "delivered", "accepted", { rendicion: received }));
    expect(screen.getByText(/Recibido por el local/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rendido" })).toBeNull();
  });

  it("la pestaña Rendiciones muestra los totales por local", () => {
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        orders={[
          order("1", "delivered", "accepted"),
          order("2", "delivered", "accepted", { total: 2000, rendicion: settled }),
          order("3", "delivered", "accepted", { total: 1000, rendicion: received }),
          order("4", "delivered", "accepted", { total: 9999, pago: "transferencia" }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Rendiciones/ }));

    const region = screen.getByRole("region", { name: "Rendiciones" });
    const row = plain(region.querySelector("tbody tr")!.textContent);
    expect(row).toContain("Ana Resto");
    expect(row).toContain("$ 8.200");
    expect(row).toContain("$ 2.000");
    expect(row).toContain("$ 1.000");
    expect(plain(region.textContent)).not.toContain("9.999");
  });

  it("con ?tab=rendiciones en la URL abre Rendiciones directo (ADMIN-MOVIL-8)", () => {
    window.history.replaceState(null, "", "/?tab=rendiciones");
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" orders={[order("1", "pending", "waiting")]} />);

    expect(screen.getByRole("region", { name: "Rendiciones" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Disponibles" })).toBeNull();
  });

  it("sin ?tab abre Pedidos (ADMIN-MOVIL-8)", () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" orders={[order("1", "pending", "waiting")]} />);

    expect(screen.queryByRole("region", { name: "Rendiciones" })).toBeNull();
  });

  it("en el celular las rendiciones son una tarjeta por local más una de total; la tabla queda desde sm (ADMIN-MOVIL-9)", () => {
    window.history.replaceState(null, "", "/?tab=rendiciones");
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        orders={[order("1", "delivered", "accepted"), order("2", "delivered", "accepted", { total: 2000, rendicion: settled })]}
      />,
    );

    const list = screen.getByRole("list", { name: "Rendiciones por local" });
    expect(list.className).toContain("sm:hidden");
    const cards = within(list).getAllByRole("listitem");
    // Una por local y la de Total.
    expect(cards).toHaveLength(2);
    expect(plain(cards[0].textContent)).toContain("Ana Resto");
    expect(plain(cards[0].textContent)).toContain("Pendiente de rendir");
    expect(plain(cards[1].textContent)).toContain("Total");

    expect(screen.getByRole("table").parentElement?.className).toContain("sm:block");
  });

  it("la pestaña Rendiciones avisa cuando no hay nada para rendir", () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" orders={[order("1", "pending", "waiting")]} />);

    fireEvent.click(screen.getByRole("tab", { name: /Rendiciones/ }));
    expect(screen.getByText(/No hay efectivo para rendir/)).toBeTruthy();
  });

  it("marcar Rendido desde el tablero llama a la acción con el pedido", async () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" orders={[order("1", "delivered", "accepted")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rendido" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, rendido" }));

    await waitFor(() => expect(mocks.settle).toHaveBeenCalledWith("1"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("un pedido viejo sin rendir no queda afuera del historial", () => {
    const old = Array.from({ length: 25 }, (_, i) =>
      order(String(100 + i), "delivered", "accepted", {
        creado: `2026-10-09T22:${String(59 - i).padStart(2, "0")}:00Z`,
        rendicion: received,
      }),
    );
    const pending = order("1", "delivered", "accepted", { creado: "2026-10-01T10:00:00Z" });

    render(<CourierOrdersClient serverNow="2026-10-09T23:30:00Z" orders={[...old, pending]} />);

    expect((screen.getByRole("region", { name: "Historial" }) as HTMLElement).textContent).toContain("#1 ");
  });
});

describe("circuito de tiempos — ENVIO-163", () => {
  // 2026-10-10T00:35:00Z es 21:35 en Argentina; 00:05Z, 21:05.
  const times = (extra: Partial<NonNullable<CourierPanelOrder["tiempos"]>> = {}) => ({
    listo_a: "2026-10-10T00:35:00Z",
    demora_min: 45,
    listo_antes: null,
    llega_local_a: null,
    llega_cliente_a: null,
    ...extra,
  });

  const timedCard = (o: CourierPanelOrder, onAdvance = vi.fn(), onSetEta = vi.fn()) =>
    render(
      <CourierOrderCard
        order={o}
        now={now}
        busy={false}
        error={null}
        onReturn={vi.fn()}
        onAdvance={onAdvance}
        onSetEta={onSetEta}
        onSettle={vi.fn()}
      />,
    );

  it("un pedido disponible muestra la hora de listo y la demora antes de tomarlo", () => {
    offerCard(offer("12", { listo_a: "2026-10-10T00:35:00Z", demora_min: 45 }));

    expect(screen.getByText(/Listo para retirar a las 21:35 · Demora 45 min/)).toBeTruthy();
  });

  it("sin hora cargada no inventa una", () => {
    offerCard(offer("12"));

    expect(screen.queryByText(/Listo para retirar/)).toBeNull();
  });

  it("recién tomado pide 'Llego al local en…' con los botones rápidos, y manda el tipo y los minutos", async () => {
    const onSetEta = vi.fn();
    timedCard(order("12", "confirmed", "accepted", { tiempos: times() }), vi.fn(), onSetEta);

    expect(screen.getByText("Llego al local en…")).toBeTruthy();
    for (const minutes of [5, 10, 15, 20, 30]) {
      expect(screen.getByRole("button", { name: `${minutes} min` })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "15 min" }));
    await waitFor(() => expect(onSetEta).toHaveBeenCalledWith("pickup", 15));
  });

  it("el campo libre valida de 1 a 120", async () => {
    const onSetEta = vi.fn();
    timedCard(order("12", "confirmed", "accepted", { tiempos: times() }), vi.fn(), onSetEta);

    fireEvent.change(screen.getByLabelText(/otro tiempo/i), { target: { value: "121" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert").textContent).toMatch(/1 a 120/);
    expect(onSetEta).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/otro tiempo/i), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSetEta).toHaveBeenCalledWith("pickup", 45));
  });

  it("con el tiempo cargado muestra a qué hora llega y deja cambiarlo", () => {
    timedCard(
      order("12", "confirmed", "accepted", { tiempos: times({ llega_local_a: "2026-10-10T00:15:00Z" }) }),
    );

    expect(screen.getByText("Llegás al local a las 21:15")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.getByText("Llego al local en…")).toBeTruthy();
  });

  it("si el local cambió la demora, marca 'Cambió' con la hora vieja tachada", () => {
    timedCard(order("12", "confirmed", "accepted", { tiempos: times({ listo_antes: "2026-10-10T00:05:00Z" }) }));

    expect(screen.getByText("Cambió")).toBeTruthy();
    const old = screen.getByText("21:05");
    expect(old.tagName).toBe("S");
    expect(screen.getByRole("button", { name: "Devolver" })).toBeTruthy();
  });

  it("con un cambio de demora sin ver, 'Cambió la demora' es el primer botón al devolver", () => {
    timedCard(order("12", "confirmed", "accepted", { tiempos: times({ listo_antes: "2026-10-10T00:05:00Z" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));

    const labels = screen
      .getAllByRole("button", { pressed: false })
      .map((b) => b.textContent)
      .filter((t) => ["Cambió la demora", "Problema con el vehículo", "Otro"].includes(t ?? ""));
    expect(labels).toEqual(["Cambió la demora", "Problema con el vehículo", "Otro"]);
  });

  it("sin cambio de demora, 'Cambió la demora' no va primero", () => {
    timedCard(order("12", "confirmed", "accepted", { tiempos: times() }));
    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));

    const labels = screen
      .getAllByRole("button", { pressed: false })
      .map((b) => b.textContent)
      .filter((t) => ["Cambió la demora", "Problema con el vehículo", "Otro"].includes(t ?? ""));
    expect(labels[0]).toBe("Problema con el vehículo");
  });

  it("al marcar En camino puede cargar 'Llego al cliente en…', y también salir sin tiempo", async () => {
    const onAdvance = vi.fn();
    timedCard(order("12", "handed_to_courier", "accepted", { tiempos: times() }), onAdvance);

    expect(screen.getByText(/llego en…/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "20 min" }));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith("on_the_way", 20));

    onAdvance.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "En camino" }));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith("on_the_way"));
  });

  it("ya en camino sin tiempo al cliente lo pide, con el tipo dropoff", async () => {
    const onSetEta = vi.fn();
    timedCard(order("12", "on_the_way", "accepted", { tiempos: times() }), vi.fn(), onSetEta);

    expect(screen.getByText("Llego al cliente en…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "10 min" }));
    await waitFor(() => expect(onSetEta).toHaveBeenCalledWith("dropoff", 10));
  });

  it("un pedido entregado no pide ningún tiempo", () => {
    timedCard(order("12", "delivered", "accepted", { tiempos: times() }));

    expect(screen.queryByText(/Llego al/)).toBeNull();
    expect(screen.queryByText(/Listo para retirar/)).toBeNull();
  });
});
