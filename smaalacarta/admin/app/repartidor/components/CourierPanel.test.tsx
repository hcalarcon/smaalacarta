import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CourierOrderCard from "./CourierOrderCard";
import CourierOrdersClient from "./CourierOrdersClient";
import ZonesClient from "../zonas/components/ZonesClient";
import type { CourierPanelOrder } from "@/lib/courier/panel";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  respond: vi.fn(),
  advance: vi.fn(),
  settle: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  setActive: vi.fn(),
  deleteZone: vi.fn(),
  reorder: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({
  respondOrderAction: mocks.respond,
  advanceOrderAction: mocks.advance,
  markSettledAction: mocks.settle,
  createZoneAction: mocks.createZone,
  updateZoneAction: mocks.updateZone,
  setZoneActiveAction: mocks.setActive,
  deleteZoneAction: mocks.deleteZone,
  reorderZonesAction: mocks.reorder,
}));
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [
    mocks.respond,
    mocks.advance,
    mocks.settle,
    mocks.createZone,
    mocks.updateZone,
    mocks.setActive,
    mocks.deleteZone,
    mocks.reorder,
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

const now = new Date("2026-10-09T22:05:00Z");
const card = (o: CourierPanelOrder, onRespond = vi.fn(), onAdvance = vi.fn(), onSettle = vi.fn()) =>
  render(
    <CourierOrderCard
      order={o}
      now={now}
      busy={false}
      error={null}
      onRespond={onRespond}
      onAdvance={onAdvance}
      onSettle={onSettle}
    />,
  );

describe("pedido en el panel del repartidor — ENVIO-31", () => {
  it("muestra local, cliente, barrio, precio, total del local, pago y productos con opciones", () => {
    card(order("12", "pending", "waiting"));

    expect(screen.getAllByText(/Ana Resto/).length).toBeGreaterThan(0);
    expect(screen.getByText("San Martín 100")).toBeTruthy();
    expect(screen.getByText("Cliente")).toBeTruthy();
    expect(screen.getByText("Calle 123")).toBeTruthy();
    expect(screen.getByText("3644277105")).toBeTruthy();
    expect(screen.getByText("Cantera")).toBeTruthy();
    expect(screen.getAllByText(/\$\s?8\.200/).length).toBeGreaterThan(0);
    expect(screen.getByText("efectivo")).toBeTruthy();
    expect(screen.getByText("2 × Helado")).toBeTruthy();
    expect(screen.getByText("+ Frutilla ×2")).toBeTruthy();
  });

  it("los botones de contacto llevan a WhatsApp y a la llamada", () => {
    card(order("12", "pending", "waiting"));

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
      order("12", "pending", "waiting", {
        negocio: { nombre: "<img src=x onerror=alert(1)>", direccion: null, whatsapp: null },
      }),
    );

    expect(container.querySelector("img")).toBeNull();
  });
});

