import { describe, expect, it } from "vitest";

import { detectAutoOff, detectEvents } from "./events";
import { insert, update } from "./fixtures";

const kinds = (payload: Parameters<typeof detectEvents>[0]) => detectEvents(payload).map((e) => e.kind);

describe("pedido nuevo con zona del repartidor — ENVIO-225", () => {
  it("avisa aunque no tenga zona común: la zona es del repartidor", () => {
    const own = { delivery_zone_id: null, courier_zone_id: "z-propia" };
    expect(kinds(insert(own))).toContain("offer_new");
  });
});

describe("pedido nuevo para ofertar — ADMIN-PWA-18", () => {
  it("un pedido con envío que nace buscando avisa a los repartidores", () => {
    expect(kinds(insert())).toContain("offer_new");
  });

  it("un pedido anticipado que nace esperando no avisa hasta que el local lo confirma", () => {
    expect(kinds(insert({ courier_status: "waiting" }))).not.toContain("offer_new");

    expect(kinds(update({ courier_status: "waiting" }, { courier_status: "searching", status: "confirmed" }))).toEqual([
      "offer_new",
    ]);
  });

  it("avisa cuando una devolución lo vuelve a poner a buscar", () => {
    const events = kinds(
      update({ courier_status: "accepted", courier_id: "c1" }, { courier_status: "searching", courier_id: null }),
    );
    expect(events).toEqual(["offer_new"]);
  });

  it("un pedido de Mercado Pago sin pagar no se ofrece hasta que se paga", () => {
    expect(kinds(insert({ payment_status: "awaiting" }))).not.toContain("offer_new");
    expect(kinds(update({ payment_status: "awaiting" }, { payment_status: "paid" }))).toEqual(["offer_new"]);
  });

  it("no avisa un pedido de retiro, uno cancelado ni uno que ya tiene repartidor", () => {
    expect(kinds(insert({ courier_status: null, delivery: "retiro", delivery_zone_id: null }))).not.toContain("offer_new");
    expect(kinds(insert({ status: "cancelled" }))).not.toContain("offer_new");
    expect(kinds(insert({ courier_id: "c1", courier_status: "accepted" }))).not.toContain("offer_new");
  });
});

describe("elección del repartidor — ADMIN-PWA-19, 20 y 23", () => {
  const chosen = update(
    { courier_status: "searching", courier_id: null },
    { courier_status: "accepted", courier_id: "c1" },
  );

  it("avisa al elegido, a los que no fueron elegidos y al local", () => {
    expect(kinds(chosen).sort()).toEqual(["courier_chosen", "courier_not_chosen", "local_courier_chosen"]);
  });

  it("un pedido manual que nace asignado al favorito avisa solo a ese repartidor (ENVIO-142)", () => {
    expect(kinds(insert({ source: "manual", courier_status: "accepted", courier_id: "c1", status: "confirmed" }))).toEqual([
      "courier_chosen",
    ]);
  });

  it("un pedido manual con 'lo llevo yo' no avisa a nadie", () => {
    expect(kinds(insert({ source: "manual", courier_status: "self", status: "confirmed" }))).toEqual([]);
  });

  it("'lo llevo yo' del local avisa solo a los que ofertaron", () => {
    expect(kinds(update({ courier_status: "searching" }, { courier_status: "self" }))).toEqual(["courier_not_chosen"]);
  });

  it("un cambio de estado de un pedido que ya tiene repartidor no avisa nada (ADMIN-PWA-25)", () => {
    expect(
      kinds(
        update(
          { courier_status: "accepted", courier_id: "c1", status: "confirmed" },
          { courier_status: "accepted", courier_id: "c1", status: "preparing" },
        ),
      ),
    ).toEqual([]);
  });
});

