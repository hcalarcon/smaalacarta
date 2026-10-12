// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { asService, asUser, createTestDb, type TestDb } from "@/test/db";

import { MpApiError, type MpPayment } from "./api";
import { resolveCredentials, type ConnectionRecord, type ConnectionStore } from "./credentials";
import { decryptSecret, encryptSecret } from "./crypto";
import { createPayment, handleWebhook, verifyPayment, type MpDeps, type OrderRecord } from "./service";
import { signWebhook } from "./signature";
import { createRateLimiter } from "./rate-limit";

// Cobro de punta a punta con la conexión por OAuth (MP-18 a MP-26): `service.ts` y `credentials.ts` contra
// Postgres real (PGlite, con `confirm_order_payment`, `business_has_mp` y el RLS de verdad) y Mercado Pago
// simulado. `credentials.test.ts` prueba cada regla con un almacén en memoria; acá, que encajan con la base.
// La misma clave para cifrar la fila y para que `credentials.ts` la descifre, fija en todo el archivo.
process.env.MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const NEG_A = "a1a1a1a1-0000-0000-0000-000000000011";
const NEG_B = "b2b2b2b2-0000-0000-0000-000000000022";
const CAFE_A = "d1000000-0000-0000-0000-000000000011";
const CAFE_B = "d1000000-0000-0000-0000-000000000022";
const MP_USER = 777;
const APP_SECRET = "CLAVE-DE-LA-APP";
const MANUAL_SECRET_A = "SECRETO-MANUAL-A";
const SECRET_B = "SECRETO-B";
const DAY = 24 * 60 * 60 * 1000;

let db: TestDb;
let logged = "";

// Almacén sobre Postgres real: las mismas comparaciones que `connection-store.ts`, con SQL.
const pgStore: ConnectionStore = {
  async find(businessId) {
    const { rows } = await db.query<{
      mp_user_id: string;
      access_token_enc: string | null;
      refresh_token_enc: string | null;
      key_version: number;
      expires_at: Date | null;
      status: ConnectionRecord["status"];
    }>(
      "select mp_user_id, access_token_enc, refresh_token_enc, key_version, expires_at, status from payment_connections where business_id = $1",
      [businessId],
    );
    const r = rows[0];
    if (!r) return null;

    return {
      mpUserId: Number(r.mp_user_id),
      accessTokenEnc: r.access_token_enc,
      refreshTokenEnc: r.refresh_token_enc,
      keyVersion: r.key_version,
      expiresAt: r.expires_at ? new Date(r.expires_at) : null,
      status: r.status,
    };
  },
  async acquireLease(businessId, refreshTokenEnc, now, until) {
    const r = await db.query(
      `update payment_connections set refreshing_until = $4
        where business_id = $1 and status = 'connected' and refresh_token_enc = $2
          and (refreshing_until is null or refreshing_until < $3) returning business_id`,
      [businessId, refreshTokenEnc, now.toISOString(), until.toISOString()],
    );
    return r.rows.length > 0;
  },
  async saveRenewed(businessId, refreshTokenEnc, next, now) {
    const r = await db.query(
      `update payment_connections
          set access_token_enc = $3, refresh_token_enc = $4, key_version = $5, expires_at = $6,
              refreshing_until = null, updated_at = $7
        where business_id = $1 and status = 'connected' and refresh_token_enc = $2 returning business_id`,
      [
        businessId,
        refreshTokenEnc,
        next.accessTokenEnc,
        next.refreshTokenEnc,
        next.keyVersion,
        next.expiresAt.toISOString(),
        now.toISOString(),
      ],
    );
    return r.rows.length > 0;
  },
  async releaseLease(businessId, refreshTokenEnc) {
    await db.query(
      "update payment_connections set refreshing_until = null where business_id = $1 and refresh_token_enc = $2",
      [businessId, refreshTokenEnc],
    );
  },
  async markNeedsReconnect(businessId, refreshTokenEnc, now) {
    const r = await db.query(
      `update payment_connections set status = 'needs_reconnect', refreshing_until = null, updated_at = $3
        where business_id = $1 and status = 'connected' and refresh_token_enc = $2 returning business_id`,
      [businessId, refreshTokenEnc, now.toISOString()],
    );
    return r.rows.length > 0;
  },
};

