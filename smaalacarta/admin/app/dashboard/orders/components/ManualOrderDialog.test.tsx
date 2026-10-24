import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createManualOrderAction } = vi.hoisted(() => ({ createManualOrderAction: vi.fn() }));

vi.mock("../actions", () => ({ createManualOrderAction }));

import ManualOrderDialog from "./ManualOrderDialog";
import type { ManualOrderSetup } from "@/lib/orders/manual-context";

const ZONA = "e1e1e1e1-0000-0000-0000-000000000001";
const OTRA = "e1e1e1e1-0000-0000-0000-000000000002";

const setup: ManualOrderSetup = {
  businessName: "Ana Resto",
  slug: "ana",
  courier: true,
  menu: {
    delivery: ["delivery", "retiro"],
    payments: ["efectivo", "transferencia"],
    items: [
      {
        id: "p-hamb",
        kind: "product",
        name: "Hamburguesa",
        price: 5000,
        category: "Comidas",
        soldOut: false,
        groups: [
          {
            id: "g-punto",
            name: "Punto",
            min: 1,
            max: 1,
            repeat: false,
            options: [
              { id: "o-jugoso", name: "Jugoso", price: 0, soldOut: false },
              { id: "o-cocido", name: "Cocido", price: 0, soldOut: false },
            ],
          },
          {
            id: "g-extras",
            name: "Extras",
            min: 0,
            max: 3,
            repeat: false,
            options: [{ id: "o-queso", name: "Queso", price: 500, soldOut: false }],
          },
        ],
        components: [],
      },
      { id: "p-cafe", kind: "product", name: "Café", price: 1000, category: "Bebidas", soldOut: false, groups: [], components: [] },
      {
        id: "promo-emp",
        kind: "promo",
        name: "Combo empanadas",
        price: 3000,
        category: "Ofertas",
        soldOut: false,
        groups: [],
        components: [
          {
            productId: "p-emp",
            name: "Empanada clásica",
            quantity: 2,
            groups: [
              {
                id: "g-gusto",
                name: "Gusto",
                min: 1,
                max: 1,
                repeat: false,
                options: [
                  { id: "o-carne", name: "Carne", price: 0, soldOut: false },
                  { id: "o-jyq", name: "Jamón y queso", price: 200, soldOut: false },
                ],
              },
            ],
          },
          { productId: "p-gas", name: "Gaseosas", quantity: 1, groups: [] },
        ],
      },
    ],
  },
  delivery: {
    zones: [
      { id: ZONA, name: "Cantera", price: 5000, favoriteCovers: true },
      { id: OTRA, name: "Oasis", price: 7000, favoriteCovers: false },
    ],
    favorite: { id: "toque", name: "Repartos al Toque" },
  },
};

