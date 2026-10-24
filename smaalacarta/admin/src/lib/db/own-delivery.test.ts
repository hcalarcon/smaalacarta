// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigration, asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer } from "@/test/offers";

// ENVIO-245 a 257 contra Postgres real: envío propio del negocio (tarea 54).
const PRO = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña del negocio con envío propio
const LIB = "aaaaaaaa-0000-0000-0000-000000000002"; // dueño del negocio con envío libre
const SUPER = "dddddddd-0000-0000-0000-000000000004";
const REPA_P_USER = "cccccccc-0000-0000-0000-000000000003"; // usuario del repartidor propio
const REPA_L_USER = "cccccccc-0000-0000-0000-000000000004"; // usuario del repartidor libre
const NEG_P = "a1a1a1a1-0000-0000-0000-000000000001"; // envío propio
const NEG_L = "a1a1a1a1-0000-0000-0000-000000000002"; // envío libre
const NEG_Q = "a1a1a1a1-0000-0000-0000-000000000003"; // otro negocio propio, sin repartidor
const REPA_P = "7a0c0e00-0000-4000-8000-000000000010"; // propio de NEG_P
const REPA_L = "7a0c0e00-0000-4000-8000-000000000011"; // libre
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;
let cantera: string;
let centro: string;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const count = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

type Zones = { zonas: { id: string; nombre: string; precio: number; fijo: boolean }[]; coordinar: boolean; propio: boolean };

async function zones(slug: string): Promise<Zones | null> {
  const r = await call(null, `select public.public_delivery_zones('${slug}') as z`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].z as Zones | null;
}

type Opts = { zone?: string | null; text?: string | null; address?: string; delivery?: string };

async function order(slug: string, opts: Opts = {}) {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
  const r = await call(
    null,
    `select public.create_public_order('${slug}', 'Cliente', '${opts.delivery ?? "delivery"}', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => ${opts.zone ? `'${opts.zone}'::uuid` : "null"},
       p_customer_phone => '3515551234', p_delivery_address => '${opts.address ?? "Av. Siempre Viva 742"}',
       p_delivery_zone_text => ${opts.text ? `'${opts.text}'` : "null"}) as result`,
  );
  if (!r.ok) return r;
  const result = r.rows[0].result as { code: string; delivery_fee?: number | null };
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [result.code])).rows[0];
  return { ...r, id: o.id, code: result.code, result };
}

async function placed(slug: string, opts: Opts = {}) {
  const r = await order(slug, opts);
  if (!r.ok) throw new Error(r.error);
  return r as Extract<typeof r, { id: string }>;
}

const confirm = (user: string, id: string) => call(user, `select public.set_order_status('${id}', 'confirmed')`);

async function row(id: string) {
  return (
    await db.query<{
      courier_id: string | null;
      courier_status: string | null;
      delivery_fee: string | null;
      delivery_fee_list: string | null;
      delivery_fee_coordinated: boolean;
      delivery_zone_id: string | null;
      own_zone_id: string | null;
      delivery_zone_name: string | null;
    }>(
      `select courier_id, courier_status, delivery_fee, delivery_fee_list, delivery_fee_coordinated, delivery_zone_id,
              own_zone_id, delivery_zone_name from orders where id = $1`,
      [id],
    )
  ).rows[0];
}

const available = async (user: string) => {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0].l as { id: string }[]).map((o) => o.id);
};

const mine = async (user: string) => {
  const r = await call(user, "select public.courier_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].l as { id: string; envio: { precio: number | null; precio_pendiente: boolean } }[];
};

async function delivery(code: string) {
  const r = await call(null, `select public.public_order_delivery('${code}') as d`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].d as Record<string, unknown>;
}

const business = (id: string, sql: string) => db.exec(`update businesses set ${sql} where id = '${id}'`);

async function ownZone(business_id: string, name: string, price: number | null, extra = "") {
  await db.exec(
    `insert into business_own_zones (business_id, name, price${extra ? ", " + extra.split("=")[0] : ""})
     values ('${business_id}', '${name}', ${price ?? "null"}${extra ? ", " + extra.split("=")[1] : ""})`,
  );
}

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "offers" });

  await createUser(db, { id: PRO, email: "pro@x.com" });
  await createUser(db, { id: LIB, email: "lib@x.com" });
  await createUser(db, { id: SUPER, email: "super@x.com" });
  await createUser(db, { id: REPA_P_USER, email: "repap@x.com" });
  await createUser(db, { id: REPA_L_USER, email: "repal@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery, delivery_type) values
      ('${NEG_P}', 'Propio Resto', 'propio', '5493510000001', true, true, 'own'),
      ('${NEG_L}', 'Libre Resto', 'libre', '5493510000002', true, true, 'free'),
      ('${NEG_Q}', 'Otro Propio', 'otropropio', '5493510000003', true, true, 'own');
    insert into business_users (business_id, user_id) values ('${NEG_P}', '${PRO}'), ('${NEG_L}', '${LIB}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_P}', true, 'San Martín 100'), ('${NEG_L}', true, 'Belgrano 200'), ('${NEG_Q}', true, 'Mitre 300');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_P}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_P}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into couriers (id, name, whatsapp, active, courier_type, own_business_id) values
      ('${REPA_P}', 'Repartidor Propio', '5493510000099', true, 'own', '${NEG_P}'),
      ('${REPA_L}', 'Repartidor Libre', '5493510000098', true, 'free', null);
    insert into courier_users (courier_id, user_id) values ('${REPA_P}', '${REPA_P_USER}'), ('${REPA_L}', '${REPA_L_USER}');
    delete from business_delivery_zones;
    delete from courier_zone_coverage;
    -- El repartidor propio también cubre zonas comunes: no cuenta en la red libre.
    insert into courier_zone_coverage (courier_id, zone_id)
      select c, id from delivery_zones, (values ('${REPA_P}'::uuid), ('${REPA_L}'::uuid)) v(c)
      where name in ('Cantera', 'Centro (hasta Av. Koessler)');
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_L}', id from delivery_zones where name in ('Cantera', 'Centro (hasta Av. Koessler)');
  `);
  // El negocio propio también tiene un negocio libre en la misma zona común; los productos son del propio, así que el
  // libre también necesita un producto para los pedidos.
  await db.exec(`
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000002', '${NEG_L}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('d1000000-0000-0000-0000-000000000002', '${NEG_L}', 'c1000000-0000-0000-0000-000000000002', 'Café', 1000, true);
  `);
  cantera = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
  centro = (
    await db.query<{ id: string }>("select id from delivery_zones where name = 'Centro (hasta Av. Koessler)'")
  ).rows[0].id;
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    delete from orders;
    delete from business_own_zones;
    update businesses set delivery_type = 'own' where id in ('${NEG_P}', '${NEG_Q}');
    update businesses set delivery_type = 'free', courier_delivery = true where id = '${NEG_L}';
    update business_settings set delivery_options = array['delivery', 'retiro'], favorite_courier_id = null;
    update couriers set active = true where id in ('${REPA_P}', '${REPA_L}');
  `);
});

