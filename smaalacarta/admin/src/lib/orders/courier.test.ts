import { describe, expect, it } from "vitest";

import {
  collectionInfo,
  clockTime,
  courierActions,
  courierStatusLabel,
  couriersForOrder,
  deliveryContext,
  feeSummary,
  formatCountdown,
  hasCourier,
  hasDelivery,
  acceptsOffers,
  offersLabel,
  pickupEtaNotice,
  returnedNotice,
  searchWarning,
  validateAssignNote,
  validateOffer,
  whatsappDigits,
  type CourierOrder,
  type OrderCourier,
  type OrderOffers,
} from "./courier";

const ZONA = "aaaaaaaa-0000-4000-8000-000000000001";

const order = (extra: Partial<CourierOrder> = {}): CourierOrder => ({
  order_number: "12",
  code: "0123456789abcdef0123",
  status: "confirmed",
  total: 8200,
  payment: "efectivo",
  payment_status: "not_required",
  scheduled_for: null,
  customer_name: "Ana Pérez",
  customer_phone: "3644277105",
  delivery_address: "Av. Siempre Viva 742",
  courier_id: null,
  delivery_zone_id: ZONA,
  delivery_zone_name: "Cantera",
  delivery_fee_list: 5000,
  delivery_fee: 5000,
  delivery_fee_reason: null,
  delivery_fee_changed_at: null,
  courier_status: "searching",
  courier_note: null,
  courier_responded_at: null,
  offered_at: "2026-10-09T22:00:00Z",
  ...extra,
});

const at = (iso: string) => new Date(iso);

describe("pedido con envío — ENVIO-59", () => {
  it("tiene repartidor solo cuando alguien lo tomó o el local lo asignó", () => {
    expect(hasCourier(order())).toBe(false);
    expect(hasCourier(order({ courier_id: "7a0c0e00-0000-4000-8000-000000000001" }))).toBe(true);
  });

  it("lleva envío si tiene estado de envío, aunque todavía no haya repartidor", () => {
    expect(hasDelivery(order({ courier_status: "waiting" }))).toBe(true);
    expect(hasDelivery(order({ courier_status: "searching" }))).toBe(true);
    expect(hasDelivery(order({ courier_status: "self" }))).toBe(true);
    expect(hasDelivery(order({ courier_status: null }))).toBe(false);
  });

  it("el contexto para status.ts lleva el estado del envío y es del local", () => {
    expect(deliveryContext(order({ courier_status: "accepted", courier_id: "r" }))).toEqual({
      courier: true,
      courierStatus: "accepted",
      actor: "business",
    });
    expect(deliveryContext(order()).courier).toBe(false);
  });
});

describe("qué puede hacer el local con el envío — ENVIO-81", () => {
  it("buscando: asignar a mano y llevarlo él, durante toda la búsqueda", () => {
    expect(courierActions(order())).toEqual({ assign: true, self: true });
    expect(courierActions(order({ status: "preparing" }))).toEqual({ assign: true, self: true });
  });

  it("sin buscar (esperando, tomado, propio) o con el pedido terminado: nada", () => {
    const none = { assign: false, self: false };
    expect(courierActions(order({ courier_status: "waiting", status: "pending" }))).toEqual(none);
    expect(courierActions(order({ courier_status: "accepted" }))).toEqual(none);
    expect(courierActions(order({ courier_status: "self" }))).toEqual(none);
    expect(courierActions(order({ courier_status: null }))).toEqual(none);
    expect(courierActions(order({ status: "delivered" }))).toEqual(none);
    expect(courierActions(order({ status: "cancelled" }))).toEqual(none);
  });
});