function open(props: Partial<ManualOrderSetup> = {}) {
  const handlers = { onClose: vi.fn(), onCreated: vi.fn() };
  render(<ManualOrderDialog open setup={{ ...setup, ...props }} {...handlers} />);
  return handlers;
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

// Agrega un café, sin opciones, desde la lista del menú.
function addCafe() {
  fireEvent.click(within(screen.getByRole("list", { name: "Productos del menú" })).getByText("Café"));
  click(/^Agregar/);
}

beforeEach(() => {
  createManualOrderAction.mockReset();
});

afterEach(cleanup);

describe("pedido manual — productos (ADMIN-PEDIDOS-40, 42 y 47)", () => {
  it("no deja avanzar sin productos", () => {
    open();

    next();

    expect(screen.getByText("Agregá al menos un producto.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeTruthy();
  });

  it("el buscador filtra el menú sin tildes", () => {
    open();

    fireEvent.change(screen.getByLabelText("Buscar en el menú"), { target: { value: "CAFE" } });

    const list = screen.getByRole("list", { name: "Productos del menú" });
    expect(within(list).getByText("Café")).toBeTruthy();
    expect(within(list).queryByText("Hamburguesa")).toBeNull();
  });

  it("un producto con opciones obligatorias no se agrega sin elegirlas", () => {
    open();

    fireEvent.click(screen.getByText("Hamburguesa"));
    click(/^Agregar/);

    expect(screen.getByText("Elegí al menos 1.")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Jugoso"));
    fireEvent.click(screen.getByLabelText(/Queso/));
    fireEvent.change(screen.getByLabelText(/Nota para este producto/), { target: { value: "sin sal" } });
    click(/^Agregar \$\s?5\.500/);

    expect(screen.getByText("Jugoso, Queso")).toBeTruthy();
    expect(screen.getByText("“sin sal”")).toBeTruthy();
    expect(screen.getAllByText(/\$\s?5\.500/).length).toBeGreaterThan(0);
  });

  it("agrega un producto libre y lo marca", () => {
    open();

    click(/Producto libre/);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Torta de la casa" } });
    fireEvent.change(screen.getByLabelText("Precio de una unidad"), { target: { value: "2500" } });
    click("Agregar");

    expect(screen.getByText("Torta de la casa")).toBeTruthy();
    expect(screen.getByText("Producto libre")).toBeTruthy();
  });

  it("el mismo producto con la misma elección suma la cantidad en una sola línea", () => {
    open();

    addCafe();
    addCafe();

    expect(screen.getAllByText("Café").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Cantidad de Café").textContent).toContain("2");
  });
});

describe("pedido manual — entrega y envío (ENVIO-137 a 139)", () => {
  function toDelivery() {
    open();
    addCafe();
    next();
  }

  it("ofrece retiro, envío con repartidor y consumo en el local", () => {
    toDelivery();

    expect(screen.getByLabelText(/Retiro en el local/)).toBeTruthy();
    expect(screen.getByLabelText(/Envío con repartidor/)).toBeTruthy();
    expect(screen.getByLabelText(/Consumo en el local/)).toBeTruthy();
  });

  it("con envío pide barrio y modo, y muestra el precio de referencia", () => {
    toDelivery();

    fireEvent.click(screen.getByLabelText(/Envío con repartidor/));
    next();
    expect(screen.getByText("Elegí el barrio del envío.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Barrio"), { target: { value: ZONA } });
    expect(screen.getByText(/Precio de referencia del envío/)).toBeTruthy();

    next();
    expect(screen.getByText("Elegí cómo se resuelve el envío.")).toBeTruthy();
  });

  it("'asignar a mi favorito' aparece solo si el favorito cubre el barrio", () => {
    toDelivery();

    fireEvent.click(screen.getByLabelText(/Envío con repartidor/));
    fireEvent.change(screen.getByLabelText("Barrio"), { target: { value: ZONA } });
    expect(screen.getByLabelText(/Asignar a Repartos al Toque/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Barrio"), { target: { value: OTRA } });
    expect(screen.queryByLabelText(/Asignar a Repartos al Toque/)).toBeNull();
    expect(screen.getByLabelText(/Buscar repartidor/)).toBeTruthy();
    expect(screen.getByLabelText(/Lo llevo yo/)).toBeTruthy();
  });

  it("sin repartidores en el negocio el envío no pide barrio ni modo", () => {
    open({ courier: false });
    addCafe();
    next();

    fireEvent.click(screen.getByLabelText(/Envío a domicilio/));

    expect(screen.queryByLabelText("Barrio")).toBeNull();
    next();
    expect(screen.getByLabelText(/Teléfono/)).toBeTruthy();
  });
});

describe("pedido manual — cliente y pago (ADMIN-PEDIDOS-44 y 45)", () => {
  function toCustomer(deliveryName: RegExp) {
    open();
    addCafe();
    next();
    fireEvent.click(screen.getByLabelText(deliveryName));
    return deliveryName;
  }

  it("con envío el teléfono es obligatorio", () => {
    open({ courier: false });
    addCafe();
    next();
    fireEvent.click(screen.getByLabelText(/Envío a domicilio/));
    next();

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Lucía" } });
    next();

    expect(screen.getByText(/Ingresá el teléfono del cliente/)).toBeTruthy();
  });

  it("en retiro el teléfono es opcional", () => {
    toCustomer(/Retiro en el local/);
    next();

    expect(screen.getByLabelText(/Teléfono \(opcional\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Lucía" } });
    next();

    expect(screen.getByText("¿Cómo paga?")).toBeTruthy();
  });

  it("ofrece los medios del negocio y QR, y nunca Mercado Pago", () => {
    toCustomer(/Consumo en el local/);
    next();
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Lucía" } });
    next();

    expect(screen.getByLabelText(/Efectivo/)).toBeTruthy();
    expect(screen.getByLabelText(/Transferencia/)).toBeTruthy();
    expect(screen.getByLabelText(/QR \/ billetera virtual/)).toBeTruthy();
    expect(screen.queryByLabelText(/Mercado Pago/)).toBeNull();
    expect(screen.queryByLabelText(/Tarjeta/)).toBeNull();
  });
});

describe("pedido manual — guardar y mandar el seguimiento (ADMIN-PEDIDOS-48)", () => {
  async function fillAndSubmit(mode: RegExp) {
    open();
    addCafe();
    next();

    fireEvent.click(screen.getByLabelText(/Envío con repartidor/));
    fireEvent.change(screen.getByLabelText("Barrio"), { target: { value: ZONA } });
    fireEvent.click(screen.getByLabelText(mode));
    next();

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Lucía" } });
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: "351 555-1234" } });
    fireEvent.change(screen.getByLabelText("Dirección"), { target: { value: "Av. Siempre Viva 742" } });
    next();

    fireEvent.click(screen.getByLabelText(/QR \/ billetera virtual/));
    click("Crear pedido");
  }

  it("manda a la acción solo lo necesario y muestra el WhatsApp con el link del seguimiento", async () => {
    createManualOrderAction.mockResolvedValue({ ok: true, code: "0123456789abcdef0123", number: 12, total: 1000 });

    await fillAndSubmit(/Buscar repartidor/);

    await waitFor(() => expect(screen.getByText(/cargado y confirmado/)).toBeTruthy());

    expect(createManualOrderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Lucía",
        delivery: "delivery",
        payment: "qr",
        phone: "351 555-1234",
        zoneId: ZONA,
        address: "Av. Siempre Viva 742",
        courierMode: "offers",
        items: [expect.objectContaining({ kind: "product", id: "p-cafe", quantity: 1 })],
      }),
    );

    const link = screen.getByRole("link", { name: "Mandar seguimiento por WhatsApp" }) as HTMLAnchorElement;
    expect(link.href).toContain("https://api.whatsapp.com/send?phone=5493515551234");

    const text = decodeURIComponent(link.href.split("text=")[1]);
    expect(text).toContain("https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123");
    expect(text).toContain("elegir quién te lo lleva");
  });

  it("con 'lo llevo yo' el mensaje no le dice que elija repartidor", async () => {
    createManualOrderAction.mockResolvedValue({ ok: true, code: "0123456789abcdef0123", number: 3, total: 1000 });

    await fillAndSubmit(/Lo llevo yo/);

    const link = (await screen.findByRole("link", { name: "Mandar seguimiento por WhatsApp" })) as HTMLAnchorElement;
    expect(decodeURIComponent(link.href.split("text=")[1])).not.toContain("elegir");
  });

  it("sin teléfono muestra el link para copiar y no el botón de WhatsApp", async () => {
    createManualOrderAction.mockResolvedValue({ ok: true, code: "0123456789abcdef0123", number: 4, total: 1000 });

    open();
    addCafe();
    next();
    fireEvent.click(screen.getByLabelText(/Consumo en el local/));
    next();
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Mostrador" } });
    next();
    fireEvent.click(screen.getByLabelText(/Efectivo/));
    click("Crear pedido");

    const field = (await screen.findByLabelText("Link de seguimiento")) as HTMLInputElement;
    expect(field.value).toBe("https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123");
    expect(screen.queryByRole("link", { name: "Mandar seguimiento por WhatsApp" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copiar" })).toBeTruthy();
  });

  it("avisa al tablero que se creó, y 'Listo' cierra", async () => {
    createManualOrderAction.mockResolvedValue({ ok: true, code: "0123456789abcdef0123", number: 5, total: 1000 });

    const handlers = open();
    addCafe();
    next();
    fireEvent.click(screen.getByLabelText(/Retiro en el local/));
    next();
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Pedro" } });
    next();
    fireEvent.click(screen.getByLabelText(/Efectivo/));
    click("Crear pedido");

    await waitFor(() => expect(handlers.onCreated).toHaveBeenCalledTimes(1));
    expect(handlers.onClose).not.toHaveBeenCalled();

    click("Listo");
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("si la base lo rechaza, muestra el motivo y no cierra", async () => {
    createManualOrderAction.mockResolvedValue({ ok: false, error: "Un producto está sin stock." });

    open();
    addCafe();
    next();
    fireEvent.click(screen.getByLabelText(/Retiro en el local/));
    next();
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Pedro" } });
    next();
    fireEvent.click(screen.getByLabelText(/Efectivo/));
    click("Crear pedido");

    expect(await screen.findByText("Un producto está sin stock.")).toBeTruthy();
    expect(screen.queryByText(/cargado y confirmado/)).toBeNull();
  });
});

describe("pedido manual con envío propio y a coordinar — ENVIO-250 y 252", () => {
  const OWN = "e1e1e1e1-0000-0000-0000-0000000000aa";
  const own = (extra: Partial<ManualOrderSetup["delivery"]> = {}): Partial<ManualOrderSetup> => ({
    delivery: {
      zones: [{ id: OWN, name: "Barrio Norte", price: 1500, favoriteCovers: false }],
      favorite: null,
      kind: "own",
      coordinate: true,
      ownCourier: { id: "rita", name: "Rita" },
      ...extra,
    },
  });

  function toZone(props: Partial<ManualOrderSetup>) {
    open(props);
    addCafe();
    next();
    fireEvent.click(screen.getByLabelText(/Envío con repartidor/));
  }

  it("ofrece su repartidor propio y 'Lo llevo yo', sin ofertas ni favorito", () => {
    toZone(own());
    fireEvent.change(screen.getByLabelText("Barrio"), { target: { value: OWN } });

    expect(screen.getByLabelText(/Asignar a Rita/)).toBeTruthy();
    expect(screen.getByLabelText(/Lo llevo yo/)).toBeTruthy();
    expect(screen.queryByLabelText(/Buscar repartidor/)).toBeNull();
    // Es su precio, no uno de referencia que el repartidor pueda cambiar.
    expect(screen.queryByText(/Precio de referencia/)).toBeNull();
    expect(screen.getByText(/Envío: \$\s?1\.500/)).toBeTruthy();
  });

  it("sin repartidor propio el envío queda a cargo del local", () => {
    toZone(own({ ownCourier: null }));
    fireEvent.change(screen.getByLabelText("Barrio"), { target: { value: OWN } });

    expect(screen.getByText(/Todavía no tenés repartidor asignado/)).toBeTruthy();
    expect(screen.queryByLabelText(/Asignar a/)).toBeNull();
  });

  it("'Otro barrio' pide el barrio escrito y avisa que el costo se coordina", () => {
    toZone(own());
    fireEvent.change(screen.getByLabelText("Barrio", { selector: "select" }), { target: { value: "__otro" } });

    expect(screen.getByPlaceholderText("Escribí el barrio")).toBeTruthy();
    expect(screen.getByText(/El costo del envío se coordina con el cliente/)).toBeTruthy();
  });

  it("sin zonas con precio no hay lista: se escribe el barrio y el envío lo lleva el local", () => {
    toZone({ delivery: { zones: [], favorite: null, kind: "free", coordinate: true, ownCourier: null } });

    expect(screen.queryByRole("combobox", { name: "Barrio" })).toBeNull();
    expect(screen.getByPlaceholderText("Escribí el barrio")).toBeTruthy();
    expect(screen.getByText(/El envío queda a tu cargo, sin repartidor/)).toBeTruthy();
    expect(screen.queryByText(/No hay barrios disponibles/)).toBeNull();
  });

  it("manda el barrio escrito, sin id de zona, y el modo del repartidor propio", async () => {
    createManualOrderAction.mockResolvedValue({ ok: true, code: "0123456789abcdef0123", number: 5, total: 1000 });
    toZone(own());

    fireEvent.change(screen.getByLabelText("Barrio", { selector: "select" }), { target: { value: "__otro" } });
    fireEvent.change(screen.getByPlaceholderText("Escribí el barrio"), { target: { value: "Villa Rural" } });
    fireEvent.click(screen.getByLabelText(/Asignar a Rita/));
    next();

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Lucía" } });
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: "351 555-1234" } });
    fireEvent.change(screen.getByLabelText("Dirección"), { target: { value: "Calle 1 nro 2" } });
    next();
    fireEvent.click(screen.getByLabelText(/QR \/ billetera virtual/));
    click("Crear pedido");

    await waitFor(() => expect(screen.getByText(/cargado y confirmado/)).toBeTruthy());
    expect(createManualOrderAction).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: "", zoneText: "Villa Rural", courierMode: "own" }),
    );
  });

  it("'Otro barrio' sin escribir nada no deja avanzar", () => {
    toZone(own());
    fireEvent.change(screen.getByLabelText("Barrio", { selector: "select" }), { target: { value: "__otro" } });
    fireEvent.click(screen.getByLabelText(/Asignar a Rita/));
    next();

    expect(screen.getByText("Elegí el barrio del envío.")).toBeTruthy();
  });
});

describe("pedido manual — promociones con opciones (ADMIN-PROMOS-8)", () => {
  it("pide lo de cada unidad, con un bloque por unidad, y no deja agregar sin elegir", () => {
    open();

    fireEvent.click(screen.getByText("Combo empanadas"));
    expect(screen.getByRole("region", { name: "Empanada clásica 1 de 2" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Empanada clásica 2 de 2" })).toBeTruthy();
    // La gaseosa no tiene grupos: no hay bloque.
    expect(screen.queryByRole("region", { name: "Gaseosas" })).toBeNull();

    click(/^Agregar/);
    expect(screen.getAllByText("Elegí al menos 1.")).toHaveLength(2);
  });

  it("suma los extras de cada unidad y manda un componente por unidad", async () => {
    open();

    fireEvent.click(screen.getByText("Combo empanadas"));
    const first = within(screen.getByRole("region", { name: "Empanada clásica 1 de 2" }));
    const second = within(screen.getByRole("region", { name: "Empanada clásica 2 de 2" }));
    fireEvent.click(first.getByLabelText("Carne"));
    fireEvent.click(second.getByLabelText(/Jamón y queso/));
    click(/^Agregar \$\s?3\.200/);

    expect(screen.getByText(/Empanada clásica: Carne · Empanada clásica: Jamón y queso · Gaseosas/)).toBeTruthy();

    next();
    fireEvent.click(screen.getByLabelText(/Retiro en el local/));
    next();
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Ana" } });
    next();
    fireEvent.click(screen.getByLabelText(/Efectivo/));
    createManualOrderAction.mockResolvedValue({ ok: true, code: "0123456789abcdef0123", number: 1, total: 3200 });
    click("Crear pedido");

    await waitFor(() => expect(createManualOrderAction).toHaveBeenCalled());
    const sent = createManualOrderAction.mock.calls[0][0];
    expect(sent.items).toEqual([
      expect.objectContaining({
        kind: "promo",
        id: "promo-emp",
        components: [
          { productId: "p-emp", name: "Empanada clásica", options: [expect.objectContaining({ id: "o-carne" })] },
          { productId: "p-emp", name: "Empanada clásica", options: [expect.objectContaining({ id: "o-jyq" })] },
          { productId: "p-gas", name: "Gaseosas", options: [] },
        ],
      }),
    ]);
  });
});