describe("cancelación — ADMIN-PWA-21", () => {
  it("al pasar a cancelado avisa a los repartidores del pedido", () => {
    expect(kinds(update({ status: "pending" }, { status: "cancelled" }))).toEqual(["order_cancelled"]);
  });

  it("un pedido que ya estaba cancelado no vuelve a avisar", () => {
    expect(kinds(update({ status: "cancelled" }, { status: "cancelled", delivery_fee: 6000 }))).toEqual([]);
  });
});

describe("avisos al local — ADMIN-PWA-22 y 24", () => {
  it("un pedido del menú web avisa al local, también el de retiro", () => {
    expect(kinds(insert())).toContain("local_new_order");
    expect(kinds(insert({ courier_status: null, delivery: "retiro" }))).toEqual(["local_new_order"]);
  });

  it("un pedido que carga el propio local no avisa", () => {
    expect(kinds(insert({ source: "manual" }))).not.toContain("local_new_order");
  });

  it("avisa que nadie ofertó cuando se marca, y no cuando ya estaba marcada", () => {
    const marked = "2026-10-11T18:00:00Z";
    expect(kinds(update({ no_offers_alerted_at: null }, { no_offers_alerted_at: marked }))).toEqual(["local_no_offers"]);
    expect(kinds(update({ no_offers_alerted_at: marked }, { no_offers_alerted_at: marked, status: "confirmed" }))).toEqual([]);
  });

  it("limpiar la marca al volver a buscar no avisa de que nadie ofertó", () => {
    expect(
      kinds(update({ no_offers_alerted_at: "2026-10-11T18:00:00Z", courier_status: "accepted" }, { courier_status: "searching" })),
    ).toEqual(["offer_new"]);
  });
});

describe("lo que no es un pedido", () => {
  it("ignora otras tablas, borrados y cuerpos sin registro", () => {
    expect(detectEvents({ ...insert(), table: "products" })).toEqual([]);
    expect(detectEvents({ type: "DELETE", table: "orders", record: null, old_record: insert().record })).toEqual([]);
    expect(detectEvents({ type: "INSERT", table: "orders", record: null, old_record: null })).toEqual([]);
  });
});

describe("recordatorio de pedido nuevo — ADMIN-PWA-33", () => {
  it("avisa al local cuando el recordatorio sube y el pedido sigue pendiente", () => {
    expect(kinds(update({ new_order_reminders: 0 }, { new_order_reminders: 1 }))).toEqual(["local_new_order_reminder"]);
    expect(kinds(update({ new_order_reminders: 4 }, { new_order_reminders: 5 }))).toEqual(["local_new_order_reminder"]);
  });

  it("no avisa si el pedido ya salió de pendiente o lo cargó el local", () => {
    expect(kinds(update({ new_order_reminders: 1 }, { new_order_reminders: 2, status: "confirmed" }))).toEqual([]);
    expect(kinds(update({ new_order_reminders: 1 }, { new_order_reminders: 2, status: "cancelled" }))).not.toContain(
      "local_new_order_reminder",
    );
    expect(kinds(update({ new_order_reminders: 0 }, { new_order_reminders: 1, source: "manual" }))).toEqual([]);
  });

  it("un cambio que no sube el contador no es un recordatorio (ADMIN-PWA-25)", () => {
    expect(kinds(update({ new_order_reminders: 2 }, { new_order_reminders: 2, payment_status: "paid" }))).toEqual([]);
    expect(kinds(insert({ new_order_reminders: 0 }))).not.toContain("local_new_order_reminder");
  });

  it("confirmar el pedido no vuelve a avisar nada", () => {
    expect(kinds(update({ status: "pending", new_order_reminders: 2 }, { status: "confirmed", new_order_reminders: 2 }))).toEqual([]);
  });
});