afterAll(async () => {
  await db.close();
});

// Cada negocio vende su propio café: el pedido del libre usa el producto de su carta.
const CAFE_L = "d1000000-0000-0000-0000-000000000002";
async function orderLibre(opts: Opts = {}) {
  const items = JSON.stringify([{ id: CAFE_L, kind: "product", quantity: 1 }]);
  const r = await call(
    null,
    `select public.create_public_order('libre', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => ${opts.zone ? `'${opts.zone}'::uuid` : "null"},
       p_customer_phone => '3515551234', p_delivery_address => 'Av. Siempre Viva 742',
       p_delivery_zone_text => ${opts.text ? `'${opts.text}'` : "null"}) as result`,
  );
  if (!r.ok) return r;
  const result = r.rows[0].result as { code: string };
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [result.code])).rows[0];
  return { ...r, id: o.id, code: result.code };
}

describe("zonas según el tipo de envío — ENVIO-248 y 249", () => {
  it("libre: las zonas comunes tildadas y cubiertas, sin coordinar", async () => {
    const z = await zones("libre");
    expect(z?.propio).toBe(false);
    expect(z?.coordinar).toBe(false);
    expect(z?.zonas.map((x) => x.id).sort()).toEqual([cantera, centro].sort());
  });

  it("propio: arranca vacío y se ofrece a coordinar, no se copian las comunes", async () => {
    const z = await zones("propio");
    expect(z).toEqual({ zonas: [], coordinar: true, propio: true });
    expect(await count("select count(*) as n from business_own_zones")).toBe(0);
  });

  it("propio: sus zonas activas y con precio, siempre con precio fijo; una inactiva o sin precio no aparece", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    await ownZone(NEG_P, "Barrio Sur", 2000.5);
    await ownZone(NEG_P, "Sin precio", null);
    await ownZone(NEG_P, "Apagada", 900, "active=false");

    const z = await zones("propio");
    expect(z?.zonas.map((x) => [x.nombre, x.precio, x.fijo])).toEqual([
      ["Barrio Norte", 1500, true],
      ["Barrio Sur", 2000.5, true],
    ]);
    expect(z?.coordinar).toBe(true);
  });

  it("las zonas de un negocio propio no aparecen en otro, ni las comunes en el propio", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);

    expect((await zones("otropropio"))?.zonas).toEqual([]);
    expect((await zones("libre"))?.zonas.some((x) => x.nombre === "Barrio Norte")).toBe(false);
    expect((await zones("propio"))?.zonas.some((x) => [cantera, centro].includes(x.id))).toBe(false);
  });

  it("libre sin ninguna zona tildada se ofrece a coordinar; con zonas tildadas pero sin repartidor, no se ofrece", async () => {
    await db.exec(`delete from business_delivery_zones where business_id = '${NEG_L}'`);
    expect(await zones("libre")).toEqual({ zonas: [], coordinar: true, propio: false });

    await db.exec(`
      insert into business_delivery_zones (business_id, zone_id)
        select '${NEG_L}', id from delivery_zones where name = 'Oasis';
    `);
    expect(await zones("libre")).toBeNull();

    await db.exec(`
      delete from business_delivery_zones where business_id = '${NEG_L}';
      insert into business_delivery_zones (business_id, zone_id) values ('${NEG_L}', '${cantera}'), ('${NEG_L}', '${centro}');
    `);
  });

  it("el envío desactivado no se ofrece: sin zonas y el pedido se rechaza", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    await db.exec(`update business_settings set delivery_options = array['retiro'] where business_id = '${NEG_P}'`);

    expect(await zones("propio")).toBeNull();

    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;
    const r = await order("propio", { zone });
    expect(!r.ok && r.code).toBe("P0007");
  });

  it("sin courier_delivery tampoco se ofrece", async () => {
    await business(NEG_P, "courier_delivery = false");
    expect(await zones("propio")).toBeNull();
    await business(NEG_P, "courier_delivery = true");
  });
});

