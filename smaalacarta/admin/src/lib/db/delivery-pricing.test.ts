// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer, openSearch } from "@/test/offers";

// ENVIO-219 a 228 contra Postgres real: tipo de precio del envío por negocio.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña del negocio con precios
const OTRA = "aaaaaaaa-0000-0000-0000-000000000002"; // dueña de otro negocio
const SUPER = "dddddddd-0000-0000-0000-000000000004";
const REPA_USER = "cccccccc-0000-0000-0000-000000000003"; // usuario del repartidor propio
const OTRO_USER = "cccccccc-0000-0000-0000-000000000004"; // usuario de otro repartidor
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_OTRA = "a1a1a1a1-0000-0000-0000-000000000002";
const PROPIO = "7a0c0e00-0000-4000-8000-000000000010";
const OTRO = "7a0c0e00-0000-4000-8000-000000000011";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;
let cantera: string;
let centro: string;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const business = (sql: string) => db.exec(`update businesses set ${sql} where id = '${NEG_ANA}'`);

async function zones(slug = "ana") {
  const r = await call(null, `select public.public_delivery_zones('${slug}') as z`);
  if (!r.ok) throw new Error(r.error);
  const z = r.rows[0].z as { zonas: { id: string; nombre: string; precio: number; fijo: boolean }[] } | null;
  return z?.zonas ?? null;
}

async function envio(zone: string) {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${zone}'::uuid, p_customer_phone => '3515551234',
       p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) return r;
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  await openSearch(db, o.id);
  return { ...r, id: o.id };
}

const listed = async (user: string) => {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0].l as { id: string }[]).map((o) => o.id);
};

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "offers" });

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: OTRA, email: "otra@x.com" });
  await createUser(db, { id: SUPER, email: "super@x.com" });
  await createUser(db, { id: REPA_USER, email: "repa@x.com" });
  await createUser(db, { id: OTRO_USER, email: "otro@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_OTRA}', 'Otra Resto', 'otra', '5493510000002', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}'), ('${NEG_OTRA}', '${OTRA}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_ANA}', true, 'San Martín 100'), ('${NEG_OTRA}', true, 'Belgrano 200');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into couriers (id, name, whatsapp, active) values
      ('${PROPIO}', 'Propio', '5493510000099', true),
      ('${OTRO}', 'Otro', '5493510000098', true);
    insert into courier_users (courier_id, user_id) values ('${PROPIO}', '${REPA_USER}'), ('${OTRO}', '${OTRO_USER}');
    delete from business_delivery_zones;
    delete from courier_zone_coverage;
    insert into courier_zone_coverage (courier_id, zone_id)
      select c, id from delivery_zones, (values ('${PROPIO}'::uuid), ('${OTRO}'::uuid)) v(c)
      where name in ('Cantera', 'Centro (hasta Av. Koessler)');
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name in ('Cantera', 'Centro (hasta Av. Koessler)');
  `);
  cantera = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
  centro = (
    await db.query<{ id: string }>("select id from delivery_zones where name = 'Centro (hasta Av. Koessler)'")
  ).rows[0].id;
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    update businesses set delivery_pricing = 'common', delivery_prices_editable = false,
      delivery_offers_enabled = true where id in ('${NEG_ANA}', '${NEG_OTRA}');
    update business_settings set favorite_courier_id = null;
    update couriers set can_edit_zones = false, active = true;
    delete from business_zone_prices;
    delete from courier_own_zones;
    update platform_settings set delivery_mode = 'offers';
  `);
});

afterAll(async () => {
  await db.close();
});

const own = (courier: string, name: string, price: number, extra = "") =>
  db.exec(
    `insert into courier_own_zones (courier_id, name, price, sort_order) values ('${courier}', '${name}', ${price}, 0)${extra}`,
  );

async function commonPrice(id: string) {
  return Number((await db.query<{ price: string }>("select price from delivery_zones where id = $1", [id])).rows[0].price);
}

