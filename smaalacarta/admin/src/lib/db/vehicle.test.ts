// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer, openSearch } from "@/test/offers";

// ENVIO-174 a 178 contra Postgres real: el vehículo del repartidor (moto o auto) y "Necesita auto".
const SUPER = "99999999-0000-0000-0000-000000000009";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const OTRO = "aaaaaaaa-0000-0000-0000-000000000002";
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006";
const AUTO_USER = "cccccccc-0000-0000-0000-000000000007";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_OTRO = "a1a1a1a1-0000-0000-0000-000000000002";
const MOTO = "7a0c0e00-0000-4000-8000-000000000002";
const AUTO = "7a0c0e00-0000-4000-8000-000000000003";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const setMode = (mode: "fixed" | "offers") => db.exec(`update platform_settings set delivery_mode = '${mode}'`);
const setVehicles = (on: boolean) => db.exec(`update platform_settings set vehicle_enabled = ${on}`);

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

// Un pedido con envío a Cantera, con la búsqueda abierta.
async function envio(needsCar = false) {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${await zoneId("Cantera")}'::uuid,
       p_customer_phone => '3515551234',
       p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  if (needsCar) {
    const n = await call(ANA, `select public.set_order_needs_car('${o.id}', true)`);
    if (!n.ok) throw new Error(`no se pudo pedir auto: ${n.error}`);
  }
  await openSearch(db, o.id);
  return { id: o.id, code };
}

const take = (user: string, id: string) => call(user, `select public.courier_take_order('${id}')`);

async function available(user: string) {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].l as { id: string; necesita_auto?: boolean }[];
}

