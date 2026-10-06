// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const buildMpDeps = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mp/deps", () => ({ buildMpDeps: () => buildMpDeps() }));

import { POST as create } from "./create/route";
import { GET as verify } from "./verify/route";
import { POST as webhook } from "./webhook/route";

// El pegamento de los route handlers: cómo leen la URL, los encabezados y el cuerpo, y qué responden
// cuando falta la clave de servicio o algo se rompe. Las reglas de cobro están en `service.test.ts`.
const BUSINESS = "a1a1a1a1-0000-0000-0000-000000000001";
const ORDER_ID = "0d0d0d0d-0000-0000-0000-000000000001";
const CODE = "0123456789abcdef0123";

const request = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://www.smaalacarta.com.ar/admin/api/mp/${url}`, init);

function deps(extra: Record<string, unknown> = {}) {
  return {
    findOrderByCode: vi.fn(async () => null),
    findOrderById: vi.fn(async () => null),
    getCredentials: vi.fn(async () => null),
    confirmPayment: vi.fn(),
    mp: { createPreference: vi.fn(), getPayment: vi.fn(), searchPayments: vi.fn() },
    now: () => 0,
    siteOrigin: "https://www.smaalacarta.com.ar",
    menuDomain: "smaalacarta.com.ar",
    ...extra,
  };
}

beforeEach(() => {
  buildMpDeps.mockReset();
  buildMpDeps.mockReturnValue(deps());
});

describe("POST /create", () => {
  it("un cuerpo que no es JSON responde 400", async () => {
    const res = await create(request("create", { method: "POST", body: "no soy json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it.each([[null], ["texto"], [{}], [{ code: 5 }]])("un cuerpo %j sin código válido responde 400", async (body) => {
    const res = await create(request("create", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_code" });
  });

  it("un código desconocido responde 404 y no se cachea", async () => {
    const res = await create(request("create", { method: "POST", body: JSON.stringify({ code: CODE }) }));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sin la clave de servicio responde 503", async () => {
    buildMpDeps.mockImplementation(() => {
      throw new Error("falta SUPABASE_SERVICE_ROLE_KEY");
    });
    const res = await create(request("create", { method: "POST", body: JSON.stringify({ code: CODE }) }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  it("un error inesperado responde 500 sin detalles", async () => {
    buildMpDeps.mockReturnValue(
      deps({
        findOrderByCode: vi.fn(async () => {
          throw new Error("TOKEN-SECRETO en el mensaje");
        }),
      }),
    );
    const res = await create(request("create", { method: "POST", body: JSON.stringify({ code: CODE }) }));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain("TOKEN-SECRETO");
  });
});

describe("POST /webhook", () => {
  const spy = () => {
    const getCredentials = vi.fn(async () => null);
    buildMpDeps.mockReturnValue(deps({ getCredentials }));
    return getCredentials;
  };

  it("sin firma responde 401", async () => {
    const getCredentials = spy();
    const res = await webhook(request(`webhook?b=${BUSINESS}`, { method: "POST", body: "{}" }));

    expect(res.status).toBe(401);
    expect(getCredentials).toHaveBeenCalledWith(BUSINESS);
  });

  it("sin el negocio en la URL responde 401 sin tocar la base", async () => {
    const getCredentials = spy();
    const res = await webhook(request("webhook", { method: "POST", body: "{}" }));

    expect(res.status).toBe(401);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it("acepta un cuerpo vacío o que no es JSON (queda la URL)", async () => {
    spy();
    for (const body of [undefined, "", "no soy json"]) {
      const res = await webhook(request(`webhook?b=${BUSINESS}&data.id=777`, { method: "POST", body }));
      expect(res.status).toBe(401);
    }
  });

  it("toma el id del pago de data.id en la URL, y si falta, del cuerpo", async () => {
    // Un pago consultado con credenciales válidas llega a `getPayment` con el id que corresponda.
    const { signWebhook } = await import("@/lib/mp/signature");
    const secret = "SECRETO";
    const getPayment = vi.fn(async () => ({
      id: 777,
      status: "pending",
      external_reference: ORDER_ID,
      transaction_amount: 1,
      currency_id: "ARS",
    }));
    buildMpDeps.mockReturnValue(
      deps({
        getCredentials: vi.fn(async () => ({ accessToken: "T", webhookSecret: secret, enabled: true })),
        mp: { createPreference: vi.fn(), getPayment, searchPayments: vi.fn() },
      }),
    );

    const signed = (id: string) => {
      const ts = "1760000000000";
      return { "x-request-id": "r1", "x-signature": `ts=${ts},v1=${signWebhook(secret, { dataId: id, requestId: "r1", ts })}` };
    };

    const fromUrl = await webhook(
      request(`webhook?b=${BUSINESS}&data.id=777&type=payment`, { method: "POST", headers: signed("777"), body: "{}" }),
    );
    expect(fromUrl.status).toBe(200);

    const fromBody = await webhook(
      request(`webhook?b=${BUSINESS}`, {
        method: "POST",
        headers: signed("777"),
        body: JSON.stringify({ type: "payment", data: { id: 777 } }),
      }),
    );
    expect(fromBody.status).toBe(200);
    expect(getPayment).toHaveBeenCalledTimes(2);
    expect(getPayment).toHaveBeenNthCalledWith(1, "T", "777");
    expect(getPayment).toHaveBeenNthCalledWith(2, "T", "777");
  });

  it("sin la clave de servicio responde 503", async () => {
    buildMpDeps.mockImplementation(() => {
      throw new Error("falta la clave");
    });
    const res = await webhook(request(`webhook?b=${BUSINESS}`, { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
  });
});

describe("GET /verify", () => {
  it("sin código responde 400", async () => {
    const res = await verify(request("verify"));
    expect(res.status).toBe(400);
  });

  it("un código desconocido responde 404", async () => {
    const res = await verify(request(`verify?code=${CODE}`));
    expect(res.status).toBe(404);
  });
});
