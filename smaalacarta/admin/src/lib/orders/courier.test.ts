import { describe, expect, it } from "vitest";

import {
  collectionInfo,
  clockTime,
  courierActions,
  courierStatusLabel,
  couriersForOrder,
  deliveryContext,
  favoriteWindow,
  favoriteWindowLabel,
  feeSummary,
  hasCourier,
  hasDelivery,
  searchWarning,
  validateAssignNote,
  validateCourierResponse,
  whatsappDigits,
  type CourierOrder,
  type OrderCourier,
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
  offer_favorite_id: null,
  offer_favorite_until: null,
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
    // También dentro de la ventana del favorito.
    expect(
      courierActions(
        order({ offer_favorite_id: "f", offer_favorite_until: "2099-01-01T00:00:00Z" }),
      ),
    ).toEqual({ assign: true, self: true });
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

describe("la ventana del favorito — ENVIO-80", () => {
  const withWindow = order({ offer_favorite_id: "f", offer_favorite_until: "2026-10-09T22:05:00Z" });

  it("mientras dura, dice quién lo ve y hasta cuándo (hora de Argentina)", () => {
    expect(favoriteWindow(withWindow, at("2026-10-09T22:02:00Z"))).toEqual({ until: "19:05" });
    expect(favoriteWindowLabel(withWindow, at("2026-10-09T22:02:00Z"), "Damián")).toBe(
      "Lo ve solo Damián hasta las 19:05",
    );
  });

  it("al vencer ya no hay ventana", () => {
    expect(favoriteWindow(withWindow, at("2026-10-09T22:05:00Z"))).toBeNull();
    expect(favoriteWindowLabel(withWindow, at("2026-10-09T22:10:00Z"), "Damián")).toBeNull();
  });

  it("sin favorito, o sin búsqueda abierta, no hay ventana", () => {
    expect(favoriteWindow(order(), at("2026-10-09T22:02:00Z"))).toBeNull();
    expect(
      favoriteWindow({ ...withWindow, courier_status: "accepted" }, at("2026-10-09T22:02:00Z")),
    ).toBeNull();
  });

  it("si no se conoce el nombre del favorito, no inventa uno", () => {
    expect(favoriteWindowLabel(withWindow, at("2026-10-09T22:02:00Z"))).toBe(
      "Lo ve solo tu repartidor favorito hasta las 19:05",
    );
  });
});

describe("aviso 'Nadie lo tomó todavía' — ENVIO-82", () => {
  it("antes de los 10 minutos no avisa", () => {
    expect(searchWarning(order(), at("2026-10-09T22:09:59Z"))).toBeNull();
  });

  it("a los 10 minutos avisa y dice cuánto pasó", () => {
    expect(searchWarning(order(), at("2026-10-09T22:10:00Z"))).toMatch(/Nadie lo tomó todavía \(10 min\)/);
    expect(searchWarning(order(), at("2026-10-09T22:25:00Z"))).toMatch(/\(25 min\)/);
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
      "Al confirmar se busca repartidor",
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

describe("lo que manda el repartidor al tomar un pedido — ENVIO-64", () => {
  const input = (extra: Partial<{ note: string; fee: string; reason: string }> = {}) => ({
    note: "",
    fee: "",
    reason: "",
    ...extra,
  });

  it("sin nota ni precio nuevo no manda nada de más", () => {
    expect(validateCourierResponse(input(), 5000)).toEqual({ ok: true, note: null, fee: null, reason: null });
  });

  it("guarda la nota sin espacios de más", () => {
    expect(validateCourierResponse(input({ note: "  Juan, 21:30 " }), 5000)).toMatchObject({
      ok: true,
      note: "Juan, 21:30",
    });
  });

  it("el mismo precio no pide motivo", () => {
    expect(validateCourierResponse(input({ fee: "5.000" }), 5000)).toMatchObject({ ok: true, fee: null });
  });

  it("un precio distinto exige motivo", () => {
    expect(validateCourierResponse(input({ fee: "26000" }), 5000)).toEqual({
      ok: false,
      errors: { reason: "Contá por qué cambia el precio del envío." },
    });
    expect(validateCourierResponse(input({ fee: "$ 26.000", reason: " Fuera de zona " }), 5000)).toEqual({
      ok: true,
      note: null,
      fee: 26000,
      reason: "Fuera de zona",
    });
  });

  it("rechaza precios inválidos, notas y motivos largos", () => {
    expect(validateCourierResponse(input({ fee: "mucho" }), 5000)).toMatchObject({
      ok: false,
      errors: { fee: expect.stringMatching(/precio/i) },
    });
    expect(validateCourierResponse(input({ fee: "-5" }), 5000)).toMatchObject({ ok: false });
    expect(validateCourierResponse(input({ note: "x".repeat(121) }), 5000)).toMatchObject({
      ok: false,
      errors: { note: expect.stringMatching(/120/) },
    });
    expect(validateCourierResponse(input({ fee: "6000", reason: "x".repeat(201) }), 5000)).toMatchObject({
      ok: false,
      errors: { reason: expect.stringMatching(/200/) },
    });
  });
});
