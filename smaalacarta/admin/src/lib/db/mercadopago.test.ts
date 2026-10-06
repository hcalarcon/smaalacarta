// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asService, asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// MP-1, MP-2, PUBLICO-35, SEGUIMIENTO-20 y 21 y ADMIN-PEDIDOS-17 y 18 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const setSettings = (sql: string) =>
  db.exec(`update business_settings set ${sql} where business_id = '${NEG_ANA}'`);
const setCredentials = (enabled: boolean) =>
  db.exec(`
    insert into payment_credentials (business_id, mp_access_token, mp_webhook_secret, enabled)
    values ('${NEG_ANA}', 'TOKEN-DE-PRUEBA', 'SECRETO-DE-PRUEBA', ${enabled})
    on conflict (business_id) do update set enabled = ${enabled}
  `);
const removeCredentials = () => db.exec(`delete from payment_credentials`);

function order(payment: string, extra = "") {
  return asUser(
    db,
    null,
    `select public.create_public_order('ana', 'Cliente', 'retiro', '${payment}', null,
       '[{"id":"${CAFE}","kind":"product","quantity":2}]'::jsonb${extra}) as result`,
  );
}

async function newMpOrder() {
  const r = await order("mercadopago");
  if (!r.ok) throw new Error(r.error);
  const { code } = r.rows[0].result as { code: string };
  return (await db.query<{ id: string; total: string }>(`select id, total from orders where code = '${code}'`)).rows[0];
}

const stored = async (id: string) =>
  (await db.query<{ payment_status: string; mp_payment_id: string | null; status: string }>(
    `select payment_status, mp_payment_id, status from orders where id = '${id}'`,
  )).rows[0];

const confirm = (id: string, paymentId: string, status: string, amount: number | string) =>
  asService(db, `select public.confirm_order_payment('${id}', '${paymentId}', '${status}', ${amount}) as r`);