describe("pedido directo al repartidor propio — ENVIO-250 y 251", () => {
  it("nace esperando; al confirmarlo va directo a su repartidor propio, con el precio de la zona y sin ofertas", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;

    const o = await placed("propio", { zone });
    expect(num(o.result.delivery_fee)).toBe(1500);
    expect(await row(o.id)).toMatchObject({
      courier_id: null,
      courier_status: "waiting",
      own_zone_id: zone,
      delivery_zone_id: null,
      delivery_zone_name: "Barrio Norte",
      delivery_fee_coordinated: false,
    });

    expect((await confirm(PRO, o.id)).ok).toBe(true);
    expect(await row(o.id)).toMatchObject({ courier_id: REPA_P, courier_status: "accepted", delivery_fee: "1500.00" });
    expect(await count(`select count(*) as n from courier_offers where order_id = '${o.id}'`)).toBe(0);

    const note = await db.query<{ note: string }>(
      `select note from order_events where order_id = '${o.id}' and kind = 'delivery'`,
    );
    expect(note.rows[0].note).toMatch(/^Envío asignado a Repartidor Propio, \d\d:\d\d$/);

    // Solo su repartidor propio lo ve; el libre no.
    expect((await mine(REPA_P_USER)).map((x) => x.id)).toEqual([o.id]);
    expect(await mine(REPA_L_USER)).toEqual([]);
    expect(await available(REPA_L_USER)).toEqual([]);
    expect(await available(REPA_P_USER)).toEqual([]);

    const d = await delivery(o.code);
    expect(d).toMatchObject({ estado: "accepted", repartidor: "Repartidor Propio", precio: 1500 });
  });

  it("sin repartidor propio activo, queda 'Lo llevo yo'", async () => {
    await ownZone(NEG_Q, "Barrio Q", 800);
    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;
    const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
    await db.exec(`
      insert into categories (id, business_id, name, active) values ('c1000000-0000-0000-0000-000000000003', '${NEG_Q}', 'B', true);
      insert into products (id, business_id, category_id, name, price, active)
        values ('d1000000-0000-0000-0000-000000000003', '${NEG_Q}', 'c1000000-0000-0000-0000-000000000003', 'Té', 500, true);
    `);
    void items;
    const itemsQ = JSON.stringify([{ id: "d1000000-0000-0000-0000-000000000003", kind: "product", quantity: 1 }]);
    const r = await call(
      null,
      `select public.create_public_order('otropropio', 'Cliente', 'delivery', 'efectivo', null, '${itemsQ}'::jsonb,
         p_delivery_zone => '${zone}'::uuid, p_customer_phone => '3515551234',
         p_delivery_address => 'Av. Siempre Viva 742') as result`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = (
      await db.query<{ id: string }>("select id from orders where code = $1", [
        (r.rows[0].result as { code: string }).code,
      ])
    ).rows[0].id;
    await db.exec(`update orders set status = 'confirmed' where id = '${id}'`);

    expect(await row(id)).toMatchObject({ courier_id: null, courier_status: "self", delivery_fee: "800.00" });
    expect(await available(REPA_L_USER)).toEqual([]);
    expect(await available(REPA_P_USER)).toEqual([]);
  });

  it("con el repartidor propio inactivo, también queda 'Lo llevo yo'", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;
    await db.exec(`update couriers set active = false where id = '${REPA_P}'`);

    const o = await placed("propio", { zone });
    await confirm(PRO, o.id);
    expect(await row(o.id)).toMatchObject({ courier_id: null, courier_status: "self" });
  });

  it("si el repartidor propio lo devuelve, no lo ve ningún libre: solo el local lo vuelve a asignar o lo lleva", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;
    const o = await placed("propio", { zone });
    await confirm(PRO, o.id);

    expect((await call(REPA_P_USER, `select public.courier_return_order('${o.id}', 'other', 'No llego')`)).ok).toBe(true);
    expect(await row(o.id)).toMatchObject({ courier_id: null, courier_status: "searching" });
    expect(await available(REPA_L_USER)).toEqual([]);
    expect(await available(REPA_P_USER)).toEqual([]);

    // Un libre no puede ofertar ni se le puede asignar.
    const oferta = await offer(db, REPA_L_USER, o.id);
    expect(!oferta.ok && oferta.code).toBe("P0020");
    const asignarLibre = await call(PRO, `select public.business_assign_courier('${o.id}', '${REPA_L}')`);
    expect(!asignarLibre.ok && asignarLibre.code).toBe("22023");

    // El local se lo vuelve a asignar a su repartidor propio.
    expect((await call(PRO, `select public.business_assign_courier('${o.id}', '${REPA_P}')`)).ok).toBe(true);
    expect(await row(o.id)).toMatchObject({ courier_id: REPA_P, courier_status: "accepted" });
  });

  it("o el local lo lleva él ('Lo llevo yo')", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;
    const o = await placed("propio", { zone });
    await confirm(PRO, o.id);
    await call(REPA_P_USER, `select public.courier_return_order('${o.id}', 'other', 'No llego')`);

    expect((await call(PRO, `select public.business_self_delivery('${o.id}')`)).ok).toBe(true);
    expect(await row(o.id)).toMatchObject({ courier_id: null, courier_status: "self" });
  });

  it("un repartidor propio no se puede asignar a un pedido de otro negocio", async () => {
    const z = await orderLibre({ zone: cantera });
    if (!z.ok) throw new Error(z.error);
    await confirm(LIB, z.id);
    expect(await row(z.id)).toMatchObject({ courier_status: "searching" });

    const r = await call(LIB, `select public.business_assign_courier('${z.id}', '${REPA_P}')`);
    expect(!r.ok && r.code).toBe("22023");
  });

  it("el repartidor propio no ve ni oferta pedidos de otro negocio, aunque cubra su zona", async () => {
    const z = await orderLibre({ zone: cantera });
    if (!z.ok) throw new Error(z.error);
    await confirm(LIB, z.id);

    expect(await available(REPA_L_USER)).toEqual([z.id]);
    expect(await available(REPA_P_USER)).toEqual([]);

    const oferta = await offer(db, REPA_P_USER, z.id);
    expect(!oferta.ok && oferta.code).toBe("P0020");
    expect((await offer(db, REPA_L_USER, z.id)).ok).toBe(true);

    const aud = (await db.query<{ a: string[] }>(`select public.order_pulse_audience('${z.id}') as a`)).rows[0].a;
    expect(aud).toContain(REPA_L);
    expect(aud).not.toContain(REPA_P);
  });

  it("un repartidor libre sigue funcionando con un negocio libre", async () => {
    const z = await orderLibre({ zone: cantera });
    if (!z.ok) throw new Error(z.error);
    await confirm(LIB, z.id);
    expect(await row(z.id)).toMatchObject({ courier_status: "searching", delivery_zone_id: cantera });
  });

  it("la disponibilidad de la red no cuenta a un negocio propio", async () => {
    await db.exec("update platform_settings set courier_availability_enabled = true");
    const own = await call(PRO, `select public.business_courier_availability('${NEG_P}') as a`);
    expect(own.ok && own.rows[0].a).toEqual({ enabled: false });
    const free = await call(LIB, `select public.business_courier_availability('${NEG_L}') as a`);
    expect(free.ok && (free.rows[0].a as { enabled: boolean }).enabled).toBe(true);
    await db.exec("update platform_settings set courier_availability_enabled = false");
  });

  it("el pedido manual de un negocio propio va a su repartidor propio, o lo lleva el local", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;
    const items = JSON.stringify([{ name: "Pizza", unit_price: 5000, quantity: 1 }]);

    const manual = async (mode: string | null) => {
      const r = await call(
        PRO,
        `select public.create_manual_order('${NEG_P}', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
           p_customer_phone => '3515551234', p_delivery_zone => '${zone}'::uuid,
           p_delivery_address => 'Av. Siempre Viva 742', p_courier_mode => ${mode ? `'${mode}'` : "null"}) as r`,
      );
      if (!r.ok) throw new Error(r.error);
      return (r.rows[0].r as { id: string }).id;
    };

    expect(await row(await manual("favorite"))).toMatchObject({ courier_id: REPA_P, courier_status: "accepted" });
    expect(await row(await manual(null))).toMatchObject({ courier_id: REPA_P, courier_status: "accepted" });
    expect(await row(await manual("self"))).toMatchObject({ courier_id: null, courier_status: "self" });
  });
});