describe("los tres tipos de precio — ENVIO-219 y 222", () => {
  it("común (por defecto): las zonas comunes con su precio de referencia", async () => {
    const z = await zones();
    expect(z?.map((x) => x.id).sort()).toEqual([cantera, centro].sort());
    expect(z?.find((x) => x.id === cantera)?.precio).toBe(await commonPrice(cantera));
  });

  it("del negocio: las mismas zonas con el precio del negocio; si falta la fila, el común", async () => {
    await business("delivery_pricing = 'business'");
    await db.exec(`insert into business_zone_prices (business_id, zone_id, price) values ('${NEG_ANA}', '${cantera}', 777)`);

    const z = await zones();
    expect(z?.find((x) => x.id === cantera)?.precio).toBe(777);
    expect(z?.find((x) => x.id === centro)?.precio).toBe(await commonPrice(centro));
  });

  it("del repartidor: las zonas propias del favorito, no las comunes", async () => {
    await business("delivery_pricing = 'courier'");
    await db.exec(`update business_settings set favorite_courier_id = '${PROPIO}' where business_id = '${NEG_ANA}'`);
    await own(PROPIO, "Barrio Norte", 1500);
    await own(PROPIO, "Barrio Sur", 2500, "");
    await own(OTRO, "Zona del otro", 999);
    await db.exec("update courier_own_zones set active = false where name = 'Barrio Sur'");

    const z = await zones();
    expect(z?.map((x) => [x.nombre, x.precio])).toEqual([["Barrio Norte", 1500]]);
  });

  it("del repartidor sin favorito activo: el negocio no ofrece envío", async () => {
    await business("delivery_pricing = 'courier'");
    await db.exec(`update business_settings set favorite_courier_id = '${PROPIO}' where business_id = '${NEG_ANA}'`);
    await own(PROPIO, "Barrio Norte", 1500);
    await db.exec(`update couriers set active = false where id = '${PROPIO}'`);

    expect(await zones()).toBeNull();
  });

  it("del repartidor sin zonas propias: no ofrece envío", async () => {
    await business("delivery_pricing = 'courier'");
    await db.exec(`update business_settings set favorite_courier_id = '${PROPIO}' where business_id = '${NEG_ANA}'`);
    expect(await zones()).toBeNull();
  });
});

describe("precio fijo o aproximado — ENVIO-223", () => {
  it("en modo ofertas con las ofertas con otro precio prendidas, es aproximado", async () => {
    expect((await zones())?.every((x) => x.fijo === false)).toBe(true);
  });

  it("apagando las ofertas con otro precio, es fijo", async () => {
    await business("delivery_offers_enabled = false");
    expect((await zones())?.every((x) => x.fijo === true)).toBe(true);
  });

  it("en modo fijo de la plataforma, es fijo como hasta ahora", async () => {
    await db.exec("update platform_settings set delivery_mode = 'fixed'");
    expect((await zones())?.every((x) => x.fijo === true)).toBe(true);
  });
});