describe("circuito de tiempos — ENVIO-158 a 160", () => {
  const taken = { courier_status: "accepted", courier_id: "c-moto", status: "confirmed" };

  it("el aviso previo sale cuando la marca pasa de vacía a puesta", () => {
    expect(
      kinds(update({ ...taken, pickup_reminder_sent_at: null }, { ...taken, pickup_reminder_sent_at: "2026-10-12T15:20:00Z" })),
    ).toEqual(["courier_pickup_soon"]);
  });

  it("no repite el aviso previo en otro cambio con la marca puesta", () => {
    const sent = { ...taken, pickup_reminder_sent_at: "2026-10-12T15:20:00Z" };
    expect(kinds(update(sent, { ...sent, payment_status: "paid" }))).toEqual([]);
  });

  it("al rearmar el aviso (la marca se borra) no avisa", () => {
    expect(kinds(update({ ...taken, pickup_reminder_sent_at: "2026-10-12T15:20:00Z" }, { ...taken, pickup_reminder_sent_at: null }))).toEqual([]);
  });

  it("Listo avisa al repartidor del pedido y a nadie si no tiene", () => {
    expect(kinds(update({ ...taken, status: "preparing" }, { ...taken, status: "ready" }))).toEqual(["courier_order_ready"]);
    expect(kinds(update({ status: "preparing" }, { status: "ready" }))).toEqual([]);
  });

  it("cambiar la demora con repartidor avisa con la hora nueva", () => {
    expect(
      kinds(update({ ...taken, prep_ready_at: "2026-10-12T15:30:00Z" }, { ...taken, prep_ready_at: "2026-10-12T16:00:00Z" })),
    ).toEqual(["courier_prep_changed"]);
  });

  it("cargar la demora por primera vez con repartidor también avisa; sin repartidor no", () => {
    expect(kinds(update({ ...taken, prep_ready_at: null }, { ...taken, prep_ready_at: "2026-10-12T16:00:00Z" }))).toEqual([
      "courier_prep_changed",
    ]);
    expect(kinds(update({ prep_ready_at: "2026-10-12T15:30:00Z" }, { prep_ready_at: "2026-10-12T16:00:00Z" }))).toEqual([]);

    // La misma hora escrita distinto (formato, milisegundos o zona) no es un cambio (ENVIO-167).
    for (const same of ["2026-10-12T15:30:00.000Z", "2026-10-12T15:30:00+00:00", "2026-10-12T12:30:00-03:00", "2026-10-12T15:30:00+00"]) {
      expect(
        kinds(update({ ...taken, prep_ready_at: "2026-10-12T15:30:00Z" }, { ...taken, prep_ready_at: same })),
      ).toEqual([]);
    }
  });

  it("un pedido ya entregado o cancelado no avisa por la demora", () => {
    expect(
      kinds(update({ ...taken, prep_ready_at: "2026-10-12T15:30:00Z" }, { ...taken, status: "cancelled", prep_ready_at: "2026-10-12T16:00:00Z" })),
    ).toEqual(["order_cancelled"]);
  });
});

describe("apagado automático de la disponibilidad — ENVIO-194", () => {
  const record = (extra: Record<string, unknown> = {}) => ({
    id: "e1",
    courier_id: "c-moto",
    available: false,
    reason: "auto_off",
    ...extra,
  });
  const payload = (extra: Record<string, unknown> = {}, type = "INSERT") => ({
    type,
    table: "courier_availability_events",
    record: record(extra),
  });

  it("avisa al repartidor cuando se apagó solo", () => {
    expect(detectAutoOff(payload())).toBe("c-moto");
  });

  it("no avisa si apagó a mano, si se prendió, si no es un alta o si es otra tabla", () => {
    expect(detectAutoOff(payload({ reason: "manual" }))).toBeNull();
    expect(detectAutoOff(payload({ available: true }))).toBeNull();
    expect(detectAutoOff(payload({}, "UPDATE"))).toBeNull();
    expect(detectAutoOff({ ...payload(), table: "orders" })).toBeNull();
    expect(detectAutoOff({ ...payload(), record: null })).toBeNull();
    expect(detectAutoOff(payload({ courier_id: "" }))).toBeNull();
  });
});
