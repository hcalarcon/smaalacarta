import { describe, expect, it } from "vitest";

import {
  availableActions,
  chatLink,
  chosenOrderIds,
  groupOf,
  isToRespond,
  myOfferLabel,
  offersCountLabel,
  resultNotice,
  sortAvailable,
  splitOrders,
  telLink,
  validateReturnReason,
  type AvailableOrder,
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

const available = (id: string, extra: Partial<AvailableOrder> = {}): AvailableOrder => ({
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

describe("grupos del panel — ENVIO-76", () => {
  it.each([
    ["pending", "accepted", "en_curso"],
    ["confirmed", "accepted", "en_curso"],
    ["preparing", "accepted", "en_curso"],
    ["ready", "accepted", "en_curso"],
    ["handed_to_courier", "accepted", "en_curso"],
    ["on_the_way", "accepted", "en_curso"],
    ["delivered", "accepted", "historial"],
    ["cancelled", "accepted", "historial"],
    // Los viejos que quedaron sin aceptar no son "en curso" para nadie.
    ["pending", "waiting", "historial"],
    ["pending", "requested", "historial"],
    ["pending", "rejected", "historial"],
    ["cancelled", "waiting", "historial"],
  ])("pedido %s con envío %s → %s", (estado, envio, grupo) => {
    expect(groupOf(order("1", estado, envio))).toBe(grupo);
  });

  it("un envío sin estado conocido va al historial, para no molestar", () => {
    expect(groupOf(order("1", "pending", null))).toBe("historial");
    expect(groupOf(order("1", "pending", "volando"))).toBe("historial");
  });

  it("reparte los pedidos que tomó: en curso, los más viejos primero; historial, los más nuevos", () => {
    const orders = [
      order("a", "ready", "accepted", { creado: "2026-10-09T22:10:00Z" }),
      order("b", "preparing", "accepted", { creado: "2026-10-09T22:00:00Z" }),
      order("d", "delivered", "accepted", { creado: "2026-10-09T20:00:00Z" }),
      order("e", "cancelled", "accepted", { creado: "2026-10-09T20:30:00Z" }),
    ];

    const groups = splitOrders(orders);
    expect(groups.en_curso.map((o) => o.id)).toEqual(["b", "a"]);
    expect(groups.historial.map((o) => o.id)).toEqual(["e", "d"]);
  });

  it("los disponibles van del que lleva más tiempo buscando al más nuevo", () => {
    const list = [
      available("nuevo", { ofrecido_el: "2026-10-09T22:30:00Z" }),
      available("viejo", { ofrecido_el: "2026-10-09T22:01:00Z" }),
      available("sin-fecha", { ofrecido_el: null, creado: "2026-10-09T22:10:00Z" }),
    ];

    expect(sortAvailable(list).map((o) => o.id)).toEqual(["viejo", "sin-fecha", "nuevo"]);
    // No toca la lista original.
    expect(list[0].id).toBe("nuevo");
  });
});

describe("acciones del repartidor — ENVIO-77", () => {
  it("tomado antes de que el local lo entregue: solo puede devolverlo", () => {
    for (const estado of ["pending", "confirmed", "preparing", "ready"]) {
      expect(availableActions(order("1", estado, "accepted")), estado).toEqual({
        returnOrder: true,
        onTheWay: false,
        delivered: false,
      });
    }
  });

  it("entregado al repartidor: En camino y ya no se devuelve; en camino: Entregado", () => {
    expect(availableActions(order("1", "handed_to_courier", "accepted"))).toEqual({
      returnOrder: false,
      onTheWay: true,
      delivered: false,
    });
    expect(availableActions(order("1", "on_the_way", "accepted"))).toEqual({
      returnOrder: false,
      onTheWay: false,
      delivered: true,
    });
  });

  it("terminado, cancelado o sin aceptar: ninguna", () => {
    const sin = { returnOrder: false, onTheWay: false, delivered: false };
    expect(availableActions(order("1", "delivered", "accepted"))).toEqual(sin);
    expect(availableActions(order("1", "cancelled", "accepted"))).toEqual(sin);
    expect(availableActions(order("1", "pending", "rejected"))).toEqual(sin);
    expect(availableActions(order("1", "pending", "waiting"))).toEqual(sin);
  });
});

describe("motivo de la devolución — ENVIO-66", () => {
  it("es obligatorio y se recorta", () => {
    expect(validateReturnReason("  Se pinchó la moto ")).toEqual({ ok: true, reason: "Se pinchó la moto" });
    expect(validateReturnReason("   ")).toMatchObject({ ok: false });
    expect(validateReturnReason("")).toMatchObject({ ok: false });
  });

  it("admite hasta 200 caracteres", () => {
    expect(validateReturnReason("x".repeat(200))).toMatchObject({ ok: true });
    expect(validateReturnReason("x".repeat(201))).toMatchObject({ ok: false });
  });
});

describe("aviso de pedidos nuevos — ENVIO-78 y 116", () => {
  const orders = [
    available("1"),
    available("2", { estado: "cancelled" }),
    available("3", { estado: "preparing" }),
    available("4", { estado: "delivered" }),
  ];

  it("no avisa lo que ya ofertó ni las ofertas cerradas", () => {
    const mine = { id: "o", precio: 5000, motivo: null, creada: "2026-10-09T22:02:00Z" };
    expect(isToRespond(available("1", { mi_oferta: mine }))).toBe(false);
    expect(isToRespond(available("1", { resultado: "chosen_other" }))).toBe(false);
    expect(isToRespond(available("1"))).toBe(true);
  });

  it("detecta los pedidos que había ofertado y ahora lo eligieron a él", () => {
    const orders = [order("1", "preparing", "accepted"), order("2", "preparing", "accepted"), order("3", "delivered", "accepted")];

    expect(chosenOrderIds(new Set(["1", "3", "9"]), orders)).toEqual(["1"]);
    expect(chosenOrderIds(new Set(), orders)).toEqual([]);
  });

  it("solo cuenta y avisa los disponibles que siguen abiertos", () => {
    expect(isToRespond(available("1"))).toBe(true);
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
    expect(tabTitle("Pedidos", 2, "Pedido disponible")).toBe("(2) Pedido disponible · Pedidos");
    expect(tabTitle("Pedidos", 0, "Pedido disponible")).toBe("Pedidos");
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

describe("textos de las ofertas — ENVIO-113 a 115", () => {
  it("cuántas ofertas hay", () => {
    expect(offersCountLabel(0)).toBe("Sin ofertas todavía");
    expect(offersCountLabel(1)).toBe("1 oferta");
    expect(offersCountLabel(4)).toBe("4 ofertas");
  });

  it("la propia oferta", () => {
    const mine = { id: "o", precio: 6000, motivo: null, creada: "2026-10-09T22:02:00Z" };
    expect(myOfferLabel(available("1", { mi_oferta: mine }), (n) => `$${n}`)).toBe(
      "Tu oferta: $6000, esperando al cliente",
    );
    expect(myOfferLabel(available("1"), (n) => `$${n}`)).toBeNull();
  });

  it("el aviso de una oferta cerrada", () => {
    expect(resultNotice(available("1", { resultado: "chosen_other" }))).toBe("El cliente eligió otro repartidor");
    expect(resultNotice(available("1", { resultado: "cancelled" }))).toBe("Cancelado por el local");
    expect(resultNotice(available("1", { resultado: "closed" }))).toBe("El local resolvió el envío");
    expect(resultNotice(available("1"))).toBeNull();
  });

  it("los avisos de ofertas cerradas van al final de la lista", () => {
    const list = [
      available("cerrada", { resultado: "chosen_other", ofrecido_el: "2026-10-09T21:00:00Z" }),
      available("abierta", { ofrecido_el: "2026-10-09T22:30:00Z" }),
    ];
    expect(sortAvailable(list).map((o) => o.id)).toEqual(["abierta", "cerrada"]);
  });
});
