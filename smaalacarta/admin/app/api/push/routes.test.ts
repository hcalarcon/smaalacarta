// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildPushDeps = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/push/deps", () => ({ buildPushDeps: () => buildPushDeps() }));

import { POST } from "./order/route";

// El pegamento del webhook: el secreto, el cuerpo y qué responde cuando algo se rompe. Quién recibe cada
// aviso está en `src/lib/push/service.test.ts`.
const SECRET = "secreto-de-prueba";

const ORDER = {
  id: "0d0d0d0d-0000-0000-0000-000000000001",
  business_id: "a1a1a1a1-0000-0000-0000-000000000001",
  order_number: "0042",
  status: "pending",
  source: "web",
  courier_status: null,
  courier_id: null,
  payment_status: "not_required",
  delivery: "retiro",
  customer_name: "Lucía",
  delivery_zone_id: null,
  delivery_zone_name: null,
  delivery_fee_list: null,
  delivery_fee: null,
  no_offers_alerted_at: null,
};

const request = (body: unknown, headers: Record<string, string> = { "x-webhook-secret": SECRET }) =>
  new NextRequest("https://smaalacarta.com.ar/admin/api/push/order", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const payload = { type: "INSERT", table: "orders", record: ORDER, old_record: null };

function deps(extra: Record<string, unknown> = {}) {
  return {
    businessName: vi.fn(async () => "Ana Resto"),
    coveringCourierIds: vi.fn(async () => []),
    courierUserIds: vi.fn(async () => []),
    offererCourierIds: vi.fn(async () => []),
    courierName: vi.fn(async () => null),
    businessUserIds: vi.fn(async () => ["u-ana"]),
    assignedByLocal: vi.fn(async () => false),
    subscriptions: vi.fn(async () => [{ endpoint: "https://push.example/1", p256dh: "p", auth: "a", user_id: "u-ana" }]),
    send: vi.fn(async () => "ok"),
    removeSubscription: vi.fn(async () => undefined),
    ...extra,
  };
}

beforeEach(() => {
  process.env.PUSH_WEBHOOK_SECRET = SECRET;
  buildPushDeps.mockReset();
  buildPushDeps.mockReturnValue(deps());
});

afterEach(() => {
  delete process.env.PUSH_WEBHOOK_SECRET;
});

describe("POST /api/push/order — ADMIN-PWA-17", () => {
  it("sin el encabezado, o con otro secreto, responde 401 y no toca nada", async () => {
    for (const headers of [{}, { "x-webhook-secret": "otro" }]) {
      const res = await POST(request(payload, headers));
      expect(res.status).toBe(401);
    }

    expect(buildPushDeps).not.toHaveBeenCalled();
  });

  it("sin PUSH_WEBHOOK_SECRET configurado responde 401 aunque llegue un encabezado vacío", async () => {
    delete process.env.PUSH_WEBHOOK_SECRET;

    const res = await POST(request(payload, { "x-webhook-secret": "" }));
    expect(res.status).toBe(401);
    expect(buildPushDeps).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es JSON responde 400", async () => {
    const res = await POST(request("no soy json"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/push/order — ADMIN-PWA-26 y 27", () => {
  it("con el secreto correcto manda el aviso y responde 200 sin cachear", async () => {
    const d = deps();
    buildPushDeps.mockReturnValue(d);

    const res = await POST(request(payload));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, events: 1, sent: 1 });
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("responde 200 aunque el push falle, para que el webhook no reintente", async () => {
    buildPushDeps.mockReturnValue(
      deps({
        send: vi.fn(async () => {
          throw new Error("TOKEN-SECRETO en el mensaje");
        }),
      }),
    );

    const res = await POST(request(payload));
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain("TOKEN-SECRETO");
    expect(JSON.parse(text)).toMatchObject({ ok: true, failed: 1 });
  });

  it("sin las claves del servidor responde 503, no 200", async () => {
    buildPushDeps.mockImplementation(() => {
      throw new Error("falta VAPID_PRIVATE_KEY");
    });

    const res = await POST(request(payload));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  it("una actualización que no avisa nada responde 200 sin buscar suscripciones", async () => {
    const d = deps();
    buildPushDeps.mockReturnValue(d);

    const res = await POST(
      request({ type: "UPDATE", table: "orders", record: { ...ORDER, status: "confirmed" }, old_record: ORDER }),
    );

    expect(res.status).toBe(200);
    expect(d.subscriptions).not.toHaveBeenCalled();
  });
});