describe("envío a coordinar — ENVIO-252 y 253", () => {
  it("propio sin zonas: el pedido entra con el barrio en texto y el precio pendiente, y el local lo carga", async () => {
    const o = await placed("propio", { text: "Villa Rural" });
    expect(o.result.delivery_fee).toBeNull();
    expect(await row(o.id)).toMatchObject({
      courier_id: null,
      courier_status: "waiting",
      delivery_zone_id: null,
      own_zone_id: null,
      delivery_zone_name: "Villa Rural",
      delivery_fee: null,
      delivery_fee_list: null,
      delivery_fee_coordinated: true,
    });

    // Llega solo a su repartidor propio, con el precio pendiente.
    await confirm(PRO, o.id);
    expect((await row(o.id)).courier_id).toBe(REPA_P);
    const pedido = (await mine(REPA_P_USER)).find((x) => x.id === o.id);
    expect(pedido?.envio).toMatchObject({ precio: null, precio_pendiente: true });
    expect(await mine(REPA_L_USER)).toEqual([]);

    // El seguimiento dice que el costo está por confirmarse.
    expect(await delivery(o.code)).toMatchObject({ zona: "Villa Rural", precio_pendiente: true });
    expect(await delivery(o.code)).not.toHaveProperty("precio");

    // El local lo carga; el cliente lo ve.
    expect((await call(PRO, `select public.set_delivery_fee('${o.id}', 1800.5)`)).ok).toBe(true);
    expect(await row(o.id)).toMatchObject({ delivery_fee: "1800.50", delivery_fee_list: "1800.50" });
    const d = await delivery(o.code);
    expect(d).toMatchObject({ precio: 1800.5 });
    expect(d).not.toHaveProperty("precio_pendiente");
    expect((await mine(REPA_P_USER))[0].envio).toMatchObject({ precio: 1800.5, precio_pendiente: false });

    // Se puede corregir mientras siga abierto.
    expect((await call(PRO, `select public.set_delivery_fee('${o.id}', 2000)`)).ok).toBe(true);
    expect((await row(o.id)).delivery_fee).toBe("2000.00");

    // Si el repartidor lo devuelve, el precio cargado no se pierde.
    await call(REPA_P_USER, `select public.courier_return_order('${o.id}', 'other', 'No llego')`);
    expect((await row(o.id)).delivery_fee).toBe("2000.00");
  });

  it("solo los miembros del negocio cargan el precio, y dentro del rango", async () => {
    const o = await placed("propio", { text: "Villa Rural" });

    const otro = await call(LIB, `select public.set_delivery_fee('${o.id}', 1000)`);
    expect(!otro.ok && otro.code).toBe("P0002");
    expect((await call(null, `select public.set_delivery_fee('${o.id}', 1000)`)).ok).toBe(false);
    expect((await call(REPA_P_USER, `select public.set_delivery_fee('${o.id}', 1000)`)).ok).toBe(false);

    for (const bad of ["-1", "100000000", "null"]) {
      const r = await call(PRO, `select public.set_delivery_fee('${o.id}', ${bad})`);
      expect(!r.ok && r.code).toBe("22023");
    }
    expect((await row(o.id)).delivery_fee).toBeNull();
  });

  it("un pedido con zona y precio no lleva costo a coordinar; uno cerrado tampoco", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    const zone = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;
    const normal = await placed("propio", { zone });
    const r = await call(PRO, `select public.set_delivery_fee('${normal.id}', 1000)`);
    expect(!r.ok && r.code).toBe("P0004");

    const aCoordinar = await placed("propio", { text: "Villa Rural" });
    await db.exec(`update orders set status = 'cancelled' where id = '${aCoordinar.id}'`);
    const cerrado = await call(PRO, `select public.set_delivery_fee('${aCoordinar.id}', 1000)`);
    expect(!cerrado.ok && cerrado.code).toBe("P0004");
  });

  it("con zonas cargadas, 'Mi barrio no está' lleva al mismo caso; sin barrio escrito se rechaza", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);

    const o = await placed("propio", { text: "Otro Barrio" });
    expect(await row(o.id)).toMatchObject({ delivery_fee_coordinated: true, delivery_fee: null });

    for (const text of [null, "   "]) {
      const r = await order("propio", { text });
      expect(!r.ok && r.code).toBe("P0016");
    }
    const largo = await order("propio", { text: "x".repeat(81) });
    expect(!largo.ok && largo.code).toBe("P0016");
  });

  it("un barrio de otro negocio o una zona inactiva se rechazan", async () => {
    await ownZone(NEG_P, "Apagada", 900, "active=false");
    const inactiva = (await db.query<{ id: string }>("select id from business_own_zones limit 1")).rows[0].id;

    const r1 = await order("propio", { zone: inactiva });
    expect(!r1.ok && r1.code).toBe("P0016");
    const r2 = await order("propio", { zone: cantera });
    expect(!r2.ok && r2.code).toBe("P0016");
  });

  it("libre con zonas tildadas exige elegir barrio; sin zonas tildadas queda 'Lo llevo yo' con precio pendiente", async () => {
    const sin = await orderLibre({});
    expect(!sin.ok && sin.code).toBe("P0016");

    await db.exec(`delete from business_delivery_zones where business_id = '${NEG_L}'`);
    const o = await orderLibre({ text: "Villa Rural" });
    if (!o.ok) throw new Error(o.error);
    await confirm(LIB, o.id);

    expect(await row(o.id)).toMatchObject({
      courier_id: null,
      courier_status: "self",
      delivery_zone_name: "Villa Rural",
      delivery_fee_coordinated: true,
    });
    expect(await available(REPA_L_USER)).toEqual([]);
    expect(await available(REPA_P_USER)).toEqual([]);

    expect((await call(LIB, `select public.set_delivery_fee('${o.id}', 1200)`)).ok).toBe(true);
    await db.exec(`
      insert into business_delivery_zones (business_id, zone_id) values ('${NEG_L}', '${cantera}'), ('${NEG_L}', '${centro}');
    `);
  });

  it("el pedido manual a coordinar: propio va a su repartidor y libre queda 'Lo llevo yo'", async () => {
    const items = JSON.stringify([{ name: "Pizza", unit_price: 5000, quantity: 1 }]);
    const manual = async (business_id: string, user: string, mode: string | null) => {
      const r = await call(
        user,
        `select public.create_manual_order('${business_id}', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
           p_customer_phone => '3515551234', p_delivery_address => 'Av. Siempre Viva 742',
           p_courier_mode => ${mode ? `'${mode}'` : "null"}, p_delivery_zone_text => 'Villa Rural') as r`,
      );
      if (!r.ok) throw new Error(r.error);
      return (r.rows[0].r as { id: string }).id;
    };

    expect(await row(await manual(NEG_P, PRO, null))).toMatchObject({
      courier_id: REPA_P,
      courier_status: "accepted",
      delivery_fee: null,
      delivery_fee_coordinated: true,
    });

    await db.exec(`delete from business_delivery_zones where business_id = '${NEG_L}'`);
    expect(await row(await manual(NEG_L, LIB, "offers"))).toMatchObject({
      courier_id: null,
      courier_status: "self",
      delivery_fee_coordinated: true,
    });
    await db.exec(`
      insert into business_delivery_zones (business_id, zone_id) values ('${NEG_L}', '${cantera}'), ('${NEG_L}', '${centro}');
    `);
  });
});