async function delivery(code: string) {
  const r = await call(null, `select public.public_order_delivery('${code}') as d`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].d as Record<string, unknown>;
}

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed" });

  await createUser(db, { id: SUPER, email: "super@x.com" });
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: OTRO, email: "otro@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });
  await createUser(db, { id: AUTO_USER, email: "auto@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_OTRO}', 'Otro Resto', 'otro', '5493510000002', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}'), ('${NEG_OTRO}', '${OTRO}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_ANA}', true, 'San Martín 100'), ('${NEG_OTRO}', true, 'Belgrano 200');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into couriers (id, name, whatsapp, active) values
      ('${MOTO}', 'Moto Express', '5493510000099', true),
      ('${AUTO}', 'Auto Express', '5493510000098', true);
    insert into courier_users (courier_id, user_id) values ('${MOTO}', '${MOTO_USER}'), ('${AUTO}', '${AUTO_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select c, id from delivery_zones, (values ('${MOTO}'::uuid), ('${AUTO}'::uuid)) v(c) where name = 'Cantera';
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Cantera';
    update couriers set auto = true where id = '${AUTO}';
  `);
}, 60_000);

// El freno de 20 pedidos por minuto.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await setMode("fixed");
  await setVehicles(true);
});

afterAll(async () => {
  await db.close();
});

describe("el interruptor — ENVIO-175", () => {
  it("arranca apagado", async () => {
    const fresh = await createTestDb({ before: "20261114000000" });
    const r = await fresh.query<{ vehicle_enabled: boolean }>("select vehicle_enabled from platform_settings");
    expect(r.rows).toEqual([{ vehicle_enabled: false }]);
    await fresh.close();
  }, 60_000);

  it("solo el superadmin lo cambia", async () => {
    await setVehicles(false);
    const a = await call(ANA, "update platform_settings set vehicle_enabled = true");
    expect(a.ok && a.affected).toBe(0);
    const c = await call(AUTO_USER, "update platform_settings set vehicle_enabled = true");
    expect(c.ok && c.affected).toBe(0);
    expect((await db.query("select vehicle_enabled from platform_settings")).rows[0]).toEqual({
      vehicle_enabled: false,
    });

    const s = await call(SUPER, "update platform_settings set vehicle_enabled = true returning vehicle_enabled");
    expect(s.ok && s.rows).toEqual([{ vehicle_enabled: true }]);
  });

  it("cualquier usuario con sesión lo puede preguntar, y refleja el valor", async () => {
    const on = await call(MOTO_USER, "select public.vehicle_enabled() as v");
    expect(on.ok && on.rows[0].v).toBe(true);
    await setVehicles(false);
    const off = await call(MOTO_USER, "select public.vehicle_enabled() as v");
    expect(off.ok && off.rows[0].v).toBe(false);
  });
});

describe("el vehículo del repartidor — ENVIO-174", () => {
  it("los repartidores existentes quedan con Moto", async () => {
    const r = await db.query("select moto, auto from couriers where id = $1", [MOTO]);
    expect(r.rows[0]).toEqual({ moto: true, auto: false });
  });

  it("el repartidor guarda el suyo, con una o las dos", async () => {
    const both = await call(MOTO_USER, "select public.courier_save_vehicles(true, true)");
    expect(both.ok).toBe(true);
    expect((await db.query("select moto, auto from couriers where id = $1", [MOTO])).rows[0]).toEqual({
      moto: true,
      auto: true,
    });

    const onlyMoto = await call(MOTO_USER, "select public.courier_save_vehicles(true, false)");
    expect(onlyMoto.ok).toBe(true);
    expect((await db.query("select moto, auto from couriers where id = $1", [MOTO])).rows[0]).toEqual({
      moto: true,
      auto: false,
    });
  });

  it("exige al menos un vehículo", async () => {
    const none = await call(MOTO_USER, "select public.courier_save_vehicles(false, false)");
    expect(!none.ok && none.code).toBe("22023");
    const nulls = await call(MOTO_USER, "select public.courier_save_vehicles(null, null)");
    expect(nulls.ok).toBe(false);
    expect((await db.query("select moto, auto from couriers where id = $1", [MOTO])).rows[0]).toEqual({
      moto: true,
      auto: false,
    });
    // Tampoco por la tabla.
    await expect(db.exec(`update couriers set moto = false, auto = false where id = '${MOTO}'`)).rejects.toThrow();
  });

  it("solo el propio repartidor lo cambia: ni el local ni otro repartidor ni sin sesión", async () => {
    expect((await call(ANA, "select public.courier_save_vehicles(true, true)")).ok).toBe(false);
    expect((await call(null, "select public.courier_save_vehicles(true, true)")).ok).toBe(false);
    for (const user of [ANA, AUTO_USER, MOTO_USER]) {
      const direct = await call(user, `update couriers set auto = true, moto = true where id = '${MOTO}'`);
      expect(direct.ok && direct.affected).toBe(0);
    }
    expect((await db.query("select moto, auto from couriers where id = $1", [MOTO])).rows[0]).toEqual({
      moto: true,
      auto: false,
    });
  });

  it("el superadmin lo ve", async () => {
    const r = await call(SUPER, `select id, moto, auto from couriers where id in ('${AUTO}', '${MOTO}') order by name`);
    expect(r.ok && r.rows).toEqual([
      { id: AUTO, moto: true, auto: true },
      { id: MOTO, moto: true, auto: false },
    ]);
  });
});

describe("Necesita auto — ENVIO-176", () => {
  it("nace apagado", async () => {
    const { id } = await envio();
    expect((await db.query("select needs_car from orders where id = $1", [id])).rows[0]).toEqual({ needs_car: false });
  });

  it("el local lo prende y lo apaga mientras no haya repartidor", async () => {
    const { id } = await envio();
    expect((await call(ANA, `select public.set_order_needs_car('${id}', true)`)).ok).toBe(true);
    expect((await db.query("select needs_car from orders where id = $1", [id])).rows[0]).toEqual({ needs_car: true });
    expect((await call(ANA, `select public.set_order_needs_car('${id}', false)`)).ok).toBe(true);
    expect((await db.query("select needs_car from orders where id = $1", [id])).rows[0]).toEqual({ needs_car: false });
  });

  it("con repartidor asignado da error y no cambia nada", async () => {
    const { id } = await envio();
    expect((await take(MOTO_USER, id)).ok).toBe(true);
    const r = await call(ANA, `select public.set_order_needs_car('${id}', true)`);
    expect(!r.ok && r.code).toBe("P0004");
    expect((await db.query("select needs_car from orders where id = $1", [id])).rows[0]).toEqual({ needs_car: false });
  });

  it("solo un miembro del negocio del pedido: ni otro local, ni repartidor, ni cliente", async () => {
    const { id } = await envio();
    const otro = await call(OTRO, `select public.set_order_needs_car('${id}', true)`);
    expect(!otro.ok && otro.code).toBe("P0002");
    expect((await call(MOTO_USER, `select public.set_order_needs_car('${id}', true)`)).ok).toBe(false);
    expect((await call(null, `select public.set_order_needs_car('${id}', true)`)).ok).toBe(false);

    for (const user of [ANA, OTRO, MOTO_USER, null]) {
      const direct = await call(user, `update orders set needs_car = true where id = '${id}'`);
      expect(!direct.ok || direct.affected === 0).toBe(true);
    }
    expect((await db.query("select needs_car from orders where id = $1", [id])).rows[0]).toEqual({ needs_car: false });
  });

  it("pedir auto cierra las ofertas abiertas de quienes no tienen auto", async () => {
    await setMode("offers");
    const { id } = await envio();
    await offer(db, MOTO_USER, id);
    await offer(db, AUTO_USER, id);

    expect((await call(ANA, `select public.set_order_needs_car('${id}', true)`)).ok).toBe(true);

    const open = await db.query("select courier_id from courier_offers where order_id = $1 and closed_at is null", [id]);
    expect(open.rows).toEqual([{ courier_id: AUTO }]);
  });

  it("un pedido sin envío con repartidor no pide auto", async () => {
    const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
    const r = await call(
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null, '${items}'::jsonb,
         p_customer_phone => '3515551234') as result`,
    );
    expect(r.ok).toBe(true);
    const code = (r.ok && (r.rows[0].result as { code: string }).code) as string;
    const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
    const n = await call(ANA, `select public.set_order_needs_car('${o.id}', true)`);
    expect(!n.ok && n.code).toBe("P0004");
  });
});

