import { describe, expect, it, vi } from "vitest";

import {
  MP_API,
  createPayment,
  isMercadoPago,
  paymentView,
  safePaymentUrl,
  shouldVerify,
  trackerLayout,
  verifyPayment,
} from "./mercadopago.js";

const CODE = "0123456789abcdef0123";
const json = (status, body) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
const fails = () =>
  vi.fn(async () => {
    throw new Error("sin red");
  });

describe("isMercadoPago — PUBLICO-36", () => {
  it("solo es verdadero para el medio mercadopago", () => {
    expect(isMercadoPago("mercadopago")).toBe(true);
    for (const other of ["efectivo", "transferencia", "tarjeta", "", null, undefined]) {
      expect(isMercadoPago(other)).toBe(false);
    }
  });
});

describe("safePaymentUrl — PUBLICO-36", () => {
  it.each([
    "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1-abc",
    "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=1",
    "https://www.mercadopago.com/checkout/v1/redirect?pref_id=1",
  ])("acepta %s", (url) => {
    expect(safePaymentUrl(url)).toBe(url);
  });

  it.each([
    "http://www.mercadopago.com.ar/checkout",
    "https://mercadopago.com.ar.malo.com/checkout",
    "https://malo.com/?https://www.mercadopago.com.ar",
    "https://evilmercadopago.com.ar/x",
    "javascript:alert(1)",
    "//www.mercadopago.com.ar/x",
    "",
    null,
    42,
  ])("rechaza %j", (url) => {
    expect(safePaymentUrl(url)).toBeNull();
  });
});

describe("createPayment — PUBLICO-36", () => {
  it("pide el link de pago con solo el código del pedido (ningún monto)", async () => {
    const fetchImpl = json(200, { init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1" });
    const result = await createPayment({ code: CODE, fetchImpl });

    expect(result).toEqual({ ok: true, url: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${MP_API}/create`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ code: CODE });
  });

  it("falla si la respuesta no trae un link de Mercado Pago", async () => {
    expect(await createPayment({ code: CODE, fetchImpl: json(200, { init_point: "https://malo.com" }) })).toEqual({ ok: false });
    expect(await createPayment({ code: CODE, fetchImpl: json(200, {}) })).toEqual({ ok: false });
  });

  it("falla con un error del servidor, con un código inválido o sin red", async () => {
    expect(await createPayment({ code: CODE, fetchImpl: json(502, { error: "mp_unavailable" }) })).toEqual({ ok: false });
    expect(await createPayment({ code: "no", fetchImpl: json(200, {}) })).toEqual({ ok: false });
    expect(await createPayment({ code: CODE, fetchImpl: fails() })).toEqual({ ok: false });
  });
});

describe("verifyPayment — PUBLICO-37", () => {
  it("consulta el estado de pago del pedido", async () => {
    const fetchImpl = json(200, { pago: "paid" });
    expect(await verifyPayment({ code: CODE, fetchImpl })).toEqual({ ok: true, pago: "paid" });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${MP_API}/verify?code=${CODE}`);
  });

  it("ignora un estado que no conoce", async () => {
    expect(await verifyPayment({ code: CODE, fetchImpl: json(200, { pago: "raro" }) })).toEqual({ ok: false });
  });

  it("falla sin romper si el servidor responde mal o no hay red", async () => {
    expect(await verifyPayment({ code: CODE, fetchImpl: json(500, {}) })).toEqual({ ok: false });
    expect(await verifyPayment({ code: "no", fetchImpl: json(200, { pago: "paid" }) })).toEqual({ ok: false });
    expect(await verifyPayment({ code: CODE, fetchImpl: fails() })).toEqual({ ok: false });
  });
});

describe("paymentView — PUBLICO-37 y 38", () => {
  it("sin estado de pago (otro medio) no hay vista", () => {
    expect(paymentView({ estado: "pending" })).toBeNull();
    expect(paymentView(undefined)).toBeNull();
    expect(paymentView({ pago: "not_required" })).toBeNull();
  });

  it.each(["awaiting", "failed", "paid"])("con el pago %s devuelve su estado", (pago) => {
    expect(paymentView({ pago })).toEqual({ state: pago, preorder: false });
  });

  it("marca los pedidos anticipados", () => {
    expect(paymentView({ pago: "paid", anticipado: true })).toEqual({ state: "paid", preorder: true });
  });
});

describe("shouldVerify — PUBLICO-37", () => {
  it("solo mientras el pago esté esperándose y el pedido no esté cancelado", () => {
    expect(shouldVerify({ pago: "awaiting", estado: "pending" })).toBe(true);
    expect(shouldVerify({ pago: "awaiting", estado: "cancelled" })).toBe(false);
    for (const pago of ["paid", "failed", undefined]) expect(shouldVerify({ pago, estado: "pending" })).toBe(false);
    expect(shouldVerify(null)).toBe(false);
  });
});

describe("trackerLayout — PUBLICO-37 y 38", () => {
  it("un pedido sin Mercado Pago se ve como siempre", () => {
    expect(trackerLayout({ estado: "pending" })).toEqual({ pay: null, status: true, timeline: true });
  });

  it("con Mercado Pago muestra el pago y, además, el estado de siempre", () => {
    expect(trackerLayout({ estado: "pending", pago: "awaiting" })).toEqual({
      pay: { state: "awaiting", preorder: false },
      status: true,
      timeline: true,
    });
  });

  it.each(["awaiting", "failed", "paid"])(
    "un pedido anticipado con el pago %s muestra solo el pago: sin estado ni línea de tiempo",
    (pago) => {
      expect(trackerLayout({ estado: "pending", pago, anticipado: true })).toEqual({
        pay: { state: pago, preorder: true },
        status: false,
        timeline: false,
      });
    },
  );

  it("un pedido cancelado no muestra el cobro, tampoco el anticipado", () => {
    expect(trackerLayout({ estado: "cancelled", pago: "awaiting" })).toEqual({ pay: null, status: true, timeline: true });
    expect(trackerLayout({ estado: "cancelled", pago: "awaiting", anticipado: true })).toEqual({
      pay: null,
      status: true,
      timeline: true,
    });
  });
});