describe("el pedido guarda la zona y el precio del tipo vigente — ENVIO-224 y 225", () => {
  it("del negocio: el precio de lista es el del negocio", async () => {
    await business("delivery_pricing = 'business'");
    await db.exec(`insert into business_zone_prices (business_id, zone_id, price) values ('${NEG_ANA}', '${cantera}', 777)`);

    const r = await envio(cantera);
    expect(r.ok).toBe(true);
    const o = (
      await db.query<{ fee: string; zone: string | null }>(
        "select delivery_fee_list as fee, delivery_zone_id as zone from orders where id = $1",
        [(r as { id: string }).id],
      )
    ).rows[0];
    expect(Number(o.fee)).toBe(777);
    expect(o.zone).toBe(cantera);
  });

  it("del repartidor: guarda su zona y precio, y solo él lo ve", async () => {
    await business("delivery_pricing = 'courier'");
    await db.exec(`update business_settings set favorite_courier_id = '${PROPIO}' where business_id = '${NEG_ANA}'`);
    await own(PROPIO, "Barrio Norte", 1500);
    const zone = (await zones())![0].id;

    const r = await envio(zone);
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    const o = (
      await db.query<{ fee: string; name: string; common: string | null; own: string | null }>(
        "select delivery_fee_list as fee, delivery_zone_name as name, delivery_zone_id as common, courier_zone_id as own from orders where id = $1",
        [id],
      )
    ).rows[0];
    expect(Number(o.fee)).toBe(1500);
    expect(o.name).toBe("Barrio Norte");
    expect(o.common).toBeNull();
    expect(o.own).toBe(zone);

    expect(await listed(REPA_USER)).toContain(id);
    expect(await listed(OTRO_USER)).not.toContain(id);
    expect((await offer(db, REPA_USER, id)).ok).toBe(true);
    expect((await offer(db, OTRO_USER, id)).ok).toBe(false);
  });

  it("un barrio de otro tipo o de otro repartidor se rechaza", async () => {
    await business("delivery_pricing = 'courier'");
    await db.exec(`update business_settings set favorite_courier_id = '${PROPIO}' where business_id = '${NEG_ANA}'`);
    await own(PROPIO, "Barrio Norte", 1500);

    const comun = await envio(cantera);
    expect(comun.ok).toBe(false);
    expect(!comun.ok && comun.code).toBe("P0016");
  });
});

describe("ofertas con otro precio — ENVIO-226", () => {
  it("apagadas: una oferta distinta se rechaza y la de lista se acepta", async () => {
    await business("delivery_offers_enabled = false");
    const r = await envio(cantera);
    const id = (r as { id: string }).id;

    const distinta = await offer(db, REPA_USER, id, 99999, "Hay lluvia");
    expect(!distinta.ok && distinta.code).toBe("P0028");
    expect((await offer(db, REPA_USER, id)).ok).toBe(true);
  });

  it("prendidas: la oferta distinta con motivo se acepta", async () => {
    const r = await envio(cantera);
    const id = (r as { id: string }).id;
    expect((await offer(db, REPA_USER, id, 99999, "Hay lluvia")).ok).toBe(true);
  });
});