const pagos = async () => {
  const r = await asUser(db, null, "select public.public_menu('ana') as m");
  return r.ok ? ((r.rows[0].m as { config: { pagos: string[] } }).config.pagos) : null;
};

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo) values ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published, payment_options)
      values ('${NEG_ANA}', true, '{efectivo,mercadopago}');
    insert into categories (id, business_id, name) values ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas');
    insert into products (id, business_id, category_id, name, price) values ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000);
  `);
}, 60_000);

describe("las credenciales — MP-1", () => {
  it("ni un visitante ni el dueño del negocio las leen ni las escriben", async () => {
    await setCredentials(true);

    for (const user of [null, ANA]) {
      const read = await asUser(db, user, "select mp_access_token, mp_webhook_secret from payment_credentials");
      expect(read.ok && read.rows).toEqual([]);

      const write = await asUser(
        db,
        user,
        `insert into payment_credentials (business_id, mp_access_token, mp_webhook_secret) values ('${NEG_ANA}', 'x', 'y')`,
      );
      expect(write.ok).toBe(false);

      const update = await asUser(db, user, "update payment_credentials set enabled = false");
      expect(update.ok && update.affected).toBe(0);
    }
  });

  it("no salen por el menú público ni por el seguimiento", async () => {
    const menu = await asUser(db, null, "select public.public_menu('ana')::text as m");
    expect(menu.ok && JSON.stringify(menu.rows)).not.toMatch(/TOKEN-DE-PRUEBA|SECRETO-DE-PRUEBA|mp_access_token/);

    const o = await newMpOrder();
    const { rows } = await db.query<{ code: string }>(`select code from orders where id = '${o.id}'`);
    const tracking = await asUser(db, null, `select public.public_order_tracking('${rows[0].code}')::text as t`);
    expect(tracking.ok && JSON.stringify(tracking.rows)).not.toMatch(/TOKEN-DE-PRUEBA|SECRETO-DE-PRUEBA/);
  });
});

describe("el menú público — PUBLICO-35", () => {
  it("ofrece mercadopago solo con credenciales habilitadas", async () => {
    await removeCredentials();
    expect(await pagos()).toEqual(["efectivo"]);

    await setCredentials(false);
    expect(await pagos()).toEqual(["efectivo"]);

    await setCredentials(true);
    expect(await pagos()).toEqual(["efectivo", "mercadopago"]);
  });
});

describe("el pedido — SEGUIMIENTO-20", () => {
  it("rechaza mercadopago si el negocio no tiene credenciales habilitadas (P0008)", async () => {
    await removeCredentials();
    const sinCredenciales = await order("mercadopago");
    expect(!sinCredenciales.ok && sinCredenciales.code).toBe("P0008");

    await setCredentials(false);
    const deshabilitadas = await order("mercadopago");
    expect(!deshabilitadas.ok && deshabilitadas.code).toBe("P0008");
  });

  it("rechaza mercadopago si el negocio no lo eligió, aunque tenga credenciales", async () => {
    await setCredentials(true);
    await setSettings("payment_options = '{efectivo}'");

    const r = await order("mercadopago");
    expect(!r.ok && r.code).toBe("P0008");

    await setSettings("payment_options = '{efectivo,mercadopago}'");
  });

  it("con credenciales crea el pedido esperando el pago", async () => {
    await setCredentials(true);
    const o = await newMpOrder();
    expect((await stored(o.id)).payment_status).toBe("awaiting");
  });

  it("con otro medio de pago no pide pago", async () => {
    const r = await order("efectivo");
    expect(r.ok).toBe(true);
    const { code } = (r.ok ? r.rows[0].result : {}) as { code: string };
    const row = (await db.query<{ payment_status: string }>(`select payment_status from orders where code = '${code}'`)).rows[0];
    expect(row.payment_status).toBe("not_required");
  });
});

describe("confirm_order_payment — MP-2", () => {
  it("solo la ejecuta la clave de servicio", async () => {
    const o = await newMpOrder();
    const sql = `select public.confirm_order_payment('${o.id}', '1', 'paid', ${o.total})`;

    expect((await asUser(db, null, sql)).ok).toBe(false);
    expect((await asUser(db, ANA, sql)).ok).toBe(false);
    expect((await stored(o.id)).payment_status).toBe("awaiting");
    expect((await asService(db, sql)).ok).toBe(true);
  });

  it("con el monto exacto marca el pedido pagado, guarda el id y registra un evento", async () => {
    const o = await newMpOrder();
    const r = await confirm(o.id, "987654", "paid", o.total);

    expect(r.ok && r.rows[0].r).toBe("paid");
    expect(await stored(o.id)).toMatchObject({ payment_status: "paid", mp_payment_id: "987654" });

    const events = (await db.query<{ kind: string; note: string }>(
      `select kind, note from order_events where order_id = '${o.id}' and kind = 'payment'`,
    )).rows;
    expect(events).toHaveLength(1);
    expect(events[0].note).toMatch(/Mercado Pago/);
  });

  it("no confirma si el monto no coincide con el total", async () => {
    const o = await newMpOrder();

    for (const amount of [Number(o.total) - 1, Number(o.total) + 1, "null"]) {
      const r = await confirm(o.id, "111", "paid", amount);
      expect(r.ok && r.rows[0].r).toBe("mismatch");
    }
    expect(await stored(o.id)).toMatchObject({ payment_status: "awaiting", mp_payment_id: null });
  });

  it("es idempotente: repetir el aviso no duplica el evento", async () => {
    const o = await newMpOrder();
    await confirm(o.id, "222", "paid", o.total);
    const again = await confirm(o.id, "222", "paid", o.total);

    expect(again.ok && again.rows[0].r).toBe("paid");
    const { rows } = await db.query<{ n: string }>(
      `select count(*) as n from order_events where order_id = '${o.id}' and kind = 'payment'`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("un pago rechazado deja el pedido en fallido, y uno aprobado después lo paga", async () => {
    const o = await newMpOrder();

    expect((await confirm(o.id, "333", "failed", o.total)).ok).toBe(true);
    expect((await stored(o.id)).payment_status).toBe("failed");

    await confirm(o.id, "444", "paid", o.total);
    expect(await stored(o.id)).toMatchObject({ payment_status: "paid", mp_payment_id: "444" });
  });

  it("un pedido pagado nunca vuelve a fallido", async () => {
    const o = await newMpOrder();
    await confirm(o.id, "555", "paid", o.total);
    const late = await confirm(o.id, "666", "failed", o.total);

    expect(late.ok && late.rows[0].r).toBe("paid");
    expect(await stored(o.id)).toMatchObject({ payment_status: "paid", mp_payment_id: "555" });
  });

  it("rechaza un estado desconocido, un pedido inexistente y un pedido que no es con Mercado Pago", async () => {
    const o = await newMpOrder();
    expect((await confirm(o.id, "1", "approved", o.total)).ok).toBe(false);

    const missing = await confirm("00000000-0000-0000-0000-000000000000", "1", "paid", 1);
    expect(!missing.ok && missing.code).toBe("P0002");

    const cash = await order("efectivo");
    const { code } = (cash.ok ? cash.rows[0].result : {}) as { code: string };
    const { rows } = await db.query<{ id: string }>(`select id from orders where code = '${code}'`);
    expect((await confirm(rows[0].id, "1", "paid", 2000)).ok).toBe(false);
  });
});

describe("el estado del pedido — ADMIN-PEDIDOS-18", () => {
  const setStatus = (id: string, status: string) =>
    asUser(db, ANA, `select public.set_order_status('${id}', '${status}')`);

  it("sin pagar solo se puede cancelar (P0004)", async () => {
    const o = await newMpOrder();

    const advance = await setStatus(o.id, "confirmed");
    expect(!advance.ok && advance.code).toBe("P0004");
    expect((await stored(o.id)).status).toBe("pending");

    expect((await setStatus(o.id, "cancelled")).ok).toBe(true);
    expect((await stored(o.id)).status).toBe("cancelled");
  });

  it("con el pago fallido también solo se puede cancelar", async () => {
    const o = await newMpOrder();
    await confirm(o.id, "1", "failed", o.total);

    const advance = await setStatus(o.id, "confirmed");
    expect(!advance.ok && advance.code).toBe("P0004");
  });

  it("pagado sigue el camino de siempre", async () => {
    const o = await newMpOrder();
    await confirm(o.id, "1", "paid", o.total);

    expect((await setStatus(o.id, "confirmed")).ok).toBe(true);
    expect((await setStatus(o.id, "ready")).ok).toBe(true);
    expect((await stored(o.id)).status).toBe("ready");
  });

  it("un pedido sin Mercado Pago no cambia", async () => {
    const r = await order("efectivo");
    const { code } = (r.ok ? r.rows[0].result : {}) as { code: string };
    const { rows } = await db.query<{ id: string }>(`select id from orders where code = '${code}'`);

    expect((await setStatus(rows[0].id, "confirmed")).ok).toBe(true);
  });
});

describe("el seguimiento — SEGUIMIENTO-21", () => {
  const tracking = async (id: string) => {
    const { rows } = await db.query<{ code: string }>(`select code from orders where id = '${id}'`);
    const r = await asUser(db, null, `select public.public_order_tracking('${rows[0].code}') as t`);
    return r.ok ? (r.rows[0].t as { pedido: Record<string, unknown>; eventos: { estado: string; nota?: string }[] }) : null;
  };

  it("entrega el estado de pago de un pedido con Mercado Pago, sin el id del pago", async () => {
    const o = await newMpOrder();
    expect((await tracking(o.id))?.pedido.pago).toBe("awaiting");

    await confirm(o.id, "777", "paid", o.total);
    const paid = await tracking(o.id);
    expect(paid?.pedido.pago).toBe("paid");
    expect(JSON.stringify(paid)).not.toContain("777");
  });

  it("no entrega `pago` en un pedido con otro medio", async () => {
    const r = await order("efectivo");
    const { code } = (r.ok ? r.rows[0].result : {}) as { code: string };
    const t = await asUser(db, null, `select public.public_order_tracking('${code}') as t`);

    expect(t.ok && (t.rows[0].t as { pedido: Record<string, unknown> }).pedido).not.toHaveProperty("pago");
  });

  it("los eventos de pago no aparecen en la línea de tiempo", async () => {
    const o = await newMpOrder();
    await confirm(o.id, "888", "paid", o.total);

    const t = await tracking(o.id);
    expect(t?.eventos).toHaveLength(1);
    expect(t?.eventos[0].estado).toBe("pending");
  });

  it("marca `anticipado` solo en los pedidos anticipados", async () => {
    const o = await newMpOrder();
    expect((await tracking(o.id))?.pedido).not.toHaveProperty("anticipado");

    await db.exec(`update orders set preorder = true, scheduled_for = now() + interval '1 day' where id = '${o.id}'`);
    expect((await tracking(o.id))?.pedido.anticipado).toBe(true);
  });
});
