import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { MpApiError, createMpApi } from "./api";
import { corsHeaders, isAllowedOrigin } from "./cors";
import { createRateLimiter } from "./rate-limit";
import { parseSignature, signWebhook, verifyWebhookSignature } from "./signature";

describe("firma del webhook — MP-4", () => {
  const secret = "SECRETO-DE-PRUEBA";
  const ts = "1760000000000";
  const input = { dataId: "123456", requestId: "req-1" };

  it("lee ts y v1 del encabezado", () => {
    expect(parseSignature("ts=1,v1=abc")).toEqual({ ts: "1", v1: "abc" });
    expect(parseSignature(" ts=1 , v1=abc ")).toEqual({ ts: "1", v1: "abc" });
    expect(parseSignature("ts=1")).toBeNull();
    expect(parseSignature("")).toBeNull();
    expect(parseSignature(null)).toBeNull();
  });

  it("acepta la firma que corresponde al id, al request-id y al ts", () => {
    const v1 = signWebhook(secret, { ...input, ts });
    expect(verifyWebhookSignature(secret, { signatureHeader: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456" })).toBe(true);
  });

  it("firma el manifiesto de Mercado Pago: id:<id>;request-id:<req>;ts:<ts>;", () => {
    const manifiesto = createHmac("sha256", "clave").update("id:abc123;request-id:x;ts:99;").digest("hex");

    // El id alfanumérico se pasa a minúsculas, como pide Mercado Pago.
    expect(signWebhook("clave", { dataId: "ABC123", requestId: "x", ts: "99" })).toBe(manifiesto);
    // Sin request-id, esa parte se omite del texto.
    expect(signWebhook("clave", { dataId: "1", ts: "99" })).toBe(
      createHmac("sha256", "clave").update("id:1;ts:99;").digest("hex"),
    );
  });

  it.each([
    ["otro secreto", { secret: "otro" }],
    ["otro id de pago", { dataId: "999" }],
    ["otro request-id", { requestId: "req-2" }],
    ["otro ts", { header: (v1: string) => `ts=1,v1=${v1}` }],
    ["sin encabezado", { header: () => null }],
    ["una firma que no es hex", { header: () => `ts=${ts},v1=zzzz` }],
    ["una firma de otro largo", { header: () => `ts=${ts},v1=abc` }],
  ])("rechaza %s", (_caso, change: Record<string, unknown>) => {
    const v1 = signWebhook(secret, { ...input, ts });
    const header = typeof change.header === "function" ? (change.header as (v: string) => string | null)(v1) : `ts=${ts},v1=${v1}`;

    expect(
      verifyWebhookSignature((change.secret as string) ?? secret, {
        signatureHeader: header,
        requestId: (change.requestId as string) ?? input.requestId,
        dataId: (change.dataId as string) ?? input.dataId,
      }),
    ).toBe(false);
  });

  it("sin secreto no valida nada", () => {
    expect(verifyWebhookSignature("", { signatureHeader: "ts=1,v1=00", requestId: "r", dataId: "1" })).toBe(false);
  });
});

describe("CORS — MP-6", () => {
  it.each(["https://pizzeria.smaalacarta.com.ar", "https://a-b-1.smaalacarta.com.ar"])("acepta %s", (origin) => {
    expect(isAllowedOrigin(origin, true)).toBe(true);
    expect(corsHeaders(origin, true)["Access-Control-Allow-Origin"]).toBe(origin);
  });

  it.each([
    "http://pizzeria.smaalacarta.com.ar",
    "https://smaalacarta.com.ar.malo.com",
    "https://malo.com",
    "https://evilsmaalacarta.com.ar",
    "https://x.smaalacarta.com.ar.evil.com",
    "https://smaalacarta.com.ar",
    "null",
    "",
    null,
    undefined,
  ])("no acepta %j", (origin) => {
    expect(isAllowedOrigin(origin, true)).toBe(false);
    expect(corsHeaders(origin, true)).toEqual({});
  });

  it("localhost solo fuera de producción", () => {
    expect(isAllowedOrigin("http://localhost:5500", false)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5500", true)).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1:8080", false)).toBe(true);
  });
});

describe("freno de frecuencia — MP-5", () => {
  it("deja pasar una consulta cada intervalo, por clave", () => {
    const limiter = createRateLimiter(1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(limiter.allow("b", 500)).toBe(true);
    expect(limiter.allow("a", 1000)).toBe(true);
  });

  it("no crece sin límite", () => {
    const limiter = createRateLimiter(1000, 3);
    for (const key of ["a", "b", "c", "d", "e"]) expect(limiter.allow(key, 0)).toBe(true);
    expect(limiter.allow("f", 0)).toBe(true);
  });
});

describe("cliente de la API — MP-7", () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

  it("manda el token del negocio como Bearer y crea la preferencia", async () => {
    const fetcher = ok({ init_point: "https://mp/pagar" });
    const api = createMpApi(fetcher as unknown as typeof fetch);

    const result = await api.createPreference("TOKEN-X", {
      items: [],
      external_reference: "r",
      back_urls: { success: "s", failure: "f", pending: "p" },
      auto_return: "approved",
      notification_url: "n",
    });

    expect(result).toEqual({ init_point: "https://mp/pagar" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN-X");
  });

  it("consulta un pago y busca por external_reference", async () => {
    const fetcher = ok({ id: 1, status: "approved", results: [{ id: 2, status: "rejected" }] });
    const api = createMpApi(fetcher as unknown as typeof fetch);

    expect((await api.getPayment("T", "1")).status).toBe("approved");
    expect(await api.searchPayments("T", "abc")).toEqual([{ id: 2, status: "rejected" }]);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe("https://api.mercadopago.com/v1/payments/1");
    expect((fetcher.mock.calls[1] as unknown as [string])[0]).toContain("external_reference=abc");
  });

  it("un error lleva solo el código HTTP, nunca el token ni el cuerpo", async () => {
    const fetcher = vi.fn(async () => new Response('{"message":"TOKEN-X inválido"}', { status: 401 }));
    const api = createMpApi(fetcher as unknown as typeof fetch);

    const error = await api.getPayment("TOKEN-X", "1").catch((e) => e);
    expect(error).toBeInstanceOf(MpApiError);
    expect(error.status).toBe(401);
    expect(String(error.message)).not.toContain("TOKEN-X");
  });

  it("una preferencia sin init_point es un error", async () => {
    const api = createMpApi(ok({}) as unknown as typeof fetch);
    await expect(
      api.createPreference("T", {
        items: [],
        external_reference: "r",
        back_urls: { success: "s", failure: "f", pending: "p" },
        auto_return: "approved",
        notification_url: "n",
      }),
    ).rejects.toBeInstanceOf(MpApiError);
  });
});
