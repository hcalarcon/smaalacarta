// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

import { asService, asUser, createTestDb, type TestDb } from "@/test/db";

import type { OrderItemOption } from "@/lib/orders/item-options";

import type { MpPayment } from "./api";
import { createPayment, handleWebhook, verifyPayment, type MpDeps, type OrderRecord } from "./service";
import { signWebhook } from "./signature";
import { createRateLimiter } from "./rate-limit";

// Flujo completo de cobro: `service.ts` (los tres endpoints) contra Postgres real (PGlite, con
// `confirm_order_payment` y el RLS de verdad) y una API de Mercado Pago simulada que guarda estado.
// Los tests de `service.test.ts` prueban cada regla con dobles; este prueba que las piezas encajan.
const NEG_A = "a1a1a1a1-0000-0000-0000-000000000011";
const NEG_B = "b2b2b2b2-0000-0000-0000-000000000022";
const CAFE_A = "d1000000-0000-0000-0000-000000000011";
const CAFE_B = "d1000000-0000-0000-0000-000000000022";
const SECRET_A = "SECRETO-A";
const SECRET_B = "SECRETO-B";
const TOKEN_A = "TOKEN-A";

let db: TestDb;

// Mercado Pago simulado: guarda los pagos y las preferencias, y cuenta las consultas.
function fakeMp() {
  const payments: MpPayment[] = [];
  const preferences: { token: string; input: Parameters<MpDeps["mp"]["createPreference"]>[1] }[] = [];
  const calls = { getPayment: 0, searchPayments: 0 };

  const mp: MpDeps["mp"] = {
    async createPreference(token, input) {
      preferences.push({ token, input });
      return { init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${preferences.length}` };
    },
    async getPayment(_token, id) {
      calls.getPayment++;
      const found = payments.find((p) => String(p.id) === id);
      if (!found) throw new Error("404");
      return found;
    },
    async searchPayments(_token, reference) {
      calls.searchPayments++;
      return payments.filter((p) => p.external_reference === reference).reverse();
    },
  };

  let nextId = 5000;
  const pay = (order: OrderRecord, status: string, amount = order.total, currency = "ARS") => {
    const payment: MpPayment = {
      id: ++nextId,
      status,
      external_reference: order.id,
      transaction_amount: amount,
      currency_id: currency,
    };
    payments.push(payment);
    return payment;
  };

  return { mp, payments, preferences, calls, pay };
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
  if (!rows[0]) return null;
  const r = rows[0];

  const items = (
    await db.query<{ name: string; quantity: number; unit_price: string; options: OrderItemOption[] | null }>(
      "select name, quantity, unit_price, options from order_items where order_id = $1 order by sort_order",
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
    items: items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: Number(i.unit_price),
      options: i.options,
    })),
  };
}

function realDeps(mp: MpDeps["mp"]): MpDeps {
  return {
    findOrderByCode: (code) => findOrder("code", code),
    findOrderById: (id) => findOrder("id", id),
    async getCredentials(businessId) {
      const { rows } = await db.query<{ mp_access_token: string; mp_webhook_secret: string; enabled: boolean }>(
        "select mp_access_token, mp_webhook_secret, enabled from payment_credentials where business_id = $1",
        [businessId],
      );
      const r = rows[0];
      return r ? { accessToken: r.mp_access_token, webhookSecret: r.mp_webhook_secret, enabled: r.enabled } : null;
    },
    async confirmPayment(orderId, paymentId, status, amount) {
      const r = await asService(
        db,
        `select public.confirm_order_payment('${orderId}', '${paymentId}', '${status}', ${amount}) as r`,
      );
      if (!r.ok) throw new Error(r.error);
      return String(r.rows[0].r);
    },
    mp,
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
       '[{"id":"${product}","kind":"product","quantity":2}]'::jsonb) as result`,
  );
  if (!r.ok) throw new Error(r.error);
  const { code } = r.rows[0].result as { code: string };
  return (await findOrder("code", code))!;
}

// Lo que Mercado Pago le manda al webhook: firmado con el secreto del negocio.
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

const events = async (id: string) =>
  Number(
    (await db.query<{ n: string }>("select count(*) as n from order_events where order_id = $1 and kind = 'payment'", [id]))
      .rows[0].n,
  );

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
      ('${NEG_A}', '${TOKEN_A}', '${SECRET_A}', true),
      ('${NEG_B}', 'TOKEN-B', '${SECRET_B}', true);
  `);
}, 60_000);

describe("flujo de cobro con Mercado Pago, de punta a punta", () => {
  it("pedido → /create → pago aprobado → webhook firmado → pagado → /verify sin consultar a MP", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);
    expect(order.paymentStatus).toBe("awaiting");

    const created = await createPayment(deps, { code: order.code });
    expect(created.status).toBe(200);
    expect(created.body.init_point).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\//);
    expect(sim.preferences[0].token).toBe(TOKEN_A);
    expect(sim.preferences[0].input).toMatchObject({
      external_reference: order.id,
      notification_url: `https://www.smaalacarta.com.ar/admin/api/mp/webhook?b=${NEG_A}`,
    });
    // Lo que se cobra sale de lo guardado: 2 × $1000.
    expect(sim.preferences[0].input.items).toEqual([
      { title: "Café", quantity: 2, unit_price: 1000, currency_id: "ARS" },
    ]);

    const payment = sim.pay(order, "approved");
    const hook = await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(payment.id)));
    expect(hook).toEqual({ status: 200, body: { result: "paid" } });
    expect(await stored(order.id)).toMatchObject({ payment_status: "paid", mp_payment_id: String(payment.id) });

    const verified = await verifyPayment(deps, { code: order.code }, createRateLimiter(0));
    expect(verified.body).toEqual({ pago: "paid" });
    expect(sim.calls.searchPayments).toBe(0);
  });

  it("MP reintenta el mismo aviso: queda pagado y con un solo evento", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);
    const payment = sim.pay(order, "approved");

    for (let i = 0; i < 3; i++) {
      expect((await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(payment.id)))).status).toBe(200);
    }
    expect((await stored(order.id)).payment_status).toBe("paid");
    expect(await events(order.id)).toBe(1);
  });

  it("tarjeta rechazada, reintento con /create y pago aprobado", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);

    const rejected = sim.pay(order, "rejected");
    await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(rejected.id)));
    expect((await stored(order.id)).payment_status).toBe("failed");

    expect((await createPayment(deps, { code: order.code })).status).toBe(200);

    const approved = sim.pay(order, "approved");
    await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(approved.id)));
    expect(await stored(order.id)).toMatchObject({ payment_status: "paid", mp_payment_id: String(approved.id) });
  });

  it("un rechazo que llega tarde no pisa un pago ya aprobado", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);

    const approved = sim.pay(order, "approved");
    const rejected = sim.pay(order, "rejected");
    await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(approved.id), "req-a"));
    await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(rejected.id), "req-b"));

    expect(await stored(order.id)).toMatchObject({ payment_status: "paid", mp_payment_id: String(approved.id) });
  });

  it("si el webhook nunca llega, /verify lo recupera consultando a Mercado Pago", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);
    sim.pay(order, "approved");

    const verified = await verifyPayment(deps, { code: order.code }, createRateLimiter(0));
    expect(verified.body).toEqual({ pago: "paid" });
    expect((await stored(order.id)).payment_status).toBe("paid");
  });

  it("un pago aprobado por otro monto no marca el pedido como pagado", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);
    const payment = sim.pay(order, "approved", 1);

    const hook = await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(payment.id)));
    expect(hook.body).toEqual({ result: "mismatch" });
    expect(await stored(order.id)).toMatchObject({ payment_status: "awaiting", mp_payment_id: null });

    const verified = await verifyPayment(deps, { code: order.code }, createRateLimiter(0));
    expect(verified.body).toEqual({ pago: "awaiting" });
  });

  it("pagos pendientes, en proceso o reembolsados no cambian el pedido", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);

    for (const status of ["pending", "in_process", "refunded"]) {
      const payment = sim.pay(order, status);
      expect((await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(payment.id)))).status).toBe(200);
    }
    expect((await stored(order.id)).payment_status).toBe("awaiting");
  });

  it("el webhook de un negocio no toca los pedidos de otro, aunque venga firmado", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const orderA = await newOrder("ana", CAFE_A);
    const payment = sim.pay(orderA, "approved");

    // Beto firma bien con su propio secreto, pero el pago es de un pedido de Ana.
    const hook = await handleWebhook(deps, notification(NEG_B, SECRET_B, Number(payment.id)));
    expect(hook.body).toEqual({ ignored: true });
    expect((await stored(orderA.id)).payment_status).toBe("awaiting");

    // Y con el secreto de Beto no se puede hacer pasar por Ana.
    const forged = await handleWebhook(deps, notification(NEG_A, SECRET_B, Number(payment.id)));
    expect(forged.status).toBe(401);
    expect((await stored(orderA.id)).payment_status).toBe("awaiting");
  });

  it("un negocio con las credenciales deshabilitadas no cobra ni confirma", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("beto", CAFE_B);
    const payment = sim.pay(order, "approved");

    await db.exec(`update payment_credentials set enabled = false where business_id = '${NEG_B}'`);
    try {
      expect((await createPayment(deps, { code: order.code })).body).toEqual({ error: "not_configured" });
      expect((await handleWebhook(deps, notification(NEG_B, SECRET_B, Number(payment.id)))).body).toEqual({
        ignored: true,
      });
      expect((await stored(order.id)).payment_status).toBe("awaiting");
    } finally {
      await db.exec(`update payment_credentials set enabled = true where business_id = '${NEG_B}'`);
    }
  });

  it("un pedido cancelado ya no se puede pagar", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);
    await db.exec(`update orders set status = 'cancelled' where id = '${order.id}'`);

    const created = await createPayment(deps, { code: order.code });
    expect(created).toEqual({ status: 409, body: { error: "cancelled" } });
    expect(sim.preferences).toHaveLength(0);
  });

  it("si la base falla al confirmar, el webhook responde 500 y MP reintenta con éxito", async () => {
    const sim = fakeMp();
    const real = realDeps(sim.mp);
    const order = await newOrder("ana", CAFE_A);
    const payment = sim.pay(order, "approved");

    const confirmPayment = vi.fn(real.confirmPayment).mockRejectedValueOnce(new Error("base caída"));
    const deps = { ...real, confirmPayment };

    expect((await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(payment.id)))).status).toBe(500);
    expect((await stored(order.id)).payment_status).toBe("awaiting");

    expect((await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(payment.id)))).status).toBe(200);
    expect((await stored(order.id)).payment_status).toBe("paid");
  });
});