describe("acciones del repartidor — ENVIO-32", () => {
  it("Aceptar con nota y el mismo precio, sin pedir motivo", () => {
    const onRespond = vi.fn();
    card(order("12", "pending", "waiting"), onRespond);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    fireEvent.change(screen.getByPlaceholderText("Juan, 21:30"), { target: { value: "Juan, 21:30" } });
    expect(screen.queryByLabelText(/motivo del cambio/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar: acepto" }));

    expect(onRespond).toHaveBeenCalledWith("accept", { note: "Juan, 21:30", fee: "5000", reason: "" });
  });

  it("un precio distinto exige motivo", () => {
    const onRespond = vi.fn();
    card(order("12", "pending", "waiting"), onRespond);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    fireEvent.change(screen.getByLabelText(/precio final del envío/i), { target: { value: "26000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar: acepto" }));

    expect(onRespond).not.toHaveBeenCalled();
    expect(screen.getByText(/por qué cambia el precio/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/motivo del cambio/i), { target: { value: "Fuera de zona" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar: acepto" }));

    expect(onRespond).toHaveBeenCalledWith("accept", { note: "", fee: "26000", reason: "Fuera de zona" });
  });

  it("No puedo registra el rechazo", () => {
    const onRespond = vi.fn();
    card(order("12", "pending", "requested"), onRespond);

    fireEvent.click(screen.getByRole("button", { name: "No puedo" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar: no puedo" }));

    expect(onRespond).toHaveBeenCalledWith("reject", { note: "", fee: "", reason: "" });
  });

  it("entregado al repartidor ofrece En camino; en camino ofrece Entregado", () => {
    const onAdvance = vi.fn();
    const first = card(order("12", "handed_to_courier", "accepted"), vi.fn(), onAdvance);

    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "En camino" }));
    expect(onAdvance).toHaveBeenCalledWith("on_the_way");

    first.unmount();
    card(order("12", "on_the_way", "accepted"), vi.fn(), onAdvance);
    fireEvent.click(screen.getByRole("button", { name: "Entregado" }));
    expect(onAdvance).toHaveBeenCalledWith("delivered");
  });

  it("antes de que el local lo entregue no hay botones de avance", () => {
    card(order("12", "preparing", "accepted"));
    expect(screen.queryByRole("button", { name: /en camino|entregado|aceptar/i })).toBeNull();
  });
});

describe("tablero del repartidor — ENVIO-31", () => {
  it("separa por responder, aceptados en curso e historial", () => {
    render(
      <CourierOrdersClient
        serverNow="2026-10-09T22:05:00Z"
        orders={[
          order("1", "pending", "waiting"),
          order("2", "ready", "accepted"),
          order("3", "delivered", "accepted"),
          order("4", "pending", "rejected"),
        ]}
      />,
    );

    const section = (name: string) => screen.getByRole("region", { name }) as HTMLElement;

    expect(section("Por responder").textContent).toContain("#1 ");
    expect(section("Aceptados en curso").textContent).toContain("#2 ");
    expect(section("Historial").textContent).toContain("#3 ");
    expect(section("Historial").textContent).toContain("#4 ");
    expect(section("Por responder").textContent).not.toContain("#2 ");
  });

  it("responder llama a la acción con el pedido y el precio actual", async () => {
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" orders={[order("1", "pending", "waiting")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar: acepto" }));

    await waitFor(() => expect(mocks.respond).toHaveBeenCalled());
    expect(mocks.respond).toHaveBeenCalledWith("1", "accept", { note: "", fee: "5000", reason: "" }, 5000);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("si la acción falla, el error se ve en ese pedido", async () => {
    mocks.respond.mockResolvedValue({ ok: false, error: "Ese cambio de estado no está permitido." });
    render(<CourierOrdersClient serverNow="2026-10-09T22:05:00Z" orders={[order("1", "pending", "waiting")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar: acepto" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no está permitido/i));
  });
});

describe("cuánto cobrar y rendiciones — ENVIO-41 y 42", () => {
  const settled = { rendido_el: "2026-10-09T23:00:00Z", recibido_el: null };
  const received = { rendido_el: "2026-10-09T23:00:00Z", recibido_el: "2026-10-09T23:30:00Z" };
  const plain = (text: string | null) => (text ?? "").replace(/\s/g, " ").replace(/,00/g, "");

  it("en efectivo muestra cuánto cobrar y cuánto rendir", () => {
    card(order("12", "pending", "waiting"));
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

describe("barrios y precios — ENVIO-36 y 37", () => {
  const zones = [
    { id: "z1", name: "Cantera", price: 5000, sort_order: 1, active: true },
    { id: "z2", name: "Oasis", price: 5500, sort_order: 2, active: false },
  ];

  it("lista los barrios con su precio", () => {
    render(<ZonesClient zones={zones} />);

    expect(screen.getByText("Cantera")).toBeTruthy();
    expect(screen.getByText(/\$\s?5\.500/)).toBeTruthy();
  });

  it("no guarda un barrio con el nombre repetido ni con un precio inválido", () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "cantera" } });
    fireEvent.change(screen.getByLabelText("Precio"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByText(/ya existe un barrio/i)).toBeTruthy();
    expect(screen.getByText(/precio válido/i)).toBeTruthy();
    expect(mocks.createZone).not.toHaveBeenCalled();
  });

  it("agrega un barrio válido", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Arenal" } });
    fireEvent.change(screen.getByLabelText("Precio"), { target: { value: "7.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(mocks.createZone).toHaveBeenCalledWith({ name: "Arenal", price: "7.000" }));
  });

  it("edita nombre y precio", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    fireEvent.change(screen.getByDisplayValue("5000"), { target: { value: "6000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.updateZone).toHaveBeenCalledWith("z1", { name: "Cantera", price: "6000" }));
  });

  it("activa y desactiva", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.click(screen.getByLabelText("Activo: Oasis"));

    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith("z2", true));
  });

  it("borra solo después de confirmar", async () => {
    render(<ZonesClient zones={zones} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Borrar" })[0]);
    expect(mocks.deleteZone).not.toHaveBeenCalled();
    expect(screen.getByText(/Borrar Cantera/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mocks.deleteZone).toHaveBeenCalledWith("z1"));
  });
});
