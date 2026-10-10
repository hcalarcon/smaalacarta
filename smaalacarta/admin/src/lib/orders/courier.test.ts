import { describe, expect, it } from "vitest";

import {
  confirmBlockReason,
  courierActions,
  courierRequestMessage,
  courierStatusLabel,
  courierWhatsappLink,
  deliveryContext,
  feeSummary,
  hasCourier,
  noResponseWarning,
  readyTimeDefault,
  validateCourierResponse,
  type CourierOrder,
} from "./courier";

const order = (extra: Partial<CourierOrder> = {}): CourierOrder => ({
  order_number: "12",
  code: "0123456789abcdef0123",
  status: "pending",
  total: 8200,
  payment: "efectivo",
  payment_status: "not_required",
  scheduled_for: null,
  customer_name: "Ana Pérez",
  customer_phone: "3644277105",
  delivery_address: "Av. Siempre Viva 742",
  courier_id: "7a0c0e00-0000-4000-8000-000000000001",
  delivery_zone_name: "Cantera",
  delivery_fee_list: 5000,
  delivery_fee: 5000,
  delivery_fee_reason: null,
  delivery_fee_changed_at: null,
  courier_status: "waiting",
  courier_note: null,
  courier_requested_at: null,
  courier_responded_at: null,
  ...extra,
});

describe("pedido con envío — ENVIO-23", () => {
  it("lo es solo con repartidor", () => {
    expect(hasCourier(order())).toBe(true);
    expect(hasCourier(order({ courier_id: null }))).toBe(false);
  });

  it("el contexto para status.ts lleva el estado del envío y es del local", () => {
    expect(deliveryContext(order({ courier_status: "accepted" }))).toEqual({
      courier: true,
      courierStatus: "accepted",
      actor: "business",
    });
    expect(deliveryContext(order({ courier_id: null, courier_status: null })).courier).toBe(false);
  });
});

describe("mensaje de WhatsApp al repartidor — ENVIO-23", () => {
  const link = "https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123";

  it("lleva local, pedido, barrio, dirección, cliente, teléfono, hora, total, envío y seguimiento", () => {
    const text = courierRequestMessage({
      businessName: "Ana Resto",
      order: order(),
      readyAt: "21:30",
      trackingLink: link,
    });

    expect(text).toContain("Ana Resto");
    expect(text).toContain("#12");
    expect(text).toContain("Barrio: Cantera");
    expect(text).toContain("Dirección: Av. Siempre Viva 742");
    expect(text).toContain("Cliente: Ana Pérez");
    expect(text).toContain("Teléfono: 3644277105");
    expect(text).toContain("Listo a las 21:30");
    expect(text).toMatch(/Total del pedido: \$\s?8\.200/);
    expect(text).toContain("Pago: efectivo");
    expect(text).toMatch(/Envío: \$\s?5\.000/);
    expect(text).toContain(`Seguimiento: ${link}`);
  });

  it("usa el precio final del envío, no el de lista", () => {
    const text = courierRequestMessage({
      businessName: "Ana Resto",
      order: order({ delivery_fee: 6500 }),
      readyAt: "21:30",
      trackingLink: link,
    });
    expect(text).toMatch(/Envío: \$\s?6\.500/);
    expect(text).not.toMatch(/\$\s?5\.000/);
  });

  it("el link de WhatsApp lleva solo dígitos y el texto codificado", () => {
    const url = courierWhatsappLink("+54 9 364 4277105", "Hola & chau");
    expect(url).toBe("https://api.whatsapp.com/send?phone=5493644277105&text=Hola%20%26%20chau");
  });

  it("agrega el código de país a un número argentino de 10 dígitos", () => {
    expect(courierWhatsappLink("3644277105", "x")).toContain("phone=5493644277105");
  });

  it("sin WhatsApp cargado no hay link", () => {
    expect(courierWhatsappLink(null, "x")).toBeNull();
    expect(courierWhatsappLink("", "x")).toBeNull();
  });
});

describe("hora de listo sugerida — ENVIO-23", () => {
  it("un pedido programado usa su hora (hora de Argentina)", () => {
    const o = order({ scheduled_for: "2026-10-10T00:30:00Z" });
    expect(readyTimeDefault(o, new Date("2026-10-09T20:00:00Z"))).toBe("21:30");
  });

  it("si no, 20 minutos desde ahora redondeados hacia arriba a 5", () => {
    expect(readyTimeDefault(order(), new Date("2026-10-09T22:01:00Z"))).toBe("19:25");
    expect(readyTimeDefault(order(), new Date("2026-10-09T22:00:00Z"))).toBe("19:20");
  });
});