describe("permisos de edición — ENVIO-220 y 221", () => {
  const setPrice = (user: string, business: string, price: number) =>
    call(
      user,
      `insert into business_zone_prices (business_id, zone_id, price) values ('${business}', '${cantera}', ${price})
       on conflict (business_id, zone_id) do update set price = excluded.price`,
    );

  it("el negocio edita sus precios solo con tipo del negocio y permiso", async () => {
    await business("delivery_pricing = 'business'");
    expect((await setPrice(ANA, NEG_ANA, 500)).ok).toBe(false);

    await business("delivery_prices_editable = true");
    expect((await setPrice(ANA, NEG_ANA, 500)).ok).toBe(true);

    await business("delivery_pricing = 'common'");
    expect((await setPrice(ANA, NEG_ANA, 600)).ok).toBe(false);
  });

  it("un negocio no escribe ni lee los precios de otro; el superadmin sí", async () => {
    await business("delivery_pricing = 'business', delivery_prices_editable = true");
    await db.exec(`update businesses set delivery_pricing = 'business', delivery_prices_editable = true where id = '${NEG_OTRA}'`);
    await db.exec(`insert into business_zone_prices (business_id, zone_id, price) values ('${NEG_ANA}', '${cantera}', 500)`);

    expect((await setPrice(OTRA, NEG_ANA, 1)).ok).toBe(false);
    const visto = await call(OTRA, `select * from business_zone_prices where business_id = '${NEG_ANA}'`);
    expect(visto.ok && visto.rows).toEqual([]);

    expect((await setPrice(SUPER, NEG_ANA, 800)).ok).toBe(true);
  });

  it("el negocio no se da a sí mismo el permiso ni cambia el tipo", async () => {
    const r = await call(ANA, `update businesses set delivery_prices_editable = true where id = '${NEG_ANA}'`);
    expect(r.ok).toBe(false);
    const t = await call(ANA, `update businesses set delivery_pricing = 'business' where id = '${NEG_ANA}'`);
    expect(t.ok).toBe(false);
    const o = await call(ANA, `update businesses set delivery_offers_enabled = false where id = '${NEG_ANA}'`);
    expect(o.ok).toBe(false);
    expect((await call(SUPER, `update businesses set delivery_pricing = 'business' where id = '${NEG_ANA}'`)).ok).toBe(true);
  });

  const addZone = (user: string, courier: string, name: string) =>
    call(user, `insert into courier_own_zones (courier_id, name, price) values ('${courier}', '${name}', 100)`);

  it("el repartidor edita sus zonas solo con permiso", async () => {
    expect((await addZone(REPA_USER, PROPIO, "Sin permiso")).ok).toBe(false);

    await db.exec(`update couriers set can_edit_zones = true where id = '${PROPIO}'`);
    expect((await addZone(REPA_USER, PROPIO, "Con permiso")).ok).toBe(true);
    const upd = await call(REPA_USER, "update courier_own_zones set price = 250 where name = 'Con permiso'");
    expect(upd.ok && upd.affected).toBe(1);
    const del = await call(REPA_USER, "delete from courier_own_zones where name = 'Con permiso'");
    expect(del.ok && del.affected).toBe(1);
  });

  it("el repartidor no ve ni edita las zonas de otro; el superadmin sí", async () => {
    await db.exec(`update couriers set can_edit_zones = true`);
    await own(OTRO, "Zona del otro", 300);

    const visto = await call(REPA_USER, "select name from courier_own_zones");
    expect(visto.ok && visto.rows).toEqual([]);
    expect((await addZone(REPA_USER, OTRO, "Intruso")).ok).toBe(false);
    const upd = await call(REPA_USER, "update courier_own_zones set price = 1 where name = 'Zona del otro'");
    expect(upd.ok && upd.affected).toBe(0);
    const del = await call(REPA_USER, "delete from courier_own_zones where name = 'Zona del otro'");
    expect(del.ok && del.affected).toBe(0);

    const todo = await call(SUPER, "select name from courier_own_zones");
    expect(todo.ok && todo.rows.length).toBe(1);
  });

  it("el repartidor no se da a sí mismo el permiso; el público no lee las zonas propias", async () => {
    const r = await call(REPA_USER, `update couriers set can_edit_zones = true where id = '${PROPIO}'`);
    expect(r.ok && r.affected).toBe(0);
    await own(PROPIO, "Barrio Norte", 1500);
    const anon = await call(null, "select * from courier_own_zones");
    expect(anon.ok && anon.rows).toEqual([]);
  });
});

describe("lo que ve el panel — ENVIO-227", () => {
  it("business_delivery_pricing: el local ve el favorito y sus zonas; otro negocio, no", async () => {
    await business("delivery_pricing = 'courier'");
    await db.exec(`update business_settings set favorite_courier_id = '${PROPIO}' where business_id = '${NEG_ANA}'`);
    await own(PROPIO, "Barrio Norte", 1500);

    const r = await call(ANA, `select public.business_delivery_pricing('${NEG_ANA}') as p`);
    expect(r.ok).toBe(true);
    const p = (r as { rows: { p: { pricing: string; courier: { id: string; zones: number }; courier_zones: unknown[] } }[] })
      .rows[0].p;
    expect(p.pricing).toBe("courier");
    expect(p.courier.id).toBe(PROPIO);
    expect(p.courier.zones).toBe(1);
    expect(p.courier_zones).toHaveLength(1);

    expect((await call(OTRA, `select public.business_delivery_pricing('${NEG_ANA}')`)).ok).toBe(false);
    expect((await call(SUPER, `select public.business_delivery_pricing('${NEG_ANA}')`)).ok).toBe(true);
  });
});
