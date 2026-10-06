import { describe, expect, it, vi } from "vitest";

import type { MpPayment } from "./api";
import { createRateLimiter } from "./rate-limit";
import {
  createPayment,
  handleWebhook,
  paymentOutcome,
  verifyPayment,
  type Credentials,
  type OrderRecord,
} from "./service";
import { signWebhook } from "./signature";

const BUSINESS = "a1a1a1a1-0000-0000-0000-000000000001";
const OTHER_BUSINESS = "b2b2b2b2-0000-0000-0000-000000000002";
const ORDER_ID = "0d0d0d0d-0000-0000-0000-000000000001";
const CODE = "0123456789abcdef0123";
const TOKEN = "TOKEN-DE-PRUEBA";
const SECRET = "SECRETO-DE-PRUEBA";

const order = (extra: Partial<OrderRecord> = {}): OrderRecord => ({
  id: ORDER_ID,
  businessId: BUSINESS,
  slug: "ana",
  code: CODE,
  total: 3500,
  status: "pending",
  payment: "mercadopago",
  paymentStatus: "awaiting",
  items: [
    { name: "Café", quantity: 2, unitPrice: 1000 },
    { name: "Medialuna", quantity: 1, unitPrice: 1500 },
  ],
  ...extra,
});

const credentials: Credentials = { accessToken: TOKEN, webhookSecret: SECRET, enabled: true };