describe("zonas del negocio — ENVIO-247", () => {
  const insertAs = (user: string | null, business_id: string, name = "Zona X") =>
    call(user, `insert into business_own_zones (business_id, name, price) values ('${business_id}', '${name}', 100)`);

  it("los miembros las leen y las escriben; nunca las de otro negocio", async () => {
    expect((await insertAs(PRO, NEG_P)).ok).toBe(true);
    expect((await insertAs(PRO, NEG_L)).ok).toBe(false);
    expect((await insertAs(LIB, NEG_P)).ok).toBe(false);

    const propias = await call(PRO, "select name from business_own_zones");
    expect(propias.ok && propias.rows.map((r) => r.name)).toEqual(["Zona X"]);
    const ajenas = await call(LIB, "select name from business_own_zones");
    expect(ajenas.ok && ajenas.rows).toEqual([]);

    expect((await call(PRO, `update business_own_zones set price = 250, active = false where business_id = '${NEG_P}'`)).ok).toBe(true);
    expect(await count("select count(*) as n from business_own_zones where price = 250 and not active")).toBe(1);
    expect((await call(LIB, `update business_own_zones set price = 1 where business_id = '${NEG_P}'`)).ok).toBe(true);
    expect(await count("select count(*) as n from business_own_zones where price = 1")).toBe(0);
    expect((await call(LIB, `delete from business_own_zones where business_id = '${NEG_P}'`)).ok).toBe(true);
    expect(await count("select count(*) as n from business_own_zones")).toBe(1);
    expect((await call(PRO, `delete from business_own_zones where business_id = '${NEG_P}'`)).ok).toBe(true);
    expect(await count("select count(*) as n from business_own_zones")).toBe(0);
  });

  it("el repartidor propio las ve en solo lectura; el libre y el público no las ven", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);

    const ve = await call(REPA_P_USER, "select name from business_own_zones");
    expect(ve.ok && ve.rows.map((r) => r.name)).toEqual(["Barrio Norte"]);

    expect((await insertAs(REPA_P_USER, NEG_P)).ok).toBe(false);
    expect((await call(REPA_P_USER, "update business_own_zones set price = 1")).ok).toBe(true);
    expect((await call(REPA_P_USER, "delete from business_own_zones")).ok).toBe(true);
    expect(await count("select count(*) as n from business_own_zones where price = 1500")).toBe(1);

    const libre = await call(REPA_L_USER, "select name from business_own_zones");
    expect(libre.ok && libre.rows).toEqual([]);
    const anon = await call(null, "select name from business_own_zones");
    expect(!anon.ok || anon.rows.length === 0).toBe(true);
  });

  it("el repartidor propio de un negocio no ve las zonas de otro", async () => {
    await ownZone(NEG_Q, "Barrio Q", 700);
    const r = await call(REPA_P_USER, "select name from business_own_zones");
    expect(r.ok && r.rows).toEqual([]);
  });

  it("el superadmin hace todo", async () => {
    expect((await insertAs(SUPER, NEG_Q, "Barrio S")).ok).toBe(true);
    expect((await call(SUPER, "update business_own_zones set price = 5")).ok).toBe(true);
    const todas = await call(SUPER, "select name from business_own_zones");
    expect(todas.ok && todas.rows.map((r) => r.name)).toEqual(["Barrio S"]);
    expect((await call(SUPER, "delete from business_own_zones")).ok).toBe(true);
  });

  it("el nombre no se repite en el negocio, ni vacío, ni con precio negativo", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    expect((await insertAs(PRO, NEG_P, "barrio norte ")).ok).toBe(false);
    expect((await insertAs(PRO, NEG_P, "  ")).ok).toBe(false);
    expect((await call(PRO, `insert into business_own_zones (business_id, name, price) values ('${NEG_P}', 'Neg', -1)`)).ok).toBe(false);
    expect((await insertAs(PRO, NEG_Q, "Barrio Norte")).ok).toBe(false); // no es miembro de NEG_Q
  });

  it("una zona con un pedido en curso no se borra (P0029); sin pedido, sí", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    await ownZone(NEG_P, "Barrio Sur", 2000);
    const norte = (await db.query<{ id: string }>("select id from business_own_zones where name = 'Barrio Norte'")).rows[0].id;
    const sur = (await db.query<{ id: string }>("select id from business_own_zones where name = 'Barrio Sur'")).rows[0].id;
    const o = await placed("propio", { zone: norte });

    const enCurso = await call(PRO, `delete from business_own_zones where id = '${norte}'`);
    expect(!enCurso.ok && enCurso.code).toBe("P0029");
    expect((await call(PRO, `delete from business_own_zones where id = '${sur}'`)).ok).toBe(true);

    await db.exec(`update orders set status = 'delivered' where id = '${o.id}'`);
    expect((await call(PRO, `delete from business_own_zones where id = '${norte}'`)).ok).toBe(true);
    expect((await row(o.id)).own_zone_id).toBeNull();
    expect((await row(o.id)).delivery_zone_name).toBe("Barrio Norte");
  });
});

