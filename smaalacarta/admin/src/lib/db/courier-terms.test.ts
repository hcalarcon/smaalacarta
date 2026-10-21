// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadTerms } from "@/lib/courier/terms-file";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer, openSearch } from "@/test/offers";

// ENVIO-179 a 182 contra Postgres real: los términos para repartidores y su aceptación.
const SUPER = "99999999-0000-0000-0000-000000000009";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const UNO_USER = "cccccccc-0000-0000-0000-000000000006";
const DOS_USER = "cccccccc-0000-0000-0000-000000000007";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const UNO = "7a0c0e00-0000-4000-8000-000000000002";
const DOS = "7a0c0e00-0000-4000-8000-000000000003";
const CAFE = "d1000000-0000-0000-0000-000000000001";

const TERMS_VERSION = loadTerms().version;

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const setRequired = (on: boolean) => db.exec(`update platform_settings set courier_terms_required = ${on}`);
const accept = (user: string, version = 1) => call(user, `select public.courier_accept_terms(${version})`);
const take = (user: string, id: string) => call(user, `select public.courier_take_order('${id}')`);

async function envio() {
  const zone = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${zone}'::uuid, p_customer_phone => '3515551234',
       p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  await openSearch(db, o.id);
  return o.id;
}

async function available(user: string) {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].l as { id: string }[];
}

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed", courierTerms: true });

  await createUser(db, { id: SUPER, email: "super@x.com" });
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: UNO_USER, email: "uno@x.com" });
  await createUser(db, { id: DOS_USER, email: "dos@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published, address) values ('${NEG_ANA}', true, 'San Martín 100');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into couriers (id, name, whatsapp, active) values
      ('${UNO}', 'Uno Express', '5493510000099', true),
      ('${DOS}', 'Dos Express', '5493510000098', true);
    insert into courier_users (courier_id, user_id) values ('${UNO}', '${UNO_USER}'), ('${DOS}', '${DOS_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select c, id from delivery_zones, (values ('${UNO}'::uuid), ('${DOS}'::uuid)) v(c) where name = 'Cantera';
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Cantera';
  `);
}, 60_000);

beforeEach(async () => {
  // El freno de 20 pedidos por minuto.
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await db.exec("update platform_settings set courier_terms_version = 1, delivery_mode = 'fixed'");
  await db.exec("delete from courier_terms_acceptances");
  await setRequired(true);
});

afterAll(async () => {
  await db.close();
});

describe("la versión — ENVIO-179", () => {
  it("arranca en 1, igual que el archivo de los términos", async () => {
    const r = await call(UNO_USER, "select public.courier_terms_version() as v");
    expect(r.ok && r.rows[0].v).toBe(TERMS_VERSION);
    expect(TERMS_VERSION).toBe(1);
  });

  it("el archivo de los términos lleva su número al lado y el texto", () => {
    const terms = loadTerms();
    expect(terms.version).toBeGreaterThanOrEqual(1);
    expect(terms.body).toContain("Términos para repartidores");
  });
});

describe("el interruptor — ENVIO-181", () => {
  it("arranca prendido", async () => {
    // Sin el ajuste de los tests: el valor que deja la migración.
    const fresh = await createTestDb({ before: "20261116000000" });
    const r = await fresh.query("select courier_terms_required from platform_settings");
    expect(r.rows).toEqual([{ courier_terms_required: true }]);
    await fresh.close();
  }, 60_000);

  it("solo el superadmin lo cambia", async () => {
    const a = await call(ANA, "update platform_settings set courier_terms_required = false");
    expect(a.ok && a.affected).toBe(0);
    const c = await call(UNO_USER, "update platform_settings set courier_terms_required = false");
    expect(c.ok && c.affected).toBe(0);
    expect((await db.query("select courier_terms_required from platform_settings")).rows[0]).toEqual({
      courier_terms_required: true,
    });

    const s = await call(SUPER, "update platform_settings set courier_terms_required = false returning 1 as ok");
    expect(s.ok && s.affected).toBe(1);
  });

  it("cualquier usuario con sesión lo puede preguntar", async () => {
    const on = await call(UNO_USER, "select public.courier_terms_required() as v");
    expect(on.ok && on.rows[0].v).toBe(true);
    await setRequired(false);
    const off = await call(UNO_USER, "select public.courier_terms_required() as v");
    expect(off.ok && off.rows[0].v).toBe(false);
  });
});

describe("la aceptación — ENVIO-180", () => {
  it("guarda quién, qué versión y cuándo (hora del servidor)", async () => {
    const r = await accept(UNO_USER);
    expect(r.ok).toBe(true);

    const rows = (
      await db.query("select courier_id, version, accepted_at is not null as at from courier_terms_acceptances")
    ).rows;
    expect(rows).toEqual([{ courier_id: UNO, version: 1, at: true }]);
  });

  it("exige la versión vigente", async () => {
    const r = await accept(UNO_USER, 7);
    expect(!r.ok && r.code).toBe("22023");
  });

  it("quien no es repartidor no acepta", async () => {
    const r = await accept(ANA);
    expect(!r.ok && r.code).toBe("42501");
    const anon = await call(null, "select public.courier_accept_terms(1)");
    expect(anon.ok).toBe(false);
  });

  it("aceptar dos veces la misma versión no duplica la prueba", async () => {
    await accept(UNO_USER);
    await accept(UNO_USER);
    expect((await db.query("select count(*)::int as n from courier_terms_acceptances")).rows[0]).toEqual({ n: 1 });
  });

  it("el repartidor lee solo las suyas", async () => {
    await accept(UNO_USER);
    await accept(DOS_USER);

    const uno = await call(UNO_USER, "select courier_id from courier_terms_acceptances");
    expect(uno.ok && uno.rows).toEqual([{ courier_id: UNO }]);
    const dos = await call(DOS_USER, "select courier_id from courier_terms_acceptances");
    expect(dos.ok && dos.rows).toEqual([{ courier_id: DOS }]);
  });

  it("el dueño de un negocio y el anónimo no las ven", async () => {
    await accept(UNO_USER);
    const ana = await call(ANA, "select * from courier_terms_acceptances");
    expect(ana.ok && ana.rows).toEqual([]);
    const anon = await call(null, "select * from courier_terms_acceptances");
    expect(!anon.ok || anon.rows.length === 0).toBe(true);
  });

  it("el superadmin las lee todas", async () => {
    await accept(UNO_USER);
    await accept(DOS_USER);
    const s = await call(SUPER, "select courier_id from courier_terms_acceptances");
    expect(s.ok && s.rows).toHaveLength(2);
  });

  it("nadie inserta, edita ni borra directo, ni para sí ni para otro", async () => {
    const insOwn = await call(UNO_USER, `insert into courier_terms_acceptances (courier_id, version) values ('${UNO}', 1)`);
    expect(insOwn.ok).toBe(false);
    const insOther = await call(UNO_USER, `insert into courier_terms_acceptances (courier_id, version) values ('${DOS}', 1)`);
    expect(insOther.ok).toBe(false);

    await accept(UNO_USER);
    const upd = await call(UNO_USER, "update courier_terms_acceptances set version = 9");
    expect(upd.ok && upd.affected).toBe(0);
    const del = await call(UNO_USER, "delete from courier_terms_acceptances");
    expect(del.ok && del.affected).toBe(0);
    const sup = await call(SUPER, "delete from courier_terms_acceptances");
    expect(sup.ok && sup.affected).toBe(0);
    expect((await db.query("select count(*)::int as n from courier_terms_acceptances")).rows[0]).toEqual({ n: 1 });
  });

  it("el estado del propio repartidor dice versión y fecha", async () => {
    const before = await call(UNO_USER, "select public.courier_terms_status() as s");
    expect(before.ok && before.rows[0].s).toMatchObject({ required: true, version: 1, accepted: false });

    await accept(UNO_USER);
    const after = await call(UNO_USER, "select public.courier_terms_status() as s");
    const s = after.ok ? (after.rows[0].s as Record<string, unknown>) : {};
    expect(s).toMatchObject({ required: true, version: 1, accepted: true, accepted_version: 1 });
    expect(typeof s.accepted_at).toBe("string");
  });
});

describe("sin aceptar no ve ni toma ni oferta — ENVIO-182", () => {
  it("no ve los pedidos disponibles; después de aceptar, sí", async () => {
    const id = await envio();

    expect(await available(UNO_USER)).toEqual([]);
    await accept(UNO_USER);
    expect((await available(UNO_USER)).map((o) => o.id)).toContain(id);
    // El otro, que no aceptó, sigue sin verlo.
    expect(await available(DOS_USER)).toEqual([]);
  });

  it("no puede tomarlo (P0025); después de aceptar, sí", async () => {
    const id = await envio();

    const sin = await take(UNO_USER, id);
    expect(!sin.ok && sin.code).toBe("P0025");

    await accept(UNO_USER);
    const con = await take(UNO_USER, id);
    expect(con.ok).toBe(true);
  });

  it("no puede ofertar (P0025); después de aceptar, sí", async () => {
    await db.exec("update platform_settings set delivery_mode = 'offers'");
    const id = await envio();

    const sin = await offer(db, UNO_USER, id);
    expect(!sin.ok && sin.code).toBe("P0025");

    await accept(UNO_USER);
    const con = await offer(db, UNO_USER, id);
    expect(con.ok).toBe(true);
  });

  it("subir la versión vuelve a bloquear hasta que acepte la nueva", async () => {
    const id = await envio();
    await accept(UNO_USER);
    expect((await available(UNO_USER)).map((o) => o.id)).toContain(id);

    await db.exec("update platform_settings set courier_terms_version = 2");
    expect(await available(UNO_USER)).toEqual([]);
    const viejo = await accept(UNO_USER, 1);
    expect(!viejo.ok && viejo.code).toBe("22023");

    await accept(UNO_USER, 2);
    expect((await available(UNO_USER)).map((o) => o.id)).toContain(id);
    // Las dos aceptaciones quedan: la primera sigue siendo prueba.
    expect((await db.query("select count(*)::int as n from courier_terms_acceptances")).rows[0]).toEqual({ n: 2 });
  });

  it("con el interruptor apagado no bloquea nada", async () => {
    await setRequired(false);
    const id = await envio();

    expect((await available(UNO_USER)).map((o) => o.id)).toContain(id);
    const tomado = await take(UNO_USER, id);
    expect(tomado.ok).toBe(true);

    const status = await call(DOS_USER, "select public.courier_terms_status() as s");
    expect(status.ok && status.rows[0].s).toMatchObject({ required: false, accepted: false });
  });
});