function makeDeps(extra: { now?: () => number; order?: OrderRecord | null; credentials?: Credentials | null } = {}) {
  const { order: o = order(), credentials: c = credentials, ...overrides } = extra;

  const deps = {
    findOrderByCode: vi.fn(async () => o),
    findOrderById: vi.fn(async () => o),
    getCredentials: vi.fn(async () => c),
    confirmPayment: vi.fn(async (_id: string, _pid: string, status: string) => status),
    mp: {
      createPreference: vi.fn(async () => ({ init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1" })),
      getPayment: vi.fn(async (): Promise<MpPayment> => ({
        id: 777,
        status: "approved",
        external_reference: ORDER_ID,
        transaction_amount: 3500,
        currency_id: "ARS",
      })),
      searchPayments: vi.fn(async (): Promise<MpPayment[]> => []),
    },
    now: () => 1_000_000,
    siteOrigin: "https://www.smaalacarta.com.ar",
    menuDomain: "smaalacarta.com.ar",
    ...overrides,
  };

  return deps;
}

describe("paymentOutcome — MP-4", () => {
  it.each([
    ["approved", "paid"],
    ["rejected", "failed"],
    ["cancelled", "failed"],
    ["pending", null],
    ["in_process", null],
    ["authorized", null],
    ["refunded", null],
    [undefined, null],
  ])("%s → %s", (status, expected) => {
    expect(paymentOutcome(status)).toBe(expected);
  });
});

describe("POST /create — MP-3", () => {
  it("crea la preferencia con los ítems guardados y devuelve solo el init_point", async () => {
    const deps = makeDeps();
    const r = await createPayment(deps, { code: CODE });

    expect(r).toEqual({
      status: 200,
      body: { init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1" },
    });

    const [token, preference] = deps.mp.createPreference.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(token).toBe(TOKEN);
    expect(preference.items).toEqual([
      { title: "Café", quantity: 2, unit_price: 1000, currency_id: "ARS" },
      { title: "Medialuna", quantity: 1, unit_price: 1500, currency_id: "ARS" },
    ]);
    expect(preference.external_reference).toBe(ORDER_ID);
    expect(preference.auto_return).toBe("approved");
    expect(preference.back_urls).toEqual({
      success: `https://ana.smaalacarta.com.ar/pedido/${CODE}`,
      failure: `https://ana.smaalacarta.com.ar/pedido/${CODE}`,
      pending: `https://ana.smaalacarta.com.ar/pedido/${CODE}`,
    });
    expect(preference.notification_url).toBe(
      `https://www.smaalacarta.com.ar/admin/api/mp/webhook?b=${BUSINESS}`,
    );
  });

  it("el navegador no manda montos: cualquier otro dato del pedido se ignora", async () => {
    const deps = makeDeps();
    await createPayment(deps, { code: CODE, total: 1, items: [{ unit_price: 1 }] } as never);

    const [, preference] = deps.mp.createPreference.mock.calls[0] as unknown as [string, { items: { unit_price: number }[] }];
    expect(preference.items.map((i) => i.unit_price)).toEqual([1000, 1500]);
  });

  it("permite reintentar un pago fallido", async () => {
    const r = await createPayment(makeDeps({ order: order({ paymentStatus: "failed" }) }), { code: CODE });
    expect(r.status).toBe(200);
  });

  it.each([
    ["un código que no tiene la forma", { code: "abc" }, 400],
    ["un código que no es texto", { code: 5 }, 400],
    ["sin código", {}, 400],
  ])("rechaza %s", async (_caso, input, status) => {
    const deps = makeDeps();
    expect((await createPayment(deps, input)).status).toBe(status);
    expect(deps.findOrderByCode).not.toHaveBeenCalled();
  });

  it.each([
    ["un pedido que no existe", { order: null }, 404],
    ["un pedido que no es con Mercado Pago", { order: order({ payment: "efectivo", paymentStatus: "not_required" }) }, 409],
    ["un pedido ya pagado", { order: order({ paymentStatus: "paid" }) }, 409],
    ["un pedido cancelado", { order: order({ status: "cancelled" }) }, 409],
    ["un negocio sin credenciales", { credentials: null }, 409],
    ["un negocio con credenciales deshabilitadas", { credentials: { ...credentials, enabled: false } }, 409],
  ])("rechaza %s sin llamar a Mercado Pago", async (_caso, extra, status) => {
    const deps = makeDeps(extra as never);
    expect((await createPayment(deps, { code: CODE })).status).toBe(status);
    expect(deps.mp.createPreference).not.toHaveBeenCalled();
  });

  it("si Mercado Pago falla responde 502 y no filtra el token ni el motivo", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps();
    deps.mp.createPreference.mockRejectedValue(new Error(`falló con ${TOKEN}`));

    const r = await createPayment(deps, { code: CODE });

    expect(r).toEqual({ status: 502, body: { error: "mp_unavailable" } });
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
    error.mockRestore();
  });
});

describe("POST /webhook — MP-4", () => {
  const ts = "1760000000000";
  const signed = (dataId = "777", requestId = "req-1", secret = SECRET) => ({
    businessId: BUSINESS,
    dataId,
    type: "payment",
    requestId,
    signature: `ts=${ts},v1=${signWebhook(secret, { dataId, requestId, ts })}`,
  });

  it("con la firma válida consulta el pago a la API y confirma con el monto de la API", async () => {
    const deps = makeDeps();
    const r = await handleWebhook(deps, signed());

    expect(r.status).toBe(200);
    expect(deps.mp.getPayment).toHaveBeenCalledWith(TOKEN, "777");
    expect(deps.confirmPayment).toHaveBeenCalledWith(ORDER_ID, "777", "paid", 3500);
  });

  it("un pago rechazado marca el pago como fallido", async () => {
    const deps = makeDeps();
    deps.mp.getPayment.mockResolvedValue({ id: 8, status: "rejected", external_reference: ORDER_ID, transaction_amount: 3500, currency_id: "ARS" });

    await handleWebhook(deps, signed("8"));
    expect(deps.confirmPayment).toHaveBeenCalledWith(ORDER_ID, "8", "failed", 3500);
  });

  it.each(["pending", "in_process", "refunded"])("un pago %s se ignora", async (status) => {
    const deps = makeDeps();
    deps.mp.getPayment.mockResolvedValue({ id: 8, status, external_reference: ORDER_ID, transaction_amount: 3500 });

    const r = await handleWebhook(deps, signed("8"));
    expect(r.status).toBe(200);
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("con una firma inválida responde 401 y no consulta nada", async () => {
    const deps = makeDeps();
    const r = await handleWebhook(deps, { ...signed(), signature: `ts=${ts},v1=${"0".repeat(64)}` });

    expect(r.status).toBe(401);
    expect(deps.mp.getPayment).not.toHaveBeenCalled();
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["firmada con otro secreto", () => signed("777", "req-1", "otro-secreto")],
    ["sin firma", () => ({ ...signed(), signature: null })],
    ["con otro id de pago", () => ({ ...signed(), dataId: "778" })],
    ["con otro request-id", () => ({ ...signed(), requestId: "req-2" })],
  ])("rechaza una notificación %s", async (_caso, build) => {
    const deps = makeDeps();
    expect((await handleWebhook(deps, build())).status).toBe(401);
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it.each([null, "", "no-es-un-uuid", "a1a1a1a1"])("rechaza un negocio inválido (%j)", async (businessId) => {
    const deps = makeDeps();
    expect((await handleWebhook(deps, { ...signed(), businessId })).status).toBe(401);
    expect(deps.getCredentials).not.toHaveBeenCalled();
  });

  it("rechaza un negocio sin credenciales", async () => {
    const deps = makeDeps({ credentials: null });
    expect((await handleWebhook(deps, signed())).status).toBe(401);
  });

  it("ignora los avisos que no son de pagos", async () => {
    const deps = makeDeps();
    const r = await handleWebhook(deps, { ...signed(), type: "merchant_order" });

    expect(r.status).toBe(200);
    expect(deps.mp.getPayment).not.toHaveBeenCalled();
  });

  it("no confirma un pago cuyo external_reference es de un pedido de otro negocio", async () => {
    const deps = makeDeps({ order: order({ businessId: OTHER_BUSINESS }) });
    const r = await handleWebhook(deps, signed());

    expect(r.status).toBe(200);
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["sin external_reference", { external_reference: null }],
    ["con un external_reference que no es un pedido", { external_reference: "cualquier-cosa" }],
    ["en otra moneda", { currency_id: "USD" }],
  ])("ignora un pago %s", async (_caso, change) => {
    const deps = makeDeps();
    deps.mp.getPayment.mockResolvedValue({
      id: 9,
      status: "approved",
      external_reference: ORDER_ID,
      transaction_amount: 3500,
      currency_id: "ARS",
      ...change,
    });

    expect((await handleWebhook(deps, signed("9"))).status).toBe(200);
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("ignora un pedido que no es con Mercado Pago", async () => {
    const deps = makeDeps({ order: order({ payment: "efectivo" }) });
    await handleWebhook(deps, signed());
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("si no puede consultar la API responde 5xx para que Mercado Pago reintente", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps();
    deps.mp.getPayment.mockRejectedValue(new Error("caído"));

    expect((await handleWebhook(deps, signed())).status).toBe(502);
    error.mockRestore();
  });

  it("si la base falla al confirmar responde 500 para que reintente", async () => {
    const deps = makeDeps();
    deps.confirmPayment.mockRejectedValue(new Error("base caída"));

    expect((await handleWebhook(deps, signed())).status).toBe(500);
  });

  it("un monto distinto del total no confirma (lo decide la base)", async () => {
    const deps = makeDeps();
    deps.confirmPayment.mockResolvedValue("mismatch");
    deps.mp.getPayment.mockResolvedValue({ id: 5, status: "approved", external_reference: ORDER_ID, transaction_amount: 10, currency_id: "ARS" });

    const r = await handleWebhook(deps, signed("5"));
    expect(deps.confirmPayment).toHaveBeenCalledWith(ORDER_ID, "5", "paid", 10);
    expect(r.body).toEqual({ result: "mismatch" });
  });
});

describe("GET /verify — MP-5", () => {
  const limiter = () => createRateLimiter(4000);

  it("confirma si Mercado Pago tiene un pago aprobado del pedido", async () => {
    const deps = makeDeps();
    deps.mp.searchPayments.mockResolvedValue([
      { id: 12, status: "approved", external_reference: ORDER_ID, transaction_amount: 3500 },
    ]);

    const r = await verifyPayment(deps, { code: CODE }, limiter());

    expect(deps.mp.searchPayments).toHaveBeenCalledWith(TOKEN, ORDER_ID);
    expect(deps.confirmPayment).toHaveBeenCalledWith(ORDER_ID, "12", "paid", 3500);
    expect(r).toEqual({ status: 200, body: { pago: "paid" } });
  });

  it("un aprobado gana aunque haya un rechazado más reciente", async () => {
    const deps = makeDeps();
    deps.mp.searchPayments.mockResolvedValue([
      { id: 13, status: "rejected", external_reference: ORDER_ID, transaction_amount: 3500 },
      { id: 12, status: "approved", external_reference: ORDER_ID, transaction_amount: 3500 },
    ]);

    await verifyPayment(deps, { code: CODE }, limiter());
    expect(deps.confirmPayment).toHaveBeenCalledWith(ORDER_ID, "12", "paid", 3500);
  });

  it("si lo último es un rechazo, deja el pago como fallido; si ya lo estaba, no repite", async () => {
    const rejected = [{ id: 13, status: "rejected", external_reference: ORDER_ID, transaction_amount: 3500 }];

    const first = makeDeps();
    first.mp.searchPayments.mockResolvedValue(rejected);
    expect((await verifyPayment(first, { code: CODE }, limiter())).body).toEqual({ pago: "failed" });
    expect(first.confirmPayment).toHaveBeenCalledWith(ORDER_ID, "13", "failed", 3500);

    const again = makeDeps({ order: order({ paymentStatus: "failed" }) });
    again.mp.searchPayments.mockResolvedValue(rejected);
    expect((await verifyPayment(again, { code: CODE }, limiter())).body).toEqual({ pago: "failed" });
    expect(again.confirmPayment).not.toHaveBeenCalled();
  });

  it("sin pagos, o con uno pendiente, deja el estado como está", async () => {
    const deps = makeDeps();
    deps.mp.searchPayments.mockResolvedValue([
      { id: 14, status: "pending", external_reference: ORDER_ID, transaction_amount: 3500 },
    ]);

    expect((await verifyPayment(deps, { code: CODE }, limiter())).body).toEqual({ pago: "awaiting" });
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("ignora un pago que no es de este pedido", async () => {
    const deps = makeDeps();
    deps.mp.searchPayments.mockResolvedValue([
      { id: 15, status: "approved", external_reference: "otro-pedido", transaction_amount: 3500 },
    ]);

    await verifyPayment(deps, { code: CODE }, limiter());
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("un pedido ya pagado responde sin llamar a Mercado Pago", async () => {
    const deps = makeDeps({ order: order({ paymentStatus: "paid" }) });
    const r = await verifyPayment(deps, { code: CODE }, limiter());

    expect(r.body).toEqual({ pago: "paid" });
    expect(deps.mp.searchPayments).not.toHaveBeenCalled();
  });

  it("no consulta a Mercado Pago más de una vez cada pocos segundos por pedido", async () => {
    let now = 0;
    const deps = makeDeps({ now: () => now });
    const shared = createRateLimiter(4000);

    await verifyPayment(deps, { code: CODE }, shared);
    now = 1000;
    const limited = await verifyPayment(deps, { code: CODE }, shared);
    expect(limited).toEqual({ status: 200, body: { pago: "awaiting" } });
    expect(deps.mp.searchPayments).toHaveBeenCalledTimes(1);

    now = 5000;
    await verifyPayment(deps, { code: CODE }, shared);
    expect(deps.mp.searchPayments).toHaveBeenCalledTimes(2);
  });

  it("devuelve solo el estado de pago", async () => {
    const deps = makeDeps();
    const r = await verifyPayment(deps, { code: CODE }, limiter());

    expect(Object.keys(r.body)).toEqual(["pago"]);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it.each([
    ["código inválido", { code: "x" }, 400],
    ["pedido inexistente", { code: CODE, none: true }, 404],
  ])("%s", async (_caso, input, status) => {
    const deps = makeDeps((input as { none?: boolean }).none ? { order: null } : {});
    expect((await verifyPayment(deps, { code: (input as { code: string }).code }, limiter())).status).toBe(status);
  });

  it("un pedido que no es con Mercado Pago no se consulta", async () => {
    const deps = makeDeps({ order: order({ payment: "efectivo", paymentStatus: "not_required" }) });
    expect((await verifyPayment(deps, { code: CODE }, limiter())).status).toBe(409);
    expect(deps.mp.searchPayments).not.toHaveBeenCalled();
  });

  it("si Mercado Pago falla, devuelve el estado actual sin romper", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps();
    deps.mp.searchPayments.mockRejectedValue(new Error("caído"));

    expect(await verifyPayment(deps, { code: CODE }, limiter())).toEqual({ status: 200, body: { pago: "awaiting" } });
    error.mockRestore();
  });
});