describe("repartidores propios y libres — ENVIO-245 y 246", () => {
  it("un repartidor propio necesita negocio y uno libre no lo tiene", async () => {
    const sinNegocio = await db
      .exec("insert into couriers (name, whatsapp, courier_type) values ('X', '5493510000090', 'own')")
      .then(() => null, (e: Error & { code?: string }) => e.code);
    expect(sinNegocio).toBe("23514");

    const libreConNegocio = await db
      .exec(`insert into couriers (name, whatsapp, courier_type, own_business_id) values ('X', '5493510000090', 'free', '${NEG_P}')`)
      .then(() => null, (e: Error & { code?: string }) => e.code);
    expect(libreConNegocio).toBe("23514");
  });

  it("a lo sumo un repartidor propio activo por negocio", async () => {
    const dos = await db
      .exec(`insert into couriers (name, whatsapp, courier_type, own_business_id) values ('Otro', '5493510000090', 'own', '${NEG_P}')`)
      .then(() => null, (e: Error & { code?: string }) => e.code);
    expect(dos).toBe("23505");

    // Uno inactivo no cuenta.
    await db.exec(
      `insert into couriers (id, name, whatsapp, active, courier_type, own_business_id)
       values ('7a0c0e00-0000-4000-8000-0000000000aa', 'Viejo', '5493510000091', false, 'own', '${NEG_P}')`,
    );
    const reactivar = await db
      .exec("update couriers set active = true where id = '7a0c0e00-0000-4000-8000-0000000000aa'")
      .then(() => null, (e: Error & { code?: string }) => e.code);
    expect(reactivar).toBe("23505");
    await db.exec("delete from couriers where id = '7a0c0e00-0000-4000-8000-0000000000aa'");
  });

  it("el propio activo de un negocio que no tiene propio: otro negocio puede tener el suyo", async () => {
    await db.exec(
      `insert into couriers (id, name, whatsapp, courier_type, own_business_id)
       values ('7a0c0e00-0000-4000-8000-0000000000ab', 'Q', '5493510000092', 'own', '${NEG_Q}')`,
    );
    await db.exec("delete from couriers where id = '7a0c0e00-0000-4000-8000-0000000000ab'");
  });

  it("solo el superadmin cambia el tipo de repartidor y de envío", async () => {
    const propio = await call(REPA_P_USER, `update couriers set courier_type = 'free', own_business_id = null where id = '${REPA_P}'`);
    expect(propio.ok && propio.affected).toBe(0);
    expect((await call(PRO, `update couriers set courier_type = 'free', own_business_id = null where id = '${REPA_P}'`)).ok).toBe(true);
    expect(await count(`select count(*) as n from couriers where id = '${REPA_P}' and courier_type = 'own'`)).toBe(1);

    const negocio = await call(PRO, `update businesses set delivery_type = 'free' where id = '${NEG_P}'`);
    expect(!negocio.ok && negocio.code).toBe("42501");
    expect(await count(`select count(*) as n from businesses where id = '${NEG_P}' and delivery_type = 'own'`)).toBe(1);

    expect((await call(SUPER, `update businesses set delivery_type = 'free' where id = '${NEG_P}'`)).ok).toBe(true);
    expect((await call(SUPER, `update businesses set delivery_type = 'own' where id = '${NEG_P}'`)).ok).toBe(true);
  });

  it("un valor que no es free ni own se rechaza", async () => {
    const r = await db.exec(`update businesses set delivery_type = 'otro' where id = '${NEG_P}'`).then(() => null, (e: Error & { code?: string }) => e.code);
    expect(r).toBe("23514");
  });

  it("el trigger que carga las zonas comunes solo corre con envío libre, también al volver a libre", async () => {
    await db.exec(`
      insert into businesses (id, name, slug, whatsapp, delivery_type) values
        ('b2b2b2b2-0000-0000-0000-000000000001', 'Nuevo propio', 'nuevopropio', '5493510000050', 'own'),
        ('b2b2b2b2-0000-0000-0000-000000000002', 'Nuevo libre', 'nuevolibre', '5493510000051', 'free');
      update businesses set courier_delivery = true where id in
        ('b2b2b2b2-0000-0000-0000-000000000001', 'b2b2b2b2-0000-0000-0000-000000000002');
    `);
    const zonasDe = (id: string) => count(`select count(*) as n from business_delivery_zones where business_id = '${id}'`);
    const activas = await count("select count(*) as n from delivery_zones where active");

    expect(await zonasDe("b2b2b2b2-0000-0000-0000-000000000001")).toBe(0);
    expect(await zonasDe("b2b2b2b2-0000-0000-0000-000000000002")).toBe(activas);

    await db.exec("update businesses set delivery_type = 'free' where id = 'b2b2b2b2-0000-0000-0000-000000000001'");
    expect(await zonasDe("b2b2b2b2-0000-0000-0000-000000000001")).toBe(activas);
  });
});