describe("las ofertas del pedido — ENVIO-117", () => {
  const offer = (extra = {}) => ({
    id: "o1",
    courier_id: "c1",
    repartidor: "Damián",
    precio: 5000,
    motivo: null,
    favorito: true,
    ...extra,
  });
  const offers = (list: ReturnType<typeof offer>[], cierra_en: string | null): OrderOffers => ({
    order_id: "p1",
    cierra_en,
    ofertas: list,
  });

  it("sin ofertas, 'Esperando ofertas'", () => {
    expect(offersLabel(undefined, at("2026-10-09T22:02:00Z"))).toBe("Esperando ofertas");
    expect(offersLabel(offers([], null), at("2026-10-09T22:02:00Z"))).toBe("Esperando ofertas");
  });

  it("con ofertas, cuántas hay y en cuánto se elige sola", () => {
    const now = at("2026-10-09T22:02:00Z");
    expect(offersLabel(offers([offer()], "2026-10-09T22:05:00Z"), now)).toBe(
      "1 oferta, el cliente está eligiendo (se elige sola en 3:00)",
    );
    expect(offersLabel(offers([offer(), offer({ id: "o2" })], "2026-10-09T22:02:05Z"), now)).toBe(
      "2 ofertas, el cliente está eligiendo (se elige sola en 0:05)",
    );
  });

  it("vencido el plazo no muestra una cuenta negativa", () => {
    expect(offersLabel(offers([offer()], "2026-10-09T22:01:00Z"), at("2026-10-09T22:02:00Z"))).toBe(
      "1 oferta, se está eligiendo la más barata",
    );
  });

  it("la cuenta regresiva es m:ss", () => {
    expect(formatCountdown(300_000)).toBe("5:00");
    expect(formatCountdown(61_500)).toBe("1:02");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("aviso 'Nadie ofertó todavía' — ENVIO-118", () => {
  it("antes de los 10 minutos no avisa", () => {
    expect(searchWarning(order(), at("2026-10-09T22:09:59Z"))).toBeNull();
  });

  it("a los 10 minutos avisa y dice cuánto pasó", () => {
    expect(searchWarning(order(), at("2026-10-09T22:10:00Z"))).toMatch(/Nadie ofertó todavía \(10 min\)/);
    expect(searchWarning(order(), at("2026-10-09T22:25:00Z"))).toMatch(/\(25 min\)/);
  });

  it("no avisa si ya hay ofertas", () => {
    expect(searchWarning(order(), at("2026-10-09T22:30:00Z"), 2)).toBeNull();
  });

  it("en precio fijo dice 'Nadie lo tomó todavía' y no habla de ofertas — ENVIO-154", () => {
    const fixed = order({ delivery_mode: "fixed" });

    expect(searchWarning(fixed, at("2026-10-09T22:09:59Z"))).toBeNull();
    expect(searchWarning(fixed, at("2026-10-09T22:10:00Z"))).toMatch(/Nadie lo tomó todavía \(10 min\)/);
    expect(searchWarning(fixed, at("2026-10-09T22:10:00Z"))).not.toMatch(/ofert/i);
  });

  it("solo los pedidos de ofertas muestran conteo y lista de ofertas — ENVIO-154", () => {
    expect(acceptsOffers(order({ delivery_mode: "offers" }))).toBe(true);
    expect(acceptsOffers(order({ delivery_mode: null }))).toBe(true);
    expect(acceptsOffers(order({ delivery_mode: "fixed" }))).toBe(false);
  });

  it("buscando en precio fijo, el estado sigue diciendo desde qué hora — ENVIO-154", () => {
    expect(courierStatusLabel(order({ delivery_mode: "fixed" }))).toMatch(/^Buscando repartidor desde las \d{2}:\d{2}$/);
  });

  it("no avisa si ya lo tomó alguien, lo lleva el local o el pedido terminó", () => {
    const now = at("2026-10-09T23:00:00Z");
    expect(searchWarning(order({ courier_status: "accepted" }), now)).toBeNull();
    expect(searchWarning(order({ courier_status: "self" }), now)).toBeNull();
    expect(searchWarning(order({ courier_status: "waiting", offered_at: null }), now)).toBeNull();
    expect(searchWarning(order({ status: "cancelled" }), now)).toBeNull();
  });

  it("una fecha inválida no rompe", () => {
    expect(searchWarning(order({ offered_at: "ayer" }), at("2026-10-09T23:00:00Z"))).toBeNull();
  });
});

describe("estado y precio del envío — ENVIO-80", () => {
  it("etiqueta el estado del envío", () => {
    expect(courierStatusLabel(order({ courier_status: "waiting", offered_at: null }))).toBe(
      "Todavía sin repartidor",
    );
    expect(courierStatusLabel(order({ courier_status: "waiting", offered_at: null, status: "pending" }))).toBe(
      "Se ofrece a los repartidores cuando lo confirmes",
    );
    expect(courierStatusLabel(order())).toBe("Buscando repartidor desde las 19:00");
    expect(courierStatusLabel(order({ courier_status: "accepted" }), "Damián")).toBe("Lo tomó Damián");
    expect(courierStatusLabel(order({ courier_status: "accepted" }))).toBe("Lo tomó un repartidor");
    expect(courierStatusLabel(order({ courier_status: "self" }))).toBe("Lo llevás vos");
  });

  it("los estados de antes de la búsqueda abierta siguen teniendo etiqueta", () => {
    expect(courierStatusLabel(order({ courier_status: "requested" }))).toBe("Consultado al repartidor");
    expect(courierStatusLabel(order({ courier_status: "rejected" }))).toBe("El repartidor no puede");
  });

  it("la hora sale en horario de Argentina", () => {
    expect(clockTime("2026-10-09T22:00:00Z")).toBe("19:00");
    expect(clockTime(null)).toBeNull();
    expect(clockTime("nunca")).toBeNull();
  });

  it("muestra el precio; si cambió, el de lista y el motivo", () => {
    expect(feeSummary(order())).toEqual({ price: expect.stringMatching(/\$\s?5\.000/) });

    const changed = feeSummary(order({ delivery_fee: 6500, delivery_fee_reason: "Fuera de zona" }));
    expect(changed.price).toMatch(/\$\s?6\.500/);
    expect(changed.list).toMatch(/\$\s?5\.000/);
    expect(changed.reason).toBe("Fuera de zona");
  });
});

describe("repartidores que se pueden asignar a mano — ENVIO-81", () => {
  const courier = (id: string, name: string, zone_ids: string[]): OrderCourier => ({
    id,
    name,
    whatsapp: null,
    zone_ids,
  });

  it("solo los que cubren la zona del pedido, por nombre", () => {
    const list = [
      courier("1", "Zeta", [ZONA]),
      courier("2", "Lejos", ["otra"]),
      courier("3", "Álvaro", [ZONA, "otra"]),
    ];

    expect(couriersForOrder(list, order()).map((c) => c.name)).toEqual(["Álvaro", "Zeta"]);
  });

  it("un pedido sin zona no tiene a quién asignar", () => {
    expect(couriersForOrder([courier("1", "Zeta", [ZONA])], order({ delivery_zone_id: null }))).toEqual([]);
  });

  it("la nota admite hasta 120 caracteres y se recorta", () => {
    expect(validateAssignNote("  Hablamos por WhatsApp ")).toEqual({ ok: true, note: "Hablamos por WhatsApp" });
    expect(validateAssignNote("   ")).toEqual({ ok: true, note: null });
    expect(validateAssignNote("x".repeat(121))).toMatchObject({ ok: false });
  });
});

describe("cuánto cobrar — ENVIO-41", () => {
  it("collectionInfo separa lo que se cobra de lo que se rinde", () => {
    expect(collectionInfo({ payment: "efectivo", total: 8200, fee: 5000 })).toMatchObject({
      cash: true,
      toCollect: 13200,
      toSettle: 8200,
    });
    expect(collectionInfo({ payment: "mercadopago", total: 8200, fee: 5000 })).toMatchObject({
      cash: false,
      toCollect: 5000,
      toSettle: 0,
    });
    expect(collectionInfo({ payment: null, total: 100, fee: null })).toMatchObject({ cash: false, toCollect: 0 });
  });

  // Sin espacios no cortantes ni centavos en cero: el formato de moneda no es lo que se prueba.
  const plain = (text: string) => text.replace(/\s/g, " ").replace(/,00/g, "");

  it("en efectivo cobra pedido más envío y avisa cuánto rendir", () => {
    const { text } = collectionInfo({ payment: "efectivo", total: 8200, fee: 5000 });
    expect(plain(text)).toContain("Cobrar al cliente: $ 8.200 + $ 5.000 = $ 13.200 (rendir $ 8.200 al local)");
  });

  it("con otro medio de pago cobra solo el envío", () => {
    const { text } = collectionInfo({ payment: "transferencia", total: 8200, fee: 5000 });
    expect(plain(text)).toContain("Pagado con Transferencia: cobrar solo el envío $ 5.000");
    expect(text).not.toContain("rendir");
  });
});

describe("número de WhatsApp", () => {
  it("solo dígitos y 549 a un número argentino de 10 dígitos", () => {
    expect(whatsappDigits("364 4277105")).toBe("5493644277105");
    expect(whatsappDigits("0364 4277105")).toBe("5493644277105");
    expect(whatsappDigits("+54 9 364 4277105")).toBe("5493644277105");
    expect(whatsappDigits("sin número")).toBe("");
    expect(whatsappDigits(null)).toBe("");
  });
});

describe("la oferta del repartidor — ENVIO-98", () => {
  const input = (extra: Partial<{ price: string; reason: string }> = {}) => ({ price: "5000", reason: "", ...extra });

  it("con el precio de lista no pide motivo ni lo guarda", () => {
    expect(validateOffer(input(), 5000)).toEqual({ ok: true, price: 5000, reason: null });
    expect(validateOffer(input({ price: "5.000", reason: "no hace falta" }), 5000)).toEqual({
      ok: true,
      price: 5000,
      reason: null,
    });
  });

  it("con otro precio exige el motivo y lo guarda recortado", () => {
    expect(validateOffer(input({ price: "26000" }), 5000)).toEqual({
      ok: false,
      errors: { reason: expect.any(String) },
    });
    expect(validateOffer(input({ price: "$ 26.000", reason: " Fuera de zona " }), 5000)).toEqual({
      ok: true,
      price: 26000,
      reason: "Fuera de zona",
    });
  });

  it("el motivo va de 3 a 140 caracteres", () => {
    expect(validateOffer(input({ price: "6000", reason: "no" }), 5000)).toMatchObject({ ok: false });
    expect(validateOffer(input({ price: "6000", reason: "sí" }), 5000)).toMatchObject({ ok: false });
    expect(validateOffer(input({ price: "6000", reason: "x".repeat(3) }), 5000)).toMatchObject({ ok: true });
    expect(validateOffer(input({ price: "6000", reason: "x".repeat(140) }), 5000)).toMatchObject({ ok: true });
    expect(validateOffer(input({ price: "6000", reason: "x".repeat(141) }), 5000)).toMatchObject({ ok: false });
  });

  it("el precio es obligatorio y tiene que ser válido", () => {
    expect(validateOffer(input({ price: "" }), 5000)).toMatchObject({ ok: false, errors: { price: expect.any(String) } });
    expect(validateOffer(input({ price: "mucho" }), 5000)).toMatchObject({ ok: false });
    expect(validateOffer(input({ price: "-5" }), 5000)).toMatchObject({ ok: false });
    expect(validateOffer(input({ price: "100000000" }), 5000)).toMatchObject({ ok: false });
    expect(validateOffer(input({ price: "5000,50", reason: "Propina" }), 5000)).toMatchObject({
      ok: true,
      price: 5000.5,
    });
  });
});

describe("tiempos del envío en el panel del local — ENVIO-164", () => {
  it("dice a qué hora llega al local, hasta que lo retira", () => {
    // 2026-10-12T00:40:00Z es 21:40 en Argentina.
    const accepted = order({ courier_status: "accepted", courier_eta_pickup_at: "2026-10-12T00:40:00Z" });
    expect(pickupEtaNotice(accepted)).toBe("Llega al local a las 21:40");
    expect(pickupEtaNotice({ ...accepted, status: "handed_to_courier" })).toBeNull();
    expect(pickupEtaNotice({ ...accepted, courier_eta_pickup_at: null })).toBeNull();
    expect(pickupEtaNotice({ ...accepted, courier_status: "searching" })).toBeNull();
  });

  it("si lo devolvió por un cambio de demora, lo dice mientras vuelve a buscar", () => {
    const back = order({ courier_status: "searching", returned_prep_changed: true });
    expect(returnedNotice(back)).toBe("Lo devolvió: cambió la demora");
    expect(courierStatusLabel(back)).toMatch(/^Buscando repartidor desde las/);
    expect(returnedNotice({ ...back, courier_status: "accepted" })).toBeNull();
    expect(returnedNotice({ ...back, returned_prep_changed: false })).toBeNull();
    expect(returnedNotice({ ...back, status: "cancelled" })).toBeNull();
  });
});