describe("quién ve un pedido que necesita auto — ENVIO-177", () => {
  it("precio fijo: lo ve y lo toma solo quien tiene auto", async () => {
    const { id } = await envio(true);

    expect((await available(MOTO_USER)).map((o) => o.id)).not.toContain(id);
    const blocked = await take(MOTO_USER, id);
    expect(!blocked.ok && blocked.code).toBe("P0024");
    expect((await db.query("select courier_id from orders where id = $1", [id])).rows[0]).toEqual({
      courier_id: null,
    });

    const list = await available(AUTO_USER);
    expect(list.find((o) => o.id === id)?.necesita_auto).toBe(true);
    expect((await take(AUTO_USER, id)).ok).toBe(true);
    expect((await db.query("select courier_id from orders where id = $1", [id])).rows[0]).toEqual({ courier_id: AUTO });
  });

  it("un pedido que no pide auto lo ven los dos", async () => {
    const { id } = await envio();
    expect((await available(MOTO_USER)).map((o) => o.id)).toContain(id);
    expect((await available(AUTO_USER)).map((o) => o.id)).toContain(id);
    expect((await available(MOTO_USER)).find((o) => o.id === id)?.necesita_auto).toBeFalsy();
  });

  it("ofertas: el repartidor sin auto no oferta; el que tiene auto, sí", async () => {
    await setMode("offers");
    const { id } = await envio(true);

    const blocked = await offer(db, MOTO_USER, id);
    expect(!blocked.ok && blocked.code).toBe("P0024");
    expect((await offer(db, AUTO_USER, id)).ok).toBe(true);
    expect((await db.query("select courier_id from courier_offers where order_id = $1", [id])).rows).toEqual([
      { courier_id: AUTO },
    ]);
  });

  it("asignación a mano: el local no puede asignar a uno sin auto", async () => {
    const { id } = await envio(true);

    const blocked = await call(ANA, `select public.business_assign_courier('${id}', '${MOTO}', null)`);
    expect(!blocked.ok && blocked.code).toBe("P0024");
    const ok = await call(ANA, `select public.business_assign_courier('${id}', '${AUTO}', null)`);
    expect(ok.ok).toBe(true);
  });

  it("con el interruptor apagado no se filtra a nadie", async () => {
    const { id } = await envio(true);
    await setVehicles(false);

    const list = await available(MOTO_USER);
    expect(list.map((o) => o.id)).toContain(id);
    expect(list.find((o) => o.id === id)?.necesita_auto).toBeFalsy();
    expect((await take(MOTO_USER, id)).ok).toBe(true);
  });

  it("apagado, la asignación a mano y las ofertas tampoco filtran", async () => {
    await setMode("offers");
    const { id } = await envio(true);
    await setVehicles(false);

    expect((await offer(db, MOTO_USER, id)).ok).toBe(true);
    const ok = await call(ANA, `select public.business_assign_courier('${id}', '${MOTO}', null)`);
    expect(ok.ok).toBe(true);
  });

  it("el local ve el vehículo de cada candidato para asignar a mano, solo prendido", async () => {
    const on = await call(ANA, "select public.business_delivery_options() as o");
    const couriers = (on.ok && (on.rows[0].o as { couriers: { id: string; vehiculo?: string[] }[] }).couriers) || [];
    expect(couriers.find((c) => c.id === AUTO)?.vehiculo).toEqual(["moto", "auto"]);
    expect(couriers.find((c) => c.id === MOTO)?.vehiculo).toEqual(["moto"]);

    await setVehicles(false);
    const off = await call(ANA, "select public.business_delivery_options() as o");
    const offCouriers = (off.ok && (off.rows[0].o as { couriers: { vehiculo?: string[] }[] }).couriers) || [];
    expect(offCouriers.every((c) => c.vehiculo === undefined)).toBe(true);
  });
});