describe("lo que ven los paneles — ENVIO-257", () => {
  it("business_own_delivery: el local y el superadmin lo ven; otro negocio, no", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    await ownZone(NEG_P, "Sin precio", null);

    const r = await call(PRO, `select public.business_own_delivery('${NEG_P}') as d`);
    expect(r.ok && r.rows[0].d).toMatchObject({
      delivery_type: "own",
      courier: { id: REPA_P, name: "Repartidor Propio", active: true },
      zones_with_price: 1,
      zones_total: 2,
    });

    expect((await call(SUPER, `select public.business_own_delivery('${NEG_P}') as d`)).ok).toBe(true);
    const ajeno = await call(LIB, `select public.business_own_delivery('${NEG_P}') as d`);
    expect(!ajeno.ok && ajeno.code).toBe("42501");
    expect((await call(null, `select public.business_own_delivery('${NEG_P}') as d`)).ok).toBe(false);

    const sin = await call(SUPER, `select public.business_own_delivery('${NEG_Q}') as d`);
    expect(sin.ok && (sin.rows[0].d as { courier: unknown }).courier).toBeNull();
  });

  it("courier_own_business: el propio ve su negocio y sus zonas; el libre no", async () => {
    await ownZone(NEG_P, "Barrio Norte", 1500);
    await ownZone(NEG_Q, "Barrio Q", 700);

    const r = await call(REPA_P_USER, "select public.courier_own_business() as d");
    expect(r.ok && r.rows[0].d).toEqual({
      business: { id: NEG_P, name: "Propio Resto" },
      zones: [expect.objectContaining({ name: "Barrio Norte", price: 1500, active: true })],
    });

    const libre = await call(REPA_L_USER, "select public.courier_own_business() as d");
    expect(libre.ok && libre.rows[0].d).toBeNull();
    expect((await call(PRO, "select public.courier_own_business()")).ok).toBe(false);
  });
});