// Mercado Pago simulado: pagos, preferencias, y qué hace la renovación.
function fakeMp() {
  const payments: MpPayment[] = [];
  const preferences: { token: string; input: Parameters<MpDeps["mp"]["createPreference"]>[1] }[] = [];
  const calls = { getPayment: 0, searchPayments: 0, refresh: 0 };
  const behavior: { refresh: (token: string) => Promise<Record<string, unknown>> } = {
    refresh: async () => ({
      access_token: "ACCESS-RENOVADO",
      refresh_token: "REFRESH-RENOVADO",
      expires_in: 180 * 24 * 60 * 60,
      user_id: MP_USER,
    }),
  };

  const mp: MpDeps["mp"] = {
    async createPreference(token, input) {
      preferences.push({ token, input });
      return { init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${preferences.length}` };
    },
    async getPayment(_token, id) {
      calls.getPayment++;
      const found = payments.find((p) => String(p.id) === id);
      if (!found) throw new MpApiError(404);
      return found;
    },
    async searchPayments(_token, reference) {
      calls.searchPayments++;
      return payments.filter((p) => p.external_reference === reference).reverse();
    },
  };

  let nextId = 9000;
  const pay = (order: OrderRecord, status: string, extra: Partial<MpPayment> = {}) => {
    const payment: MpPayment = {
      id: ++nextId,
      status,
      external_reference: order.id,
      transaction_amount: order.total,
      currency_id: "ARS",
      collector_id: MP_USER,
      ...extra,
    };
    payments.push(payment);
    return payment;
  };

  return { mp, payments, preferences, calls, behavior, pay };
}

async function findOrder(column: "code" | "id", value: string): Promise<OrderRecord | null> {
  const { rows } = await db.query<{
    id: string;
    business_id: string;
    code: string;
    total: string;
    status: string;
    payment: string | null;
    payment_status: string;
    slug: string;
  }>(
    `select o.id, o.business_id, o.code, o.total, o.status, o.payment, o.payment_status, b.slug
       from orders o join businesses b on b.id = o.business_id where o.${column} = $1`,
    [value],
  );
  const r = rows[0];
  if (!r) return null;

  const items = (
    await db.query<{ name: string; quantity: number; unit_price: string }>(
      "select name, quantity, unit_price from order_items where order_id = $1 order by sort_order",
      [r.id],
    )
  ).rows;

  return {
    id: r.id,
    businessId: r.business_id,
    slug: r.slug,
    code: r.code,
    total: Number(r.total),
    status: r.status,
    payment: r.payment,
    paymentStatus: r.payment_status as OrderRecord["paymentStatus"],
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: Number(i.unit_price) })),
  };
}

function realDeps(sim: ReturnType<typeof fakeMp>): MpDeps {
  return {
    findOrderByCode: (code) => findOrder("code", code),
    findOrderById: (id) => findOrder("id", id),
    getCredentials: (businessId) =>
      resolveCredentials(
        {
          store: pgStore,
          async manual(id) {
            const { rows } = await db.query<{ mp_access_token: string; mp_webhook_secret: string; enabled: boolean }>(
              "select mp_access_token, mp_webhook_secret, enabled from payment_credentials where business_id = $1",
              [id],
            );
            const r = rows[0];
            return r ? { accessToken: r.mp_access_token, webhookSecret: r.mp_webhook_secret, enabled: r.enabled } : null;
          },
          refresh: async (token) => {
            sim.calls.refresh++;
            return sim.behavior.refresh(token);
          },
          webhookSecret: () => process.env.MP_OAUTH_WEBHOOK_SECRET ?? "",
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))),
        },
        businessId,
      ),
    async confirmPayment(orderId, paymentId, status, amount) {
      const r = await asService(
        db,
        `select public.confirm_order_payment('${orderId}', '${paymentId}', '${status}', ${amount}) as r`,
      );
      if (!r.ok) throw new Error(r.error);
      return String(r.rows[0].r);
    },
    mp: sim.mp,
    now: () => Date.now(),
    siteOrigin: "https://www.smaalacarta.com.ar",
    menuDomain: "smaalacarta.com.ar",
  };
}

async function newOrder(slug: "ana" | "beto", product: string): Promise<OrderRecord> {
  const r = await asUser(
    db,
    null,
    `select public.create_public_order('${slug}', 'Cliente', 'retiro', 'mercadopago', null,
       '[{"id":"${product}","kind":"product","quantity":2}]'::jsonb,
       p_customer_phone => '3515551234') as result`,
  );
  if (!r.ok) throw new Error(r.error);
  const { code } = r.rows[0].result as { code: string };
  return (await findOrder("code", code))!;
}

const notification = (businessId: string, secret: string, paymentId: number, requestId = "req-1") => {
  const dataId = String(paymentId);
  const ts = String(Date.now());
  return {
    businessId,
    dataId,
    type: "payment",
    requestId,
    signature: `ts=${ts},v1=${signWebhook(secret, { dataId, requestId, ts })}`,
  };
};

const stored = async (id: string) =>
  (await db.query<{ payment_status: string; mp_payment_id: string | null }>(
    "select payment_status, mp_payment_id from orders where id = $1",
    [id],
  )).rows[0];

// Deja la conexión de Ana como recién conectada (o como se pida) para cada test.
async function connect(expiresInDays = 100, status = "connected") {
  await db.query("delete from payment_connections where business_id = $1", [NEG_A]);
  await db.query(
    `insert into payment_connections
       (business_id, mp_user_id, access_token_enc, refresh_token_enc, key_version, expires_at, scope, status)
     values ($1, $2, $3, $4, 1, $5, 'offline_access read write', $6)`,
    [
      NEG_A,
      MP_USER,
      encryptSecret("ACCESS-OAUTH", NEG_A).value,
      encryptSecret("REFRESH-OAUTH", NEG_A).value,
      new Date(Date.now() + expiresInDays * DAY).toISOString(),
      status,
    ],
  );
}

const connectionRow = async () =>
  (await db.query<{
    status: string;
    access_token_enc: string;
    refresh_token_enc: string;
    expires_at: Date;
    refreshing_until: Date | null;
  }>(
    "select status, access_token_enc, refresh_token_enc, expires_at, refreshing_until from payment_connections where business_id = $1",
    [NEG_A],
  )).rows[0];

beforeAll(async () => {
  db = await createTestDb();

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo) values
      ('${NEG_A}', 'Ana Resto', 'ana', '5493510000001', true),
      ('${NEG_B}', 'Beto Resto', 'beto', '5493510000002', true);
    insert into business_settings (business_id, published, payment_options) values
      ('${NEG_A}', true, '{efectivo,mercadopago}'),
      ('${NEG_B}', true, '{efectivo,mercadopago}');
    insert into categories (id, business_id, name) values
      ('c1000000-0000-0000-0000-000000000011', '${NEG_A}', 'Bebidas'),
      ('c1000000-0000-0000-0000-000000000022', '${NEG_B}', 'Bebidas');
    insert into products (id, business_id, category_id, name, price) values
      ('${CAFE_A}', '${NEG_A}', 'c1000000-0000-0000-0000-000000000011', 'Café', 1000),
      ('${CAFE_B}', '${NEG_B}', 'c1000000-0000-0000-0000-000000000022', 'Café', 1000);
    insert into payment_credentials (business_id, mp_access_token, mp_webhook_secret, enabled) values
      ('${NEG_A}', 'TOKEN-MANUAL-A', '${MANUAL_SECRET_A}', true),
      ('${NEG_B}', 'TOKEN-B', '${SECRET_B}', true);
  `);
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  vi.stubEnv("MP_OAUTH_WEBHOOK_SECRET", APP_SECRET);
  logged = "";
  const capture = (...args: unknown[]) => {
    logged += args.map(String).join(" ") + "\n";
  };
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
  await connect();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cobro de punta a punta con la conexión OAuth", () => {
  it("pedido → /create con el token OAuth → webhook firmado con la clave de la app → pagado → /verify", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim);
    const order = await newOrder("ana", CAFE_A);
    expect(order.paymentStatus).toBe("awaiting");

    const created = await createPayment(deps, { code: order.code });
    expect(created.status).toBe(200);
    // El token descifrado de la conexión, no el de payment_credentials.
    expect(sim.preferences[0].token).toBe("ACCESS-OAUTH");
    expect(sim.preferences[0].input).toMatchObject({
      external_reference: order.id,
      notification_url: `https://www.smaalacarta.com.ar/admin/api/mp/webhook?b=${NEG_A}`,
    });
    expect(sim.calls.refresh).toBe(0);

    const payment = sim.pay(order, "approved");
    const hook = await handleWebhook(deps, notification(NEG_A, APP_SECRET, Number(payment.id)));
    expect(hook).toEqual({ status: 200, body: { result: "paid" } });
    expect(await stored(order.id)).toMatchObject({ payment_status: "paid", mp_payment_id: String(payment.id) });

    const verified = await verifyPayment(deps, { code: order.code }, createRateLimiter(0));
    expect(verified.body).toEqual({ pago: "paid" });
    expect(sim.calls.searchPayments).toBe(0);
  });

  it("si el webhook nunca llega, /verify lo recupera con el token de la conexión", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim);
    const order = await newOrder("ana", CAFE_A);
    sim.pay(order, "approved");

    const verified = await verifyPayment(deps, { code: order.code }, createRateLimiter(0));
    expect(verified.body).toEqual({ pago: "paid" });
    expect((await stored(order.id)).payment_status).toBe("paid");
  });

  it("un negocio sin conexión sigue cobrando con payment_credentials", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim);
    const order = await newOrder("beto", CAFE_B);

    expect((await createPayment(deps, { code: order.code })).status).toBe(200);
    expect(sim.preferences[0].token).toBe("TOKEN-B");

    // Sin collector_id: el camino manual no lo pide.
    const payment = sim.pay(order, "approved", { collector_id: undefined });
    const hook = await handleWebhook(deps, notification(NEG_B, SECRET_B, Number(payment.id)));
    expect(hook.body).toEqual({ result: "paid" });
  });
});