describe("dónde se ve el vehículo — ENVIO-178", () => {
  it("el seguimiento suma el vehículo del repartidor asignado, solo prendido", async () => {
    const { id, code } = await envio();
    expect((await take(AUTO_USER, id)).ok).toBe(true);

    expect((await delivery(code)).vehiculo).toEqual(["moto", "auto"]);
    await setVehicles(false);
    expect((await delivery(code)).vehiculo).toBeUndefined();
  });

  it("cada oferta del seguimiento y del local trae el vehículo", async () => {
    await setMode("offers");
    const { id, code } = await envio();
    await offer(db, MOTO_USER, id);
    await offer(db, AUTO_USER, id);

    const tracking = (await delivery(code)).ofertas as { repartidor: string; vehiculo?: string[] }[];
    expect(tracking.find((o) => o.repartidor === "Auto Express")?.vehiculo).toEqual(["moto", "auto"]);
    expect(tracking.find((o) => o.repartidor === "Moto Express")?.vehiculo).toEqual(["moto"]);

    const local = await call(ANA, "select public.business_order_offers() as l");
    const rows = (local.ok && (local.rows[0].l as { order_id: string; ofertas: { repartidor: string; vehiculo?: string[] }[] }[])) || [];
    const mine = rows.find((r) => r.order_id === id)?.ofertas ?? [];
    expect(mine.find((o) => o.repartidor === "Auto Express")?.vehiculo).toEqual(["moto", "auto"]);

    await setVehicles(false);
    const off = (await delivery(code)).ofertas as { vehiculo?: string[] }[];
    expect(off.every((o) => o.vehiculo === undefined)).toBe(true);
  });
});
