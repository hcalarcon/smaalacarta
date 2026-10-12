// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asService, asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// MP-23 contra Postgres real: el menú y el pedido cuentan la conexión OAuth, y con credenciales manuales
// todo sigue igual. `mercadopago.test.ts` (MP-1) sigue probando el camino manual sin cambios.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const connection = (status: string) =>
  db.exec(`
    delete from payment_connections;
    insert into payment_connections
      (business_id, mp_user_id, access_token_enc, refresh_token_enc, key_version, expires_at, status, connected_by)
    values ('${NEG_ANA}', 111, ${status === "revoked" ? "null" : "'cifrado-a'"},
            ${status === "revoked" ? "null" : "'cifrado-r'"}, 1, now() + interval '90 days', '${status}', '${ANA}')
  `);
const noConnection = () => db.exec("delete from payment_connections");
const credentials = (enabled: boolean) =>
  db.exec(`
    insert into payment_credentials (business_id, mp_access_token, mp_webhook_secret, enabled)
    values ('${NEG_ANA}', 'TOKEN-DE-PRUEBA', 'SECRETO-DE-PRUEBA', ${enabled})
    on conflict (business_id) do update set enabled = ${enabled}
  `);
const noCredentials = () => db.exec("delete from payment_credentials");

const order = (payment: string) =>
  asUser(
    db,
    null,
    `select public.create_public_order('ana', 'Cliente', 'retiro', '${payment}', null,
       '[{"id":"${CAFE}","kind":"product","quantity":1}]'::jsonb,
       p_customer_phone => '3515551234') as result`,
  );

const pagos = async () => {
  const r = await asUser(db, null, "select public.public_menu('ana') as m");
  return r.ok ? (r.rows[0].m as { config: { pagos: string[] } }).config.pagos : null;
};

// Como el dueño de la base: la usan otras funciones SECURITY DEFINER, no la API.
const hasMp = async () =>
  (await db.query<{ r: boolean }>(`select public.business_has_mp('${NEG_ANA}') as r`)).rows[0].r;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo)
      values ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true);
    insert into business_users (business_id, user_id, role) values ('${NEG_ANA}', '${ANA}', 'owner');
    insert into business_settings (business_id, published, payment_options)
      values ('${NEG_ANA}', true, '{efectivo,mercadopago}');
    insert into categories (id, business_id, name)
      values ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas');
    insert into products (id, business_id, category_id, name, price)
      values ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000);
  `);
}, 60_000);

describe("business_has_mp — MP-23", () => {
  it("es verdadera con una conexión connected", async () => {
    await noCredentials();
    await connection("connected");
    expect(await hasMp()).toBe(true);
  });

  it.each(["needs_reconnect", "revoked"])("es falsa con una conexión en %s", async (status) => {
    await noCredentials();
    await connection(status);
    expect(await hasMp()).toBe(false);
  });

  it("es verdadera con credenciales manuales habilitadas y falsa con las deshabilitadas", async () => {
    await noConnection();
    await credentials(true);
    expect(await hasMp()).toBe(true);

    await credentials(false);
    expect(await hasMp()).toBe(false);
  });

  it("es falsa sin conexión ni credenciales", async () => {
    await noConnection();
    await noCredentials();
    expect(await hasMp()).toBe(false);
  });

  it.each([
    ["anon", null],
    ["authenticated", ANA],
  ])("%s no puede ejecutarla", async (_name, user) => {
    const r = await asUser(db, user, `select public.business_has_mp('${NEG_ANA}'::uuid)`);
    expect(r.ok).toBe(false);
  });
});

describe("el menú público con la conexión — MP-23", () => {
  it("ofrece mercadopago con la conexión connected y no con needs_reconnect o revoked", async () => {
    await noCredentials();

    await connection("connected");
    expect(await pagos()).toEqual(["efectivo", "mercadopago"]);

    await connection("needs_reconnect");
    expect(await pagos()).toEqual(["efectivo"]);

    await connection("revoked");
    expect(await pagos()).toEqual(["efectivo"]);
  });

  it("con credenciales manuales sigue igual", async () => {
    await noConnection();
    await credentials(false);
    expect(await pagos()).toEqual(["efectivo"]);

    await credentials(true);
    expect(await pagos()).toEqual(["efectivo", "mercadopago"]);
  });

  it("no filtra nada de la conexión", async () => {
    await connection("connected");
    const menu = await asUser(db, null, "select public.public_menu('ana')::text as m");
    expect(menu.ok && JSON.stringify(menu.rows)).not.toMatch(/cifrado-a|cifrado-r|mp_user_id|access_token/);
  });

  it("exige que el negocio tenga mercadopago en sus medios de pago", async () => {
    await connection("connected");
    await db.exec(`update business_settings set payment_options = '{efectivo}' where business_id = '${NEG_ANA}'`);
    expect(await pagos()).toEqual(["efectivo"]);
    await db.exec(
      `update business_settings set payment_options = '{efectivo,mercadopago}' where business_id = '${NEG_ANA}'`,
    );
  });
});

describe("el pedido con la conexión — MP-23", () => {
  it("con la conexión connected acepta mercadopago y el pedido espera el pago", async () => {
    await noCredentials();
    await connection("connected");

    const r = await order("mercadopago");
    expect(r.ok).toBe(true);
    const { code } = (r.ok && r.rows[0].result) as { code: string };
    const row = await db.query<{ payment_status: string }>(`select payment_status from orders where code = '${code}'`);
    expect(row.rows[0].payment_status).toBe("awaiting");
  });

  it.each(["needs_reconnect", "revoked"])("con la conexión en %s rechaza mercadopago (P0008)", async (status) => {
    await noCredentials();
    await connection(status);

    const r = await order("mercadopago");
    expect(!r.ok && r.code).toBe("P0008");
  });

  it("con credenciales manuales habilitadas acepta y con las deshabilitadas rechaza, como siempre", async () => {
    await noConnection();
    await credentials(true);
    expect((await order("mercadopago")).ok).toBe(true);

    await credentials(false);
    const r = await order("mercadopago");
    expect(!r.ok && r.code).toBe("P0008");
  });

  it("otros medios de pago no dependen de la conexión", async () => {
    await noConnection();
    await noCredentials();
    expect((await order("efectivo")).ok).toBe(true);
  });
});

describe("la columna del arriendo — MP-20", () => {
  it("existe, arranca vacía y nadie sin la clave de servicio la lee", async () => {
    await connection("connected");

    const own = await asService(db, "select refreshing_until from payment_connections");
    expect(own.ok && own.rows[0].refreshing_until).toBeNull();

    for (const user of [null, ANA]) {
      const read = await asUser(db, user, "select refreshing_until from payment_connections");
      expect(read.ok && read.rows).toEqual([]);
    }
  });
});