describe("cobro de un pedido con opciones y extras — MP-8", () => {
  const CAT_A = "c1000000-0000-0000-0000-000000000011";
  const HELADO = "d1000000-0000-0000-0000-0000000000a1";
  const G_SABORES = "9a000000-0000-0000-0000-0000000000a1";
  const G_TOPPINGS = "9a000000-0000-0000-0000-0000000000a2";
  const FRUTILLA = "0a000000-0000-0000-0000-0000000000a1";
  const LIMON = "0a000000-0000-0000-0000-0000000000a2";
  const CHOCOLATE = "0a000000-0000-0000-0000-0000000000a3";

  beforeAll(async () => {
    await db.exec(`
      insert into products (id, business_id, category_id, name, price)
        values ('${HELADO}', '${NEG_A}', '${CAT_A}', 'Helado', 3000);
      insert into option_groups (id, business_id, name, min_select, max_select, allow_repeat, sort_order) values
        ('${G_SABORES}', '${NEG_A}', 'Sabores', 1, 3, true, 0),
        ('${G_TOPPINGS}', '${NEG_A}', 'Toppings', 0, 2, false, 1);
      insert into options (id, group_id, business_id, name, price_delta, sort_order) values
        ('${FRUTILLA}', '${G_SABORES}', '${NEG_A}', 'Frutilla', 0, 0),
        ('${LIMON}', '${G_SABORES}', '${NEG_A}', 'Limón', 0, 1),
        ('${CHOCOLATE}', '${G_TOPPINGS}', '${NEG_A}', 'Chocolate', 300, 0);
      insert into product_option_groups (product_id, group_id, business_id, sort_order) values
        ('${HELADO}', '${G_SABORES}', '${NEG_A}', 0),
        ('${HELADO}', '${G_TOPPINGS}', '${NEG_A}', 1);
    `);
  });

  async function orderWithOptions(quantity: number) {
    const options = JSON.stringify([
      { id: FRUTILLA, quantity: 2 },
      { id: LIMON, quantity: 1 },
      { id: CHOCOLATE, quantity: 1 },
    ]);
    const r = await asUser(
      db,
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'mercadopago', null,
         '[{"id":"${HELADO}","kind":"product","quantity":${quantity},"options":${options}}]'::jsonb) as result`,
    );
    if (!r.ok) throw new Error(r.error);
    const { code } = r.rows[0].result as { code: string };
    return (await findOrder("code", code))!;
  }

  it("el total de la preferencia coincide con orders.total y el título lleva las opciones", async () => {
    const sim = fakeMp();
    const order = await orderWithOptions(2);

    // Helado $3000 + topping $300 = $3300 por unidad, 2 unidades.
    expect(order.total).toBe(6600);

    const created = await createPayment(realDeps(sim.mp), { code: order.code });
    expect(created.status).toBe(200);

    const { items } = sim.preferences[0].input;
    expect(items).toEqual([
      { title: "Helado (Frutilla ×2, Limón, Chocolate)", quantity: 2, unit_price: 3300, currency_id: "ARS" },
    ]);

    const sum = items.reduce((acc, item) => acc + item.unit_price * item.quantity, 0);
    expect(sum).toBe(order.total);

    const stored = await db.query<{ total: string }>("select total from orders where id = $1", [order.id]);
    expect(sum).toBe(Number(stored.rows[0].total));
  });

  it("un pago por el total con extras se confirma; por el precio sin extras, no", async () => {
    const sim = fakeMp();
    const deps = realDeps(sim.mp);

    const ok = await orderWithOptions(1);
    const approved = sim.pay(ok, "approved", 3300);
    expect((await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(approved.id)))).body).toEqual({
      result: "paid",
    });

    const bad = await orderWithOptions(1);
    const short = sim.pay(bad, "approved", 3000);
    expect((await handleWebhook(deps, notification(NEG_A, SECRET_A, Number(short.id)))).body).not.toEqual({
      result: "paid",
    });
  });
});
