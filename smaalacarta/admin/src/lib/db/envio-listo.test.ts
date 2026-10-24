// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigration, asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer } from "@/test/offers";
// ENVIO-128 a 134 y 254 contra Postgres real: el envío queda listo al activarlo y el favorito es solo el que elige el local.
const OZ = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña de un negocio al que se le activa el envío después
const TOQUE_USER = "cccccccc-0000-0000-0000-000000000003";
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006";
const NEG_OZ = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_VIEJO = "b2b2b2b2-0000-0000-0000-000000000002"; // ya tenía zonas tildadas
const NEG_SIN_AJUSTES = "c3c3c3c3-0000-0000-0000-000000000003"; // sin fila en business_settings
const TOQUE = "7a0c0e00-0000-4000-8000-000000000001";
const MOTO = "7a0c0e00-0000-4000-8000-000000000002";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const count = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);
const zonesOf = (business: string) =>
  count(`select count(*) as n from business_delivery_zones where business_id = '${business}'`);
const activeZones = () => count("select count(*) as n from delivery_zones where active");

async function effective(business: string) {
  return (await db.query<{ f: string | null }>(`select public.effective_favorite_courier('${business}') as f`)).rows[0].f;
}

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

// Un pedido con envío de Oz, ya confirmado: la búsqueda está abierta.
async function searching() {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
  const r = await call(
    null,
    `select public.create_public_order('oz', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${await zoneId("Cantera")}'::uuid,
       p_customer_phone => '3515551234', p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(r.error);
  const code = (r.rows[0].result as { code: string }).code;
  const id = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0].id;
  const c = await call(OZ, `select public.set_order_status('${id}', 'confirmed')`);
  if (!c.ok) throw new Error(c.error);
  return { id, code };
}

async function delivery(code: string) {
  const r = await call(null, `select public.public_order_delivery('${code}') as d`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].d as { ofertas?: { repartidor: string; precio: number; favorito: boolean }[] };
}

async function winner(orderId: string) {
  return (await db.query<{ courier_id: string | null }>("select courier_id from orders where id = $1", [orderId]))
    .rows[0].courier_id;
}

const age = (orderId: string) =>
  db.exec(`
    update courier_offers set created_at = created_at - interval '6 minutes' where order_id = '${orderId}';
    update orders set offered_at = offered_at - interval '6 minutes' where id = '${orderId}';
  `);

const setFavorite = (courier: string | null) =>
  db.exec(`update business_settings set favorite_courier_id = ${courier ? `'${courier}'` : "null"}
             where business_id = '${NEG_OZ}'`);

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: OZ, email: "oz@x.com" });
  await createUser(db, { id: TOQUE_USER, email: "toque@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_OZ}', 'Oz', 'oz', '5493510000001', true, false),
      ('${NEG_VIEJO}', 'Viejo', 'viejo', '5493510000002', true, false),
      ('${NEG_SIN_AJUSTES}', 'Sin ajustes', 'sin-ajustes', '5493510000003', true, false);
    insert into business_users (business_id, user_id) values ('${NEG_OZ}', '${OZ}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_OZ}', true, 'San Martín 100'), ('${NEG_VIEJO}', true, null);
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_OZ}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_OZ}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);

    insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${TOQUE_USER}');
    insert into couriers (id, name, whatsapp, active) values ('${MOTO}', 'Moto Express', '5493510000099', true);
    insert into courier_users (courier_id, user_id) values ('${MOTO}', '${MOTO_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${MOTO}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera');

    -- Viejo ya tenía dos zonas tildadas antes de activar el envío.
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_VIEJO}', id from delivery_zones where name in ('Cantera', 'Oasis');
  `);
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  // El freno de 20 pedidos por minuto.
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

describe("zonas al activar el envío — ENVIO-128", () => {
  it("activar el envío a un local sin zonas le carga todas las activas", async () => {
    expect(await zonesOf(NEG_OZ)).toBe(0);

    await db.exec(`update businesses set courier_delivery = true where id = '${NEG_OZ}'`);

    const total = await activeZones();
    expect(total).toBeGreaterThan(0);
    expect(await zonesOf(NEG_OZ)).toBe(total);
  });

  it("un local que ya tenía zonas no se toca", async () => {
    await db.exec(`update businesses set courier_delivery = true where id = '${NEG_VIEJO}'`);

    expect(await zonesOf(NEG_VIEJO)).toBe(2);
  });

  it("un negocio que nace con el envío activo también las recibe", async () => {
    await db.exec(`insert into businesses (id, name, slug, whatsapp, courier_delivery)
                   values ('e5e5e5e5-0000-0000-0000-000000000005', 'Nuevo', 'nuevo', '5493510000005', true)`);

    expect(await zonesOf("e5e5e5e5-0000-0000-0000-000000000005")).toBe(await activeZones());
  });

  it("desactivar y volver a activar no pisa lo que el local tildó", async () => {
    await db.exec(`
      update businesses set courier_delivery = false where id = '${NEG_OZ}';
      delete from business_delivery_zones where business_id = '${NEG_OZ}' and zone_id <> '${await zoneId("Cantera")}';
      update businesses set courier_delivery = true where id = '${NEG_OZ}';
    `);

    expect(await zonesOf(NEG_OZ)).toBe(1);

    // Para los pedidos que siguen: Oz vuelve a enviar a todas.
    await db.exec(`insert into business_delivery_zones (business_id, zone_id)
                   select '${NEG_OZ}', id from delivery_zones where active on conflict do nothing`);
  });

  it("no carga las zonas inactivas", async () => {
    await db.exec(`
      update delivery_zones set active = false where name = 'Oasis';
      update businesses set courier_delivery = true where id = '${NEG_SIN_AJUSTES}';
    `);

    expect(await zonesOf(NEG_SIN_AJUSTES)).toBe(await activeZones());
    expect(
      await count(`select count(*) as n from business_delivery_zones bz join delivery_zones z on z.id = bz.zone_id
                   where bz.business_id = '${NEG_SIN_AJUSTES}' and not z.active`),
    ).toBe(0);

    await db.exec("update delivery_zones set active = true where name = 'Oasis'");
  });
});

describe("corrección de los que ya estaban mal — ENVIO-129", () => {
  it("los negocios con envío activo y cero zonas reciben todas las activas; el resto no cambia", async () => {
    const old = await createTestDb({ before: "20261028000000_envio_listo_al_activar.sql" });

    try {
      await old.exec(`
        insert into businesses (id, name, slug, whatsapp, courier_delivery) values
          ('${NEG_OZ}', 'Oz', 'oz', '5493510000001', true),
          ('${NEG_VIEJO}', 'Viejo', 'viejo', '5493510000002', true),
          ('${NEG_SIN_AJUSTES}', 'Apagado', 'apagado', '5493510000003', false);
        insert into business_delivery_zones (business_id, zone_id)
          select '${NEG_VIEJO}', id from delivery_zones where name = 'Cantera';
      `);

      await applyMigration(old, "20261028000000_envio_listo_al_activar.sql");

      const n = async (business: string) =>
        Number(
          (
            await old.query<{ n: string }>(
              `select count(*) as n from business_delivery_zones where business_id = '${business}'`,
            )
          ).rows[0].n,
        );
      const total = Number(
        (await old.query<{ n: string }>("select count(*) as n from delivery_zones where active")).rows[0].n,
      );

      expect(await n(NEG_OZ)).toBe(total);
      expect(await n(NEG_VIEJO)).toBe(1);
      expect(await n(NEG_SIN_AJUSTES)).toBe(0);
    } finally {
      await old.close();
    }
  }, 60_000);
});

describe("sin favorito por defecto — ENVIO-254", () => {
  it("default_courier_id() ya no existe", async () => {
    const r = await db.query<{ n: string }>(
      "select count(*) as n from pg_proc where proname = 'default_courier_id'",
    );
    expect(Number(r.rows[0].n)).toBe(0);
  });

  it("sin favorito elegido no hay favorito, aunque Repartos al Toque esté activo", async () => {
    expect(await effective(NEG_OZ)).toBeNull();
    expect(await effective(NEG_SIN_AJUSTES)).toBeNull();
  });

  it("con un favorito elegido, vale el del local", async () => {
    await setFavorite(MOTO);
    expect(await effective(NEG_OZ)).toBe(MOTO);
    await setFavorite(null);
  });

  it("sin favorito, ninguna oferta sale marcada y se ordenan por precio", async () => {
    const o = await searching();
    expect((await offer(db, MOTO_USER, o.id, 4000, "Cerca")).ok).toBe(true);
    expect((await offer(db, TOQUE_USER, o.id)).ok).toBe(true);

    const ofertas = (await delivery(o.code)).ofertas!;
    expect(ofertas.map((f) => [f.repartidor, f.favorito])).toEqual([
      ["Moto Express", false],
      ["Repartos al Toque", false],
    ]);

    // El local ve lo mismo en su panel.
    const panel = await call(OZ, "select public.business_order_offers() as l");
    expect(panel.ok).toBe(true);
    if (panel.ok) {
      const lista = panel.rows[0].l as { order_id: string; ofertas: { repartidor: string; favorito: boolean }[] }[];
      const mia = lista.find((p) => p.order_id === o.id)!;
      expect(mia.ofertas.map((f) => [f.repartidor, f.favorito])).toEqual([
        ["Moto Express", false],
        ["Repartos al Toque", false],
      ]);
    }
  });

  it("a igual precio y sin favorito, gana la oferta más vieja", async () => {
    const o = await searching();
    await offer(db, MOTO_USER, o.id);
    await db.exec(
      `update courier_offers set created_at = created_at - interval '10 seconds' where order_id = '${o.id}'`,
    );
    await offer(db, TOQUE_USER, o.id);
    await age(o.id);

    await delivery(o.code);
    expect(await winner(o.id)).toBe(MOTO);
  });

  it("con un favorito elegido, vale ese: orden, marca y desempate", async () => {
    await setFavorite(MOTO);
    const o = await searching();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id);

    const ofertas = (await delivery(o.code)).ofertas!;
    expect(ofertas.map((f) => [f.repartidor, f.favorito])).toEqual([
      ["Moto Express", true],
      ["Repartos al Toque", false],
    ]);

    await age(o.id);
    await delivery(o.code);
    expect(await winner(o.id)).toBe(MOTO);
    await setFavorite(null);
  });
});

describe("business_delivery_options — ENVIO-134 y 254", () => {
  it("entrega solo el favorito elegido: sin elegir, favorite_id es nulo y no hay repartidor por defecto", async () => {
    const r = await call(OZ, "select public.business_delivery_options() as o");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const o = r.rows[0].o as Record<string, unknown>;
    expect(o.favorite_id).toBeNull();
    expect("default_courier" in o).toBe(false);
  });
});
