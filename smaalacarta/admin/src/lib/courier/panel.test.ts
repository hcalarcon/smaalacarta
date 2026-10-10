import { describe, expect, it } from "vitest";

import {
  availableActions,
  chatLink,
  groupOf,
  isToRespond,
  splitOrders,
  telLink,
  type CourierPanelOrder,
} from "./panel";
import { newPendingIds, pendingCount, tabTitle } from "@/lib/orders/alerts";

const order = (
  id: string,
  estado: string,
  envio: string | null,
  extra: Partial<CourierPanelOrder> = {},
): CourierPanelOrder => ({
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
  items: [],
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
});

describe("grupos del panel — ENVIO-31", () => {
  it.each([
    ["pending", "waiting", "por_responder"],
    ["pending", "requested", "por_responder"],
    ["pending", "accepted", "en_curso"],
    ["confirmed", "accepted", "en_curso"],
    ["preparing", "accepted", "en_curso"],
    ["ready", "accepted", "en_curso"],
    ["handed_to_courier", "accepted", "en_curso"],
    ["on_the_way", "accepted", "en_curso"],
    ["delivered", "accepted", "historial"],
    ["cancelled", "accepted", "historial"],
    ["cancelled", "waiting", "historial"],
    ["pending", "rejected", "historial"],
  ])("pedido %s con envío %s → %s", (estado, envio, grupo) => {
    expect(groupOf(order("1", estado, envio))).toBe(grupo);
  });

  it("un envío sin estado conocido va al historial, para no molestar", () => {
    expect(groupOf(order("1", "pending", null))).toBe("historial");
    expect(groupOf(order("1", "pending", "volando"))).toBe("historial");
  });

  it("reparte los pedidos: por responder y en curso, los más viejos primero; historial, los más nuevos", () => {
    const orders = [
      order("a", "pending", "waiting", { creado: "2026-10-09T22:10:00Z" }),
      order("b", "pending", "requested", { creado: "2026-10-09T22:00:00Z" }),
      order("c", "ready", "accepted", { creado: "2026-10-09T21:00:00Z" }),
      order("d", "delivered", "accepted", { creado: "2026-10-09T20:00:00Z" }),
      order("e", "cancelled", "waiting", { creado: "2026-10-09T20:30:00Z" }),
    ];

    const groups = splitOrders(orders);
    expect(groups.por_responder.map((o) => o.id)).toEqual(["b", "a"]);
    expect(groups.en_curso.map((o) => o.id)).toEqual(["c"]);
    expect(groups.historial.map((o) => o.id)).toEqual(["e", "d"]);
  });
});

describe("acciones del repartidor — ENVIO-32", () => {
  it("por responder: aceptar o no poder; nada de avanzar", () => {
    expect(availableActions(order("1", "pending", "waiting"))).toEqual({
      respond: true,
      onTheWay: false,
      delivered: false,
    });
    expect(availableActions(order("1", "pending", "requested")).respond).toBe(true);
  });

  it("aceptado: no se responde; solo avanza cuando el local se lo entregó", () => {
    const sin = { respond: false, onTheWay: false, delivered: false };
    expect(availableActions(order("1", "pending", "accepted"))).toEqual(sin);
    expect(availableActions(order("1", "preparing", "accepted"))).toEqual(sin);
    expect(availableActions(order("1", "ready", "accepted"))).toEqual(sin);

    expect(availableActions(order("1", "handed_to_courier", "accepted"))).toEqual({
      respond: false,
      onTheWay: true,
      delivered: false,
    });
    expect(availableActions(order("1", "on_the_way", "accepted"))).toEqual({
      respond: false,
      onTheWay: false,
      delivered: true,
    });
  });

  it("terminado, cancelado o rechazado: ninguna", () => {
    const sin = { respond: false, onTheWay: false, delivered: false };
    expect(availableActions(order("1", "delivered", "accepted"))).toEqual(sin);
    expect(availableActions(order("1", "cancelled", "requested"))).toEqual(sin);
    expect(availableActions(order("1", "pending", "rejected"))).toEqual(sin);
  });
});

describe("aviso de pedidos nuevos — ENVIO-33", () => {
  const orders = [
    order("1", "pending", "waiting"),
    order("2", "pending", "accepted"),
    order("3", "pending", "requested"),
    order("4", "delivered", "accepted"),
  ];

  it("solo cuenta y avisa los que esperan respuesta", () => {
    expect(pendingCount(orders, isToRespond)).toBe(2);
    expect(newPendingIds(new Set<string>(), orders, isToRespond)).toEqual(["1", "3"]);
    expect(newPendingIds(new Set(["1"]), orders, isToRespond)).toEqual(["3"]);
  });

  it("sin el predicado, alerts sigue mirando status === pending (panel del local)", () => {
    expect(pendingCount([{ id: "1", status: "pending" }, { id: "2", status: "ready" }])).toBe(1);
    expect(newPendingIds(new Set(), [{ id: "1", status: "pending" }])).toEqual(["1"]);
  });

  it("el título de la pestaña lleva la cantidad y un rótulo propio", () => {
    expect(tabTitle("Pedidos", 2)).toBe("(2) Nuevo pedido · Pedidos");
    expect(tabTitle("Pedidos", 2, "Envío por responder")).toBe("(2) Envío por responder · Pedidos");
    expect(tabTitle("Pedidos", 0, "Envío por responder")).toBe("Pedidos");
  });
});

describe("links de contacto — ENVIO-31", () => {
  it("WhatsApp: solo dígitos y 549 a un número argentino de 10 dígitos", () => {
    expect(chatLink("+54 9 364 4277105")).toBe("https://api.whatsapp.com/send?phone=5493644277105");
    expect(chatLink("364 4277105")).toBe("https://api.whatsapp.com/send?phone=5493644277105");
  });

  it("tel: con los dígitos y el + si lo tenía", () => {
    expect(telLink("364 427-7105")).toBe("tel:3644277105");
    expect(telLink("+54 9 364 4277105")).toBe("tel:+5493644277105");
  });

  it("sin número no hay link", () => {
    expect(chatLink(null)).toBeNull();
    expect(chatLink("")).toBeNull();
    expect(telLink(undefined)).toBeNull();
    expect(telLink("sin número")).toBeNull();
  });
});
