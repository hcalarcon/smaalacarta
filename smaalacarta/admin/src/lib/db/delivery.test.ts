// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ENVIO-1 a 17 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña de un negocio con envío
const BETO = "bbbbbbbb-0000-0000-0000-000000000002"; // dueño de un negocio sin envío
const REPA = "cccccccc-0000-0000-0000-000000000003"; // usuario repartidor
const SUPER = "dddddddd-0000-0000-0000-000000000004"; // superadmin
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const COURIER = "7a0c0e00-0000-4000-8000-000000000001";
const OTRO_COURIER = "7a0c0e00-0000-4000-8000-000000000002";

const CAFE = "d1000000-0000-0000-0000-000000000001";
const FERNET = "d2000000-0000-0000-0000-000000000001";

let db: TestDb;

const sqlText = (value: string | null) => (value === null ? "null" : "'" + value.replace(/'/g, "''") + "'");

type Extra = {
  delivery?: string;
  zone?: string | null;
  phone?: string | null;
  address?: string | null;
};

// Igual que el helper de `orders.test.ts`, con los tres parámetros nuevos.
function order(slug: string, product: string, extra: Extra = {}, user: string | null = null) {
  const items = JSON.stringify([{ id: product, kind: "product", quantity: 2 }]);
  const zone = extra.zone === undefined ? null : extra.zone;
  return asUser(
    db,
    user,
    `select public.create_public_order(
       '${slug}',
       'Cliente Prueba',
       ${sqlText(extra.delivery ?? "retiro")},
       'efectivo',
       null,
       '${items}'::jsonb,
       p_delivery_zone => ${zone === null ? "null" : `'${zone}'::uuid`},
       p_customer_phone => ${sqlText(extra.phone ?? null)},
       p_delivery_address => ${sqlText(extra.address ?? null)}) as result`,
  );
}

type Created = { code: string; number: number; total: number; delivery_fee?: number };
const created = (r: Awaited<ReturnType<typeof order>>) => (r.ok ? (r.rows[0].result as Created) : null);

async function zoneId(name: string) {
  const r = await db.query<{ id: string }>("select id from courier_zones where name = $1", [name]);
  return r.rows[0].id;
}

async function orderId(code: string) {
  const r = await db.query<{ id: string }>("select id from orders where code = $1", [code]);
  return r.rows[0].id;
}

// Un pedido con envío en el negocio de Ana, en Cantera ($5000).
async function courierOrder(extra: Partial<Extra> = {}) {
  const r = await order(
    "ana",
    CAFE,
    {
      delivery: "delivery",
      zone: await zoneId("Cantera"),
      phone: "351 555-1234",
      address: "Av. Siempre Viva 742",
      ...extra,
    },
    null,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const c = created(r)!;
  return { ...c, id: await orderId(c.code) };
}

const status = async (id: string) =>
  (await db.query<{ status: string }>("select status from orders where id = $1", [id])).rows[0].status;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const setStatus = (user: string | null, id: string, to: string) =>
  call(user, `select public.set_order_status('${id}', '${to}')`);
const courierAction = (user: string | null, id: string, action: string, note = "Juan") =>
  call(user, `select public.set_order_courier('${id}', '${action}', ${sqlText(note)})`);
const courierStatus = (user: string | null, id: string, to: string) =>
  call(user, `select public.courier_set_status('${id}', '${to}')`);

async function count(sql: string) {
  const r = await db.query<{ n: string }>(sql);
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: REPA, email: "repa@x.com" });
  await createUser(db, { id: SUPER, email: "super@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true, false);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_ANA}', true, 'San Martín 100'), ('${NEG_BETO}', true, null);

    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true),
      ('c2000000-0000-0000-0000-000000000001', '${NEG_BETO}', 'Tragos', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true),
      ('${FERNET}', '${NEG_BETO}', 'c2000000-0000-0000-0000-000000000001', 'Fernet', 2500, true);

    insert into courier_users (courier_id, user_id) values ('${COURIER}', '${REPA}');
    -- Un repartidor inactivo (no puede haber dos activos) para probar el aislamiento.
    insert into couriers (id, name, active) values ('${OTRO_COURIER}', 'Otro', false);
    insert into courier_zones (courier_id, name, price, sort_order)
      values ('${OTRO_COURIER}', 'Zona ajena', 100, 1);
  `);
}, 60_000);

// El freno de 20 pedidos por minuto: los pedidos de los tests anteriores se "envejecen".
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

afterAll(async () => {
  await db.close();
});

describe("repartidor y barrios cargados — ENVIO-1", () => {
  it("Repartos al Toque está activo con sus 39 barrios, en orden", async () => {
    const c = await db.query<{ name: string; active: boolean; whatsapp: string | null }>(
      "select name, active, whatsapp from couriers where id = $1",
      [COURIER],
    );
    expect(c.rows[0]).toEqual({ name: "Repartos al Toque", active: true, whatsapp: null });

    const z = await db.query<{ name: string; price: string }>(
      "select name, price from courier_zones where courier_id = $1 order by sort_order",
      [COURIER],
    );
    expect(z.rows).toHaveLength(39);
    expect(z.rows[0]).toEqual({ name: "Centro (hasta Av. Koessler)", price: "4500.00" });
    expect(z.rows[38]).toEqual({ name: "Las Marias del Valle / Aeropuerto", price: "28000.00" });
  });

  it("la base no admite un segundo repartidor activo", async () => {
    await expect(
      db.exec("insert into couriers (name, active) values ('Segundo', true)"),
    ).rejects.toThrow(/couriers_one_active_idx|duplicate/i);
  });

  it("un barrio no se repite dentro del repartidor", async () => {
    await expect(
      db.exec(`insert into courier_zones (courier_id, name, price) values ('${COURIER}', 'Cantera', 1)`),
    ).rejects.toThrow(/duplicate|unique/i);
  });
});

describe("quién ve y toca qué — ENVIO-3 y ENVIO-4", () => {
  it("un visitante sin sesión no ve repartidores, barrios ni usuarios", async () => {
    for (const t of ["couriers", "courier_zones", "courier_users"]) {
      const r = await call(null, `select * from ${t}`);
      expect(r.ok && r.rows.length).toBe(0);
    }
  });

  it("el miembro de un negocio con envío ve el repartidor y sus barrios activos", async () => {
    const c = await call(ANA, "select id from couriers");
    expect(c.ok && c.rows.length).toBe(1);

    const z = await call(ANA, "select id from courier_zones");
    expect(z.ok && z.rows.length).toBe(39);

    await db.exec(`update courier_zones set active = false where name = 'Lolog'`);
    const z2 = await call(ANA, "select id from courier_zones");
    expect(z2.ok && z2.rows.length).toBe(38);
    await db.exec(`update courier_zones set active = true where name = 'Lolog'`);
  });

  it("el miembro de un negocio sin envío no ve nada", async () => {
    for (const t of ["couriers", "courier_zones", "courier_users"]) {
      const r = await call(BETO, `select * from ${t}`);
      expect(r.ok && r.rows.length).toBe(0);
    }
  });

  it("un miembro no escribe barrios, repartidores ni usuarios repartidor", async () => {
    const insert = await call(
      ANA,
      `insert into courier_zones (courier_id, name, price) values ('${COURIER}', 'Mío', 1)`,
    );
    expect(insert.ok).toBe(false);

    const update = await call(ANA, "update courier_zones set price = 1");
    expect(update.ok && update.affected).toBe(0);

    const del = await call(ANA, "delete from courier_zones");
    expect(del.ok && del.affected).toBe(0);

    const courier = await call(ANA, "update couriers set name = 'Hackeado'");
    expect(courier.ok && courier.affected).toBe(0);

    const user = await call(ANA, `insert into courier_users (courier_id, user_id) values ('${COURIER}', '${ANA}')`);
    expect(user.ok).toBe(false);
  });

  it("el usuario repartidor ve su repartidor y su fila", async () => {
    const c = await call(REPA, "select id from couriers");
    expect(c.ok && c.rows.map((r) => r.id)).toEqual([COURIER]);

    const u = await call(REPA, "select user_id from courier_users");
    expect(u.ok && u.rows.map((r) => r.user_id)).toEqual([REPA]);

    const me = await call(REPA, "select public.my_courier_id() as id");
    expect(me.ok && me.rows[0].id).toBe(COURIER);

    const nobody = await call(ANA, "select public.my_courier_id() as id");
    expect(nobody.ok && nobody.rows[0].id).toBeNull();
  });

  it("el repartidor hace alta, cambio y baja de sus barrios", async () => {
    const insert = await call(
      REPA,
      `insert into courier_zones (courier_id, name, price, sort_order) values ('${COURIER}', 'Barrio Nuevo', 9000, 40)`,
    );
    expect(insert.ok).toBe(true);

    const update = await call(REPA, "update courier_zones set price = 9500 where name = 'Barrio Nuevo'");
    expect(update.ok && update.affected).toBe(1);

    const del = await call(REPA, "delete from courier_zones where name = 'Barrio Nuevo'");
    expect(del.ok && del.affected).toBe(1);
  });

  it("el repartidor no toca los barrios de otro ni cambia de repartidor", async () => {
    const insert = await call(
      REPA,
      `insert into courier_zones (courier_id, name, price) values ('${OTRO_COURIER}', 'Colada', 1)`,
    );
    expect(insert.ok).toBe(false);

    const update = await call(REPA, "update courier_zones set price = 1 where name = 'Zona ajena'");
    expect(update.ok && update.affected).toBe(0);

    const move = await call(REPA, `update courier_zones set courier_id = '${OTRO_COURIER}' where name = 'Cantera'`);
    expect(move.ok).toBe(false);

    const self = await call(REPA, `insert into courier_users (courier_id, user_id) values ('${OTRO_COURIER}', '${REPA}')`);
    expect(self.ok).toBe(false);
  });

  it("el superadmin lee todo y cambia repartidores y barrios, pero no usuarios repartidor", async () => {
    const all = await call(SUPER, "select id from couriers");
    expect(all.ok && all.rows.length).toBe(2);

    const zones = await call(SUPER, "select id from courier_zones");
    expect(zones.ok && zones.rows.length).toBe(40);

    const users = await call(SUPER, "select user_id from courier_users");
    expect(users.ok && users.rows.length).toBe(1);

    const update = await call(SUPER, "update courier_zones set price = 4600 where name = 'Centro (hasta Av. Koessler)'");
    expect(update.ok && update.affected).toBe(1);
    await db.exec("update courier_zones set price = 4500 where name = 'Centro (hasta Av. Koessler)'");

    const write = await call(SUPER, `insert into courier_users (courier_id, user_id) values ('${COURIER}', '${SUPER}')`);
    expect(write.ok).toBe(false);
  });
});

describe("habilitar el envío — ENVIO-2", () => {
  it("el dueño del negocio no puede cambiar courier_delivery", async () => {
    const r = await call(BETO, `update businesses set courier_delivery = true where id = '${NEG_BETO}'`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("42501");
  });

  it("el dueño sigue editando el resto de su negocio", async () => {
    const r = await call(ANA, `update businesses set name = 'Ana Resto 2' where id = '${NEG_ANA}'`);
    expect(r.ok && r.affected).toBe(1);
    await db.exec(`update businesses set name = 'Ana Resto' where id = '${NEG_ANA}'`);
  });

  it("el superadmin lo habilita y lo deshabilita", async () => {
    const on = await call(SUPER, `update businesses set courier_delivery = true where id = '${NEG_BETO}'`);
    expect(on.ok && on.affected).toBe(1);
    expect(await count(`select count(*) n from businesses where courier_delivery`)).toBe(2);

    const off = await call(SUPER, `update businesses set courier_delivery = false where id = '${NEG_BETO}'`);
    expect(off.ok && off.affected).toBe(1);
  });
});

describe("crear un pedido con envío — ENVIO-5, 6 y 7", () => {
  it("guarda repartidor, barrio, precio de lista y final, teléfono y dirección", async () => {
    const r = await order("ana", CAFE, {
      delivery: "delivery",
      zone: await zoneId("Cantera"),
      phone: "(351) 555-1234",
      address: "  Av. Siempre Viva 742  ",
    });

    expect(r.ok).toBe(true);
    const c = created(r)!;
    expect(c.total).toBe(2000);
    expect(c.delivery_fee).toBe(5000);

    const o = await db.query<Record<string, unknown>>("select * from orders where code = $1", [c.code]);
    expect(o.rows[0]).toMatchObject({
      courier_id: COURIER,
      delivery_zone_name: "Cantera",
      delivery_fee_list: "5000.00",
      delivery_fee: "5000.00",
      customer_phone: "3515551234",
      delivery_address: "Av. Siempre Viva 742",
      courier_status: "waiting",
      status: "pending",
    });
  });

  it("el navegador no manda el precio: el de lista sale de la base", async () => {
    const before = await count("select count(*) n from orders");
    const r = await order("ana", CAFE, {
      delivery: "delivery",
      zone: await zoneId("Oasis"),
      phone: "3515551234",
      address: "Calle 12345",
    });
    expect(created(r)!.delivery_fee).toBe(5500);
    expect(await count("select count(*) n from orders")).toBe(before + 1);
  });

  it("sin barrio, o con un barrio que no existe, inactivo o de otro repartidor, da P0016", async () => {
    const base = { delivery: "delivery", phone: "3515551234", address: "Calle 12345" };

    const sin = await order("ana", CAFE, { ...base, zone: null });
    expect(!sin.ok && sin.code).toBe("P0016");

    const fantasma = await order("ana", CAFE, { ...base, zone: "99999999-0000-0000-0000-000000000009" });
    expect(!fantasma.ok && fantasma.code).toBe("P0016");

    const ajena = await order("ana", CAFE, { ...base, zone: await zoneId("Zona ajena") });
    expect(!ajena.ok && ajena.code).toBe("P0016");

    await db.exec("update courier_zones set active = false where name = 'Cantera'");
    const inactiva = await order("ana", CAFE, { ...base, zone: await zoneId("Cantera") });
    expect(!inactiva.ok && inactiva.code).toBe("P0016");
    await db.exec("update courier_zones set active = true where name = 'Cantera'");
  });

  it("teléfono de 8 a 15 dígitos y dirección de 5 a 200 caracteres: si no, 22023", async () => {
    const zone = await zoneId("Cantera");
    const ok = { delivery: "delivery", zone, phone: "3515551234", address: "Calle 12345" };

    for (const phone of [null, "", "1234567", "1234567890123456", "sin números"]) {
      const r = await order("ana", CAFE, { ...ok, phone });
      expect(!r.ok && r.code, `teléfono ${phone}`).toBe("22023");
    }
    for (const address of [null, "", "Av 1", "x".repeat(201)]) {
      const r = await order("ana", CAFE, { ...ok, address });
      expect(!r.ok && r.code, `dirección ${address?.length}`).toBe("22023");
    }
    const limite = await order("ana", CAFE, { ...ok, phone: "12345678", address: "x".repeat(200) });
    expect(limite.ok).toBe(true);
  });

  it("un barrio en un negocio sin envío, o con otra entrega, da P0016", async () => {
    const zone = await zoneId("Cantera");

    const sinEnvio = await order("beto", FERNET, {
      delivery: "delivery",
      zone,
      phone: "3515551234",
      address: "Calle 12345",
    });
    expect(!sinEnvio.ok && sinEnvio.code).toBe("P0016");

    const retiro = await order("ana", CAFE, { delivery: "retiro", zone });
    expect(!retiro.ok && retiro.code).toBe("P0016");
  });

  it("un negocio sin envío sigue creando pedidos de siempre, sin repartidor", async () => {
    const r = await order("beto", FERNET, { delivery: "delivery" });
    expect(r.ok).toBe(true);
    expect(created(r)!.delivery_fee).toBeUndefined();

    const o = await db.query<{ courier_id: string | null; courier_status: string | null }>(
      "select courier_id, courier_status from orders where code = $1",
      [created(r)!.code],
    );
    expect(o.rows[0]).toEqual({ courier_id: null, courier_status: null });
  });

  it("retiro en el negocio con envío no pide barrio ni deja repartidor", async () => {
    const r = await order("ana", CAFE, { delivery: "retiro" });
    expect(r.ok).toBe(true);
    const o = await db.query<{ courier_id: string | null }>("select courier_id from orders where code = $1", [
      created(r)!.code,
    ]);
    expect(o.rows[0].courier_id).toBeNull();
  });

  it("un negocio que no existe sigue dando P0002", async () => {
    const r = await order("fantasma", CAFE, { delivery: "delivery" });
    expect(!r.ok && r.code).toBe("P0002");
  });

  it("la función base no se llama desde afuera", async () => {
    const r = await call(
      null,
      `select public.create_public_order_base('ana', 'X', 'retiro', 'efectivo', null, '[]'::jsonb)`,
    );
    expect(r.ok).toBe(false);
  });
});

describe("el envío tiene que estar aceptado — ENVIO-8", () => {
  it("set_order_status no confirma un pedido con envío sin aceptar (P0015)", async () => {
    const o = await courierOrder();
    const r = await setStatus(ANA, o.id, "confirmed");
    expect(!r.ok && r.code).toBe("P0015");
    expect(await status(o.id)).toBe("pending");
  });

  it("tampoco con el envío consultado o rechazado", async () => {
    const o = await courierOrder();
    await courierAction(ANA, o.id, "request");
    expect((await setStatus(ANA, o.id, "preparing")).ok).toBe(false);

    await courierAction(REPA, o.id, "reject", "Sin repartidores");
    const r = await setStatus(ANA, o.id, "confirmed");
    expect(!r.ok && r.code).toBe("P0015");
  });

  it("un UPDATE directo de un miembro tampoco lo salta", async () => {
    const o = await courierOrder();
    const r = await call(ANA, `update orders set status = 'confirmed' where id = '${o.id}'`);
    expect(!r.ok && r.code).toBe("P0015");
    expect(await status(o.id)).toBe("pending");
  });

  it("el miembro no cambia el repartidor de un pedido por UPDATE directo", async () => {
    const o = await courierOrder();
    const r = await call(ANA, `update orders set courier_id = null where id = '${o.id}'`);
    expect(r.ok).toBe(false);
  });

  it("aceptado el envío, se confirma", async () => {
    const o = await courierOrder();
    expect((await courierAction(ANA, o.id, "accept", "Juan")).ok).toBe(true);
    expect((await setStatus(ANA, o.id, "confirmed")).ok).toBe(true);
    expect(await status(o.id)).toBe("confirmed");
  });

  it("cancelar se puede siempre, con el envío sin aceptar y hasta que termina", async () => {
    const sinAceptar = await courierOrder();
    expect((await setStatus(ANA, sinAceptar.id, "cancelled")).ok).toBe(true);

    const enCamino = await courierOrder();
    await courierAction(REPA, enCamino.id, "accept");
    for (const s of ["confirmed", "preparing", "ready", "handed_to_courier"]) {
      expect((await setStatus(ANA, enCamino.id, s)).ok).toBe(true);
    }
    await courierStatus(REPA, enCamino.id, "on_the_way");
    expect((await setStatus(ANA, enCamino.id, "cancelled")).ok).toBe(true);

    const entregado = await courierOrder();
    await courierAction(ANA, entregado.id, "accept");
    for (const s of ["confirmed", "preparing", "ready", "handed_to_courier"]) {
      await setStatus(ANA, entregado.id, s);
    }
    await courierStatus(REPA, entregado.id, "on_the_way");
    await courierStatus(REPA, entregado.id, "delivered");
    const r = await setStatus(ANA, entregado.id, "cancelled");
    expect(!r.ok && r.code).toBe("P0004");
  });
});

describe("los dos caminos de estados — ENVIO-9 y 10", () => {
  it("con envío: el local llega a Entregado al repartidor y el repartidor lo termina", async () => {
    const o = await courierOrder();
    await courierAction(REPA, o.id, "accept");

    for (const s of ["confirmed", "preparing", "ready", "handed_to_courier"]) {
      expect((await setStatus(ANA, o.id, s)).ok, s).toBe(true);
    }

    expect((await courierStatus(REPA, o.id, "on_the_way")).ok).toBe(true);
    expect(await status(o.id)).toBe("on_the_way");
    expect((await courierStatus(REPA, o.id, "delivered")).ok).toBe(true);
    expect(await status(o.id)).toBe("delivered");

    const events = await db.query<{ status: string; changed_by: string | null; kind: string }>(
      "select status, changed_by, kind from order_events where order_id = $1 and kind = 'status' order by created_at, id",
      [o.id],
    );
    const last = events.rows.at(-1)!;
    expect(last).toEqual({ status: "delivered", changed_by: REPA, kind: "status" });
    expect(events.rows.map((e) => e.status)).toContain("on_the_way");
  });

  it("el local no pasa a En camino ni a Entregado (P0004)", async () => {
    const o = await courierOrder();
    await courierAction(ANA, o.id, "accept");
    await setStatus(ANA, o.id, "confirmed");
    await setStatus(ANA, o.id, "ready");

    for (const s of ["on_the_way", "delivered"]) {
      const r = await setStatus(ANA, o.id, s);
      expect(!r.ok && r.code, s).toBe("P0004");
    }
    expect(await status(o.id)).toBe("ready");
  });

  it("un pedido con envío puede saltar pasos, como uno sin envío", async () => {
    const o = await courierOrder();
    await courierAction(ANA, o.id, "accept");
    expect((await setStatus(ANA, o.id, "ready")).ok).toBe(true);
    const back = await setStatus(ANA, o.id, "confirmed");
    expect(!back.ok && back.code).toBe("P0004");
  });

  it("sin envío no existen Entregado al repartidor ni En camino (P0004)", async () => {
    const r = await order("beto", FERNET, { delivery: "delivery" });
    const id = await orderId(created(r)!.code);

    for (const s of ["handed_to_courier", "on_the_way"]) {
      const res = await setStatus(BETO, id, s);
      expect(!res.ok && res.code, s).toBe("P0004");
    }
    expect((await setStatus(BETO, id, "confirmed")).ok).toBe(true);
    expect((await setStatus(BETO, id, "ready")).ok).toBe(true);
    expect((await setStatus(BETO, id, "delivered")).ok).toBe(true);
  });

  it("courier_set_status: solo el repartidor del pedido y solo en orden", async () => {
    const o = await courierOrder();
    await courierAction(ANA, o.id, "accept");
    for (const s of ["confirmed", "preparing", "ready"]) await setStatus(ANA, o.id, s);

    const temprano = await courierStatus(REPA, o.id, "on_the_way");
    expect(!temprano.ok && temprano.code).toBe("P0004");

    await setStatus(ANA, o.id, "handed_to_courier");

    const local = await courierStatus(ANA, o.id, "on_the_way");
    expect(!local.ok && local.code).toBe("42501");

    const anon = await courierStatus(null, o.id, "on_the_way");
    expect(anon.ok).toBe(false);

    const salto = await courierStatus(REPA, o.id, "delivered");
    expect(!salto.ok && salto.code).toBe("P0004");

    const desconocido = await courierStatus(REPA, o.id, "ready");
    expect(!desconocido.ok && desconocido.code).toBe("22023");

    expect((await courierStatus(REPA, o.id, "on_the_way")).ok).toBe(true);
  });

  it("courier_set_status no ve pedidos que no son del repartidor", async () => {
    const r = await order("beto", FERNET, { delivery: "delivery" });
    const id = await orderId(created(r)!.code);
    const res = await courierStatus(REPA, id, "on_the_way");
    expect(!res.ok && res.code).toBe("P0002");
  });
});

describe("set_order_courier — ENVIO-11 a 13", () => {
  it("el local consulta y el repartidor acepta, con nota y hora", async () => {
    const o = await courierOrder();

    expect((await courierAction(ANA, o.id, "request")).ok).toBe(true);
    let row = (
      await db.query<Record<string, unknown>>(
        "select courier_status, courier_requested_at, courier_responded_at from orders where id = $1",
        [o.id],
      )
    ).rows[0];
    expect(row.courier_status).toBe("requested");
    expect(row.courier_requested_at).not.toBeNull();
    expect(row.courier_responded_at).toBeNull();

    expect((await courierAction(REPA, o.id, "accept", "Juan")).ok).toBe(true);
    row = (
      await db.query<Record<string, unknown>>(
        "select courier_status, courier_note, courier_responded_at from orders where id = $1",
        [o.id],
      )
    ).rows[0];
    expect(row).toMatchObject({ courier_status: "accepted", courier_note: "Juan" });
    expect(row.courier_responded_at).not.toBeNull();
  });

  it("el local también registra la respuesta (la contestó por WhatsApp)", async () => {
    const o = await courierOrder();
    expect((await courierAction(ANA, o.id, "reject", "No llega")).ok).toBe(true);
    const row = (
      await db.query<{ courier_status: string; courier_note: string }>(
        "select courier_status, courier_note from orders where id = $1",
        [o.id],
      )
    ).rows[0];
    expect(row).toEqual({ courier_status: "rejected", courier_note: "No llega" });
  });

  it("el repartidor no consulta (request es del local)", async () => {
    const o = await courierOrder();
    const r = await courierAction(REPA, o.id, "request");
    expect(!r.ok && r.code).toBe("42501");
  });

  it("quien no es parte del pedido no lo ve (P0002)", async () => {
    const o = await courierOrder();
    for (const user of [BETO, SUPER]) {
      const r = await courierAction(user, o.id, "accept");
      expect(!r.ok && r.code).toBe("P0002");
    }
    const anon = await courierAction(null, o.id, "accept");
    expect(anon.ok).toBe(false);
  });

  it("un pedido sin envío, o una acción desconocida, se rechazan", async () => {
    const sin = await order("ana", CAFE, { delivery: "retiro" });
    const r = await courierAction(ANA, await orderId(created(sin)!.code), "accept");
    expect(!r.ok && r.code).toBe("22023");

    const o = await courierOrder();
    const x = await courierAction(ANA, o.id, "volar");
    expect(!x.ok && x.code).toBe("22023");
  });

  it("un pedido terminado da P0004", async () => {
    const o = await courierOrder();
    await setStatus(ANA, o.id, "cancelled");
    const r = await courierAction(ANA, o.id, "accept");
    expect(!r.ok && r.code).toBe("P0004");
  });

  it("cambiar el precio exige motivo y guarda quién y cuándo; el de lista no cambia", async () => {
    const o = await courierOrder();

    const sinMotivo = await call(
      REPA,
      `select public.set_order_courier('${o.id}', 'accept', 'Juan', p_fee => 6000)`,
    );
    expect(!sinMotivo.ok && sinMotivo.code).toBe("22023");
    // Nada cambió: tampoco la aceptación.
    expect(
      (await db.query<{ courier_status: string }>("select courier_status from orders where id = $1", [o.id]))
        .rows[0].courier_status,
    ).toBe("waiting");

    const ok = await call(
      REPA,
      `select public.set_order_courier('${o.id}', 'accept', 'Juan', p_fee => 6500, p_fee_reason => 'Fuera de zona')`,
    );
    expect(ok.ok).toBe(true);

    const row = (
      await db.query<Record<string, unknown>>(
        "select delivery_fee_list, delivery_fee, delivery_fee_reason, delivery_fee_changed_by, delivery_fee_changed_at from orders where id = $1",
        [o.id],
      )
    ).rows[0];
    expect(row).toMatchObject({
      delivery_fee_list: "5000.00",
      delivery_fee: "6500.00",
      delivery_fee_reason: "Fuera de zona",
      delivery_fee_changed_by: REPA,
    });
    expect(row.delivery_fee_changed_at).not.toBeNull();
  });

  it("el mismo precio no pide motivo ni deja marca de cambio", async () => {
    const o = await courierOrder();
    const r = await call(ANA, `select public.set_order_courier('${o.id}', 'request', null, 5000)`);
    expect(r.ok).toBe(true);
    const row = (
      await db.query<{ delivery_fee_changed_by: string | null }>(
        "select delivery_fee_changed_by from orders where id = $1",
        [o.id],
      )
    ).rows[0];
    expect(row.delivery_fee_changed_by).toBeNull();
  });

  it("cada cambio deja un evento 'delivery' legible que el seguimiento público no muestra", async () => {
    const o = await courierOrder();
    await courierAction(ANA, o.id, "request");
    await call(
      REPA,
      `select public.set_order_courier('${o.id}', 'accept', 'Juan', p_fee => 26000, p_fee_reason => 'fuera de zona')`,
    );

    const ev = await db.query<{ note: string; status: string; changed_by: string }>(
      "select note, status, changed_by from order_events where order_id = $1 and kind = 'delivery' order by note",
      [o.id],
    );
    const notes = ev.rows.map((e) => e.note);
    expect(notes).toHaveLength(3);
    expect(notes.some((n) => /^Envío consultado al repartidor, \d\d:\d\d$/.test(n))).toBe(true);
    expect(notes.some((n) => /^Envío aceptado: Juan, \d\d:\d\d$/.test(n))).toBe(true);
    expect(notes).toContain("Precio del envío: $5.000 → $26.000 (fuera de zona)");
    expect(ev.rows.every((e) => e.status === "pending")).toBe(true);

    const track = await call(null, `select public.public_order_tracking('${o.code}') as t`);
    expect(track.ok).toBe(true);
    const t = (track.ok ? track.rows[0].t : null) as { eventos: { estado: string; nota?: string }[] };
    expect(t.eventos).toHaveLength(1);
    expect(JSON.stringify(t)).not.toMatch(/Envío (aceptado|consultado)|Precio del envío/);
  });
});

describe("lo que lee el repartidor — ENVIO-15", () => {
  it("courier_orders lista los pedidos con envío, nuevos primero, con los datos del cliente", async () => {
    const vieja = await courierOrder();
    await db.exec(`update orders set created_at = now() - interval '1 hour' where id = '${vieja.id}'`);
    const nueva = await courierOrder();

    const r = await call(REPA, "select public.courier_orders() as lista");
    expect(r.ok).toBe(true);
    const lista = (r.ok ? r.rows[0].lista : []) as { id: string; negocio: unknown; cliente: unknown; total: number; items: unknown; envio: unknown; estado: string }[];

    const ids = lista.map((o) => o.id);
    expect(ids.indexOf(nueva.id)).toBeLessThan(ids.indexOf(vieja.id));

    const o = lista.find((x) => x.id === nueva.id)!;
    expect(o.negocio).toEqual({ nombre: "Ana Resto", direccion: "San Martín 100", whatsapp: "5493510000001" });
    expect(o.cliente).toEqual({
      nombre: "Cliente Prueba",
      telefono: "3515551234",
      direccion: "Av. Siempre Viva 742",
    });
    expect(o.total).toBe(2000);
    expect(o.items).toEqual([{ nombre: "Café", cantidad: 2, precio: 1000 }].map((i) => expect.objectContaining(i)));
    expect(o.envio).toMatchObject({ zona: "Cantera", precio_lista: 5000, precio: 5000, estado: "waiting" });
    expect(o.estado).toBe("pending");
  });

  it("no incluye pedidos sin envío ni los terminados hace más de p_since", async () => {
    const sin = await order("beto", FERNET, { delivery: "delivery" });
    const viejo = await courierOrder();
    await setStatus(ANA, viejo.id, "cancelled");
    await db.exec(`update orders set created_at = now() - interval '5 days' where id = '${viejo.id}'`);

    const r = await call(REPA, "select public.courier_orders() as lista");
    const lista = (r.ok ? r.rows[0].lista : []) as { id: string }[];
    const ids = lista.map((o) => o.id);

    expect(ids).not.toContain(await orderId(created(sin)!.code));
    expect(ids).not.toContain(viejo.id);

    const todo = await call(REPA, "select public.courier_orders(now() - interval '30 days') as lista");
    expect(((todo.ok ? todo.rows[0].lista : []) as { id: string }[]).map((o) => o.id)).toContain(viejo.id);
  });

  it("solo la llama el usuario repartidor", async () => {
    for (const user of [null, ANA, BETO, SUPER]) {
      const r = await call(user, "select public.courier_orders() as lista");
      expect(r.ok, String(user)).toBe(false);
    }
  });
});

describe("lo que ve el cliente — ENVIO-16 y 17", () => {
  it("public_delivery_zones entrega el repartidor y sus 39 barrios en orden, sin sesión", async () => {
    const r = await call(null, "select public.public_delivery_zones('ana') as z");
    expect(r.ok).toBe(true);
    const z = (r.ok ? r.rows[0].z : null) as { repartidor: string; zonas: { nombre: string; precio: number }[] };
    expect(z.repartidor).toBe("Repartos al Toque");
    expect(z.zonas).toHaveLength(39);
    expect(z.zonas[0]).toMatchObject({ nombre: "Centro (hasta Av. Koessler)", precio: 4500 });
    expect(Object.keys(z.zonas[0]).sort()).toEqual(["id", "nombre", "precio"]);
  });

  it("es null si el negocio no tiene envío, no existe, no está publicado o no está activo", async () => {
    const nulo = async (slug: string) => {
      const r = await call(null, `select public.public_delivery_zones('${slug}') as z`);
      return r.ok ? r.rows[0].z : "error";
    };

    expect(await nulo("beto")).toBeNull();
    expect(await nulo("fantasma")).toBeNull();

    await db.exec(`update business_settings set published = false where business_id = '${NEG_ANA}'`);
    expect(await nulo("ana")).toBeNull();
    await db.exec(`update business_settings set published = true where business_id = '${NEG_ANA}'`);

    await call(SUPER, `update businesses set active = false where id = '${NEG_ANA}'`);
    expect(await nulo("ana")).toBeNull();
    await call(SUPER, `update businesses set active = true where id = '${NEG_ANA}'`);

    await call(SUPER, `update businesses set plan_completo = false where id = '${NEG_ANA}'`);
    expect(await nulo("ana")).toBeNull();
    await call(SUPER, `update businesses set plan_completo = true where id = '${NEG_ANA}'`);

    await db.exec(`update couriers set active = false where id = '${COURIER}'`);
    expect(await nulo("ana")).toBeNull();
    await db.exec(`update couriers set active = true where id = '${COURIER}'`);

    expect(await nulo("ana")).not.toBeNull();
  });

  it("no muestra los barrios dados de baja", async () => {
    await db.exec("update courier_zones set active = false where name = 'Chacra 30'");
    const r = await call(null, "select public.public_delivery_zones('ana') as z");
    const z = (r.ok ? r.rows[0].z : null) as { zonas: { nombre: string }[] };
    expect(z.zonas).toHaveLength(38);
    expect(z.zonas.map((x) => x.nombre)).not.toContain("Chacra 30");
    await db.exec("update courier_zones set active = true where name = 'Chacra 30'");
  });

  it("public_order_delivery muestra el envío sin teléfono ni dirección", async () => {
    const o = await courierOrder();
    await call(
      REPA,
      `select public.set_order_courier('${o.id}', 'accept', 'Juan', p_fee => 6000, p_fee_reason => 'Lluvia')`,
    );

    const r = await call(null, `select public.public_order_delivery('${o.code}') as d`);
    expect(r.ok).toBe(true);
    const d = r.ok ? r.rows[0].d : null;
    expect(d).toEqual({
      repartidor: "Repartos al Toque",
      zona: "Cantera",
      precio_lista: 5000,
      precio: 6000,
      motivo_cambio: "Lluvia",
      estado: "accepted",
      nota: "Juan",
    });
    expect(JSON.stringify(d)).not.toMatch(/3515551234|Siempre Viva|telefono|direccion/i);
  });

  it("es null con un código inválido, inexistente o de un pedido sin envío", async () => {
    const sin = await order("ana", CAFE, { delivery: "retiro" });
    for (const code of ["xx", "0".repeat(20), created(sin)!.code]) {
      const r = await call(null, `select public.public_order_delivery('${code}') as d`);
      expect(r.ok && r.rows[0].d, code).toBeNull();
    }
  });
});