describe("la migración pasa los negocios de la tarea 47 a envío propio — ENVIO-256", () => {
  const NEG_C = "a1a1a1a1-0000-0000-0000-0000000000c1"; // tipo courier con favorito
  const NEG_D = "a1a1a1a1-0000-0000-0000-0000000000c2"; // tipo courier sin favorito elegido
  const NEG_B = "a1a1a1a1-0000-0000-0000-0000000000c3"; // tipo negocio
  const FAV = "7a0c0e00-0000-4000-8000-0000000000f1";
  const FAV2 = "7a0c0e00-0000-4000-8000-0000000000f2";
  const ZONA = "7a0c0e00-0000-4000-8000-0000000000e1";
  const PEDIDO = "e0e0e0e0-0000-0000-0000-000000000001";

  it("copia las zonas con los mismos id, reapunta los pedidos y elimina el modelo viejo", async () => {
    const old = await createTestDb({ before: "20261203000000_envio_propio_del_negocio.sql" });

    try {
      await old.exec(`
        insert into businesses (id, name, slug, whatsapp, courier_delivery, delivery_pricing, delivery_prices_editable) values
          ('${NEG_C}', 'Courier', 'courier', '5493510000001', true, 'courier', false),
          ('${NEG_D}', 'Sin favorito', 'sinfav', '5493510000002', true, 'courier', false),
          ('${NEG_B}', 'Negocio', 'negocio', '5493510000003', true, 'business', true);
        insert into business_settings (business_id, favorite_courier_id) values ('${NEG_C}', null);
        insert into couriers (id, name, whatsapp, can_edit_zones) values
          ('${FAV}', 'Favorito', '5493510000010', true), ('${FAV2}', 'Otro', '5493510000011', false);
        insert into courier_own_zones (id, courier_id, name, price, active, sort_order) values
          ('${ZONA}', '${FAV}', 'Zona propia', 1234, true, 3),
          ('7a0c0e00-0000-4000-8000-0000000000e2', '${FAV2}', 'Zona de otro', 99, true, 1);
        update business_settings set favorite_courier_id = '${FAV}' where business_id = '${NEG_C}';
        insert into orders (id, business_id, order_number, status, total, customer_name, delivery, payment, courier_zone_id)
          values ('${PEDIDO}', '${NEG_C}', '1', 'pending', 100, 'Cli', 'delivery', 'efectivo', '${ZONA}');
      `);

      await applyMigration(old, "20261203000000_envio_propio_del_negocio.sql");

      const types = await old.query<{ id: string; delivery_type: string }>(
        "select id, delivery_type from businesses where id in ($1, $2, $3) order by id",
        [NEG_C, NEG_D, NEG_B],
      );
      expect(types.rows.map((r) => [r.id, r.delivery_type])).toEqual([
        [NEG_C, "own"],
        [NEG_D, "own"],
        [NEG_B, "free"],
      ]);

      // Su favorito es ahora el repartidor propio; el otro sigue libre.
      const couriers = await old.query<{ id: string; courier_type: string; own_business_id: string | null }>(
        "select id, courier_type, own_business_id from couriers where id in ($1, $2) order by id",
        [FAV, FAV2],
      );
      expect(couriers.rows).toEqual([
        { id: FAV, courier_type: "own", own_business_id: NEG_C },
        { id: FAV2, courier_type: "free", own_business_id: null },
      ]);

      // Las zonas del favorito pasan al negocio con el mismo id; la del otro no.
      const zonas = await old.query<{ id: string; business_id: string; name: string; price: string; sort_order: number }>(
        "select id, business_id, name, price, sort_order from business_own_zones",
      );
      expect(zonas.rows).toEqual([{ id: ZONA, business_id: NEG_C, name: "Zona propia", price: "1234.00", sort_order: 3 }]);
      expect(
        (await old.query<{ own_zone_id: string }>("select own_zone_id from orders where id = $1", [PEDIDO])).rows[0],
      ).toEqual({ own_zone_id: ZONA });

      // El modelo viejo ya no está.
      const left = await old.query<{ n: string }>(
        `select count(*) as n from information_schema.columns
         where table_schema = 'public' and (
           (table_name = 'businesses' and column_name in ('delivery_pricing', 'delivery_prices_editable', 'delivery_offers_enabled'))
           or (table_name = 'couriers' and column_name = 'can_edit_zones')
           or (table_name = 'orders' and column_name = 'courier_zone_id'))`,
      );
      expect(Number(left.rows[0].n)).toBe(0);
      const tables = await old.query<{ n: string }>(
        "select count(*) as n from pg_tables where schemaname = 'public' and tablename in ('business_zone_prices', 'courier_own_zones')",
      );
      expect(Number(tables.rows[0].n)).toBe(0);
      const fns = await old.query<{ n: string }>(
        `select count(*) as n from pg_proc where proname in
         ('business_delivery_pricing', 'superadmin_set_favorite_courier', 'default_courier_id', 'can_edit_business_prices')`,
      );
      expect(Number(fns.rows[0].n)).toBe(0);
    } finally {
      await old.close();
    }
  }, 120_000);
});