describe("renovación del token contra la base — MP-19 a MP-21", () => {
  it("un token por vencer se renueva al cobrar y se guarda el nuevo, cifrado", async () => {
    await connect(10);
    const sim = fakeMp();
    const order = await newOrder("ana", CAFE_A);

    expect((await createPayment(realDeps(sim), { code: order.code })).status).toBe(200);

    expect(sim.calls.refresh).toBe(1);
    expect(sim.preferences[0].token).toBe("ACCESS-RENOVADO");

    const row = await connectionRow();
    expect(row.access_token_enc).not.toContain("ACCESS-RENOVADO");
    expect(decryptSecret(row.access_token_enc, NEG_A, 1)).toBe("ACCESS-RENOVADO");
    expect(decryptSecret(row.refresh_token_enc, NEG_A, 1)).toBe("REFRESH-RENOVADO");
    expect(row.expires_at.getTime()).toBeGreaterThan(Date.now() + 170 * DAY);
    expect(row.refreshing_until).toBeNull();
    expect(row.status).toBe("connected");
  });

  it("se manda a Mercado Pago el refresh_token guardado, descifrado", async () => {
    await connect(10);
    const sim = fakeMp();
    const seen = vi.fn(sim.behavior.refresh);
    sim.behavior.refresh = seen;
    const order = await newOrder("ana", CAFE_A);

    await createPayment(realDeps(sim), { code: order.code });
    expect(seen).toHaveBeenCalledWith("REFRESH-OAUTH");
  });

  it("dos pedidos a la vez renuevan una sola vez", async () => {
    await connect(10);
    const sim = fakeMp();
    const slow = sim.behavior.refresh;
    sim.behavior.refresh = async (token) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return slow(token);
    };
    const deps = realDeps(sim);
    const [a, b] = [await newOrder("ana", CAFE_A), await newOrder("ana", CAFE_A)];

    const [ra, rb] = await Promise.all([
      createPayment(deps, { code: a.code }),
      createPayment(deps, { code: b.code }),
    ]);

    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(sim.calls.refresh).toBe(1);
    expect(decryptSecret((await connectionRow()).refresh_token_enc, NEG_A, 1)).toBe("REFRESH-RENOVADO");
  });

  it("con el token vencido y otro renovando, el que pierde usa el token que dejó el otro", async () => {
    await connect(-1);
    const sim = fakeMp();
    const slow = sim.behavior.refresh;
    sim.behavior.refresh = async (token) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return slow(token);
    };
    const deps = realDeps(sim);
    const [a, b] = [await newOrder("ana", CAFE_A), await newOrder("ana", CAFE_A)];

    const [ra, rb] = await Promise.all([
      createPayment(deps, { code: a.code }),
      createPayment(deps, { code: b.code }),
    ]);

    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(sim.calls.refresh).toBe(1);
    expect(sim.preferences.map((p) => p.token)).toEqual(["ACCESS-RENOVADO", "ACCESS-RENOVADO"]);
  });

  it("un error transitorio de Mercado Pago no marca needs_reconnect", async () => {
    await connect(10);
    const sim = fakeMp();
    sim.behavior.refresh = async () => {
      throw new MpApiError(503);
    };
    const order = await newOrder("ana", CAFE_A);

    const created = await createPayment(realDeps(sim), { code: order.code });

    // El token actual todavía vale 10 días: se cobra con él.
    expect(created.status).toBe(200);
    expect(sim.preferences[0].token).toBe("ACCESS-OAUTH");
    const row = await connectionRow();
    expect(row.status).toBe("connected");
    expect(row.refreshing_until).toBeNull();
  });

  it("un invalid_grant marca needs_reconnect: se cobra con las credenciales manuales y el menú sigue", async () => {
    await connect(10);
    const sim = fakeMp();
    sim.behavior.refresh = async () => {
      throw new MpApiError(400);
    };
    const order = await newOrder("ana", CAFE_A);

    // Con credenciales manuales habilitadas, se cobra con esas (decisión de precedencia).
    const created = await createPayment(realDeps(sim), { code: order.code });
    expect((await connectionRow()).status).toBe("needs_reconnect");
    expect(created.status).toBe(200);
    expect(sim.preferences[0].token).toBe("TOKEN-MANUAL-A");
  });

  it("con needs_reconnect y sin credenciales manuales: /create 409, el menú oculta la opción, el webhook no rompe", async () => {
    await connect(10);
    await db.exec(`update payment_credentials set enabled = false where business_id = '${NEG_A}'`);

    try {
      const sim = fakeMp();
      const order = await newOrder("ana", CAFE_A);
      await db.query("update payment_connections set status = 'needs_reconnect' where business_id = $1", [NEG_A]);
      const deps = realDeps(sim);

      expect(await createPayment(deps, { code: order.code })).toEqual({ status: 409, body: { error: "not_configured" } });
      expect(sim.preferences).toHaveLength(0);

      const payment = sim.pay(order, "approved");
      const hook = await handleWebhook(deps, notification(NEG_A, APP_SECRET, Number(payment.id)));
      expect(hook).toEqual({ status: 200, body: { ignored: true } });
      expect(sim.calls.getPayment).toBe(0);

      const verified = await verifyPayment(deps, { code: order.code }, createRateLimiter(0));
      expect(verified.body).toEqual({ pago: "awaiting" });
      expect(sim.calls.searchPayments).toBe(0);

      const menu = await asUser(db, null, "select public.public_menu('ana') as m");
      const pagos = menu.ok ? (menu.rows[0].m as { config: { pagos: string[] } }).config.pagos : null;
      expect(pagos).toEqual(["efectivo"]);
    } finally {
      await db.exec(`update payment_credentials set enabled = true where business_id = '${NEG_A}'`);
    }
  });
});