describe("acciones de envío según el estado — ENVIO-24", () => {
  it("esperando: se puede pedir, aceptar y rechazar", () => {
    expect(courierActions(order())).toEqual({ request: "Pedir envío", accept: true, reject: true });
  });

  it("consultado: se puede volver a pedir, aceptar y rechazar", () => {
    expect(courierActions(order({ courier_status: "requested" }))).toEqual({
      request: "Volver a pedir",
      accept: true,
      reject: true,
    });
  });

  it("rechazado: se puede volver a pedir o registrar que ahora sí", () => {
    expect(courierActions(order({ courier_status: "rejected" }))).toEqual({
      request: "Pedir envío",
      accept: true,
      reject: false,
    });
  });

  it("aceptado, o pedido terminado, o sin envío: ninguna", () => {
    const ninguna = { request: null, accept: false, reject: false };
    expect(courierActions(order({ courier_status: "accepted" }))).toEqual(ninguna);
    expect(courierActions(order({ status: "delivered" }))).toEqual(ninguna);
    expect(courierActions(order({ status: "cancelled" }))).toEqual(ninguna);
    expect(courierActions(order({ courier_id: null, courier_status: null }))).toEqual(ninguna);
  });

  it("confirmar un pedido pendiente exige el envío aceptado y dice por qué", () => {
    expect(confirmBlockReason(order())).toMatch(/envío.*aceptado/i);
    expect(confirmBlockReason(order({ courier_status: "requested" }))).toMatch(/envío.*aceptado/i);
    expect(confirmBlockReason(order({ courier_status: "rejected" }))).toMatch(/no puede/i);
    expect(confirmBlockReason(order({ courier_status: "accepted" }))).toBeNull();
    expect(confirmBlockReason(order({ status: "confirmed" }))).toBeNull();
    expect(confirmBlockReason(order({ courier_id: null, courier_status: null }))).toBeNull();
  });
});

describe("aviso a los 10 minutos sin respuesta — ENVIO-25", () => {
  const requested = order({ courier_status: "requested", courier_requested_at: "2026-10-09T22:00:00Z" });

  it("antes de los 10 minutos no avisa", () => {
    expect(noResponseWarning(requested, new Date("2026-10-09T22:09:59Z"))).toBeNull();
  });

  it("a los 10 minutos avisa y dice cuánto pasó", () => {
    expect(noResponseWarning(requested, new Date("2026-10-09T22:10:00Z"))).toMatch(/10 min/);
    expect(noResponseWarning(requested, new Date("2026-10-09T22:25:00Z"))).toMatch(/25 min/);
  });

  it("no avisa si ya respondió, no se pidió o el pedido terminó", () => {
    const now = new Date("2026-10-09T23:00:00Z");
    expect(noResponseWarning({ ...requested, courier_status: "accepted" }, now)).toBeNull();
    expect(noResponseWarning(order(), now)).toBeNull();
    expect(noResponseWarning({ ...requested, status: "cancelled" }, now)).toBeNull();
  });
});

describe("estado y precio del envío — ENVIO-26", () => {
  it("etiqueta el estado del envío", () => {
    expect(courierStatusLabel(order())).toBe("Sin pedir al repartidor");
    expect(courierStatusLabel(order({ courier_status: "requested" }))).toBe("Consultado al repartidor");
    expect(courierStatusLabel(order({ courier_status: "accepted" }))).toBe("Aceptado por el repartidor");
    expect(courierStatusLabel(order({ courier_status: "rejected" }))).toBe("El repartidor no puede");
  });

  it("muestra el precio; si cambió, el de lista y el motivo", () => {
    expect(feeSummary(order())).toEqual({ price: expect.stringMatching(/\$\s?5\.000/) });

    const changed = feeSummary(order({ delivery_fee: 6500, delivery_fee_reason: "Fuera de zona" }));
    expect(changed.price).toMatch(/\$\s?6\.500/);
    expect(changed.list).toMatch(/\$\s?5\.000/);
    expect(changed.reason).toBe("Fuera de zona");
  });
});

describe("registrar la respuesta del repartidor — ENVIO-24", () => {
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