describe("el webhook de un negocio conectado — MP-24 y MP-25", () => {
  it("acepta un aviso viejo firmado con la clave manual del negocio", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim);
    const order = await newOrder("ana", CAFE_A);
    const payment = sim.pay(order, "approved");

    const hook = await handleWebhook(deps, notification(NEG_A, MANUAL_SECRET_A, Number(payment.id)));
    expect(hook.body).toEqual({ result: "paid" });
  });

  it("rechaza una firma ajena con 401 y no toca el pedido", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim);
    const order = await newOrder("ana", CAFE_A);
    const payment = sim.pay(order, "approved");

    const forged = await handleWebhook(deps, notification(NEG_A, SECRET_B, Number(payment.id)));
    expect(forged.status).toBe(401);
    expect((await stored(order.id)).payment_status).toBe("awaiting");
  });

  it("ignora un pago cobrado en otra cuenta (collector distinto) y uno sin collector_id", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim);
    const order = await newOrder("ana", CAFE_A);

    const other = sim.pay(order, "approved", { collector_id: 123456 });
    const missing = sim.pay(order, "approved", { collector_id: null });

    for (const payment of [other, missing]) {
      const hook = await handleWebhook(deps, notification(NEG_A, APP_SECRET, Number(payment.id)));
      expect(hook).toEqual({ status: 200, body: { ignored: true } });
    }
    expect((await stored(order.id)).payment_status).toBe("awaiting");
    expect(logged).toContain("collector distinto");
    expect(logged).not.toMatch(/123456/);
  });

  it("el webhook de un negocio no toca los pedidos de otro, aunque venga firmado", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim);
    const orderA = await newOrder("ana", CAFE_A);
    const payment = sim.pay(orderA, "approved", { collector_id: undefined });

    // Beto firma bien con su propio secreto, pero el pago es de un pedido de Ana.
    const hook = await handleWebhook(deps, notification(NEG_B, SECRET_B, Number(payment.id)));
    expect(hook.body).toEqual({ ignored: true });
    expect((await stored(orderA.id)).payment_status).toBe("awaiting");
  });
});

describe("ningún secreto sale en respuestas ni en logs — MP-26", () => {
  it("ni tokens, ni refresh, ni la clave de la app aparecen", async () => {
    await connect(10);
    const sim = fakeMp();
    const deps = realDeps(sim);
    const order = await newOrder("ana", CAFE_A);

    sim.behavior.refresh = async () => {
      throw new MpApiError(500);
    };
    const replies = [
      await createPayment(deps, { code: order.code }),
      await handleWebhook(deps, notification(NEG_A, "clave-ajena", 1)),
      await handleWebhook(deps, notification(NEG_A, APP_SECRET, 424242)),
      await verifyPayment(deps, { code: order.code }, createRateLimiter(0)),
    ];

    const everything = JSON.stringify(replies) + logged;
    expect(everything).not.toMatch(
      /ACCESS-OAUTH|REFRESH-OAUTH|ACCESS-RENOVADO|REFRESH-RENOVADO|CLAVE-DE-LA-APP|TOKEN-MANUAL-A|SECRETO-MANUAL-A/,
    );
  });
});
