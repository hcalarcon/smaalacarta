// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer, openSearch } from "@/test/offers";

// ENVIO-203 a 207 contra Postgres real: con qué vehículos trabaja cada negocio.
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
let cantera: string;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const setVehicles = (on: boolean) => db.exec(`update platform_settings set vehicle_enabled = ${on}`);
const save = (user: string, moto: boolean, auto: boolean) =>
  call(user, `select public.save_business_vehicles(${moto}, ${auto})`);
const take = (user: string, id: string) => call(user, `select public.courier_take_order('${id}')`);
const turn = (user: string, on: boolean) => call(user, `select public.courier_set_available(${on})`);

const businessRow = async (id: string) =>
  (
    await db.query<{ vehicle_moto: boolean; vehicle_auto: boolean }>(
      "select vehicle_moto, vehicle_auto from business_settings where business_id = $1",
      [id],
    )
  ).rows[0];

async function envio() {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${cantera}'::uuid, p_customer_phone => '3515551234',
       p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  await openSearch(db, o.id);
  return { id: o.id, code };
}

async function listed(user: string) {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0].l as { id: string }[]).map((o) => o.id);
}

async function total() {
  const r = await call(ANA, `select public.business_courier_availability('${NEG_ANA}') as v`);
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0].v as { total: number }).total;
}

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed", courierAvailability: true });

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: OTRO, email: "otro@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });
  await createUser(db, { id: AUTO_USER, email: "auto@x.com" });

  await db.exec(`
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
    insert into couriers (id, name, whatsapp, active, moto, auto) values
      ('${MOTO}', 'Moto Express', '5493510000099', true, true, false),
      ('${AUTO}', 'Auto Express', '5493510000098', true, false, true);
    insert into courier_users (courier_id, user_id) values ('${MOTO}', '${MOTO_USER}'), ('${AUTO}', '${AUTO_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select c, id from delivery_zones, (values ('${MOTO}'::uuid), ('${AUTO}'::uuid)) v(c) where name = 'Cantera';
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Cantera';
  `);
  cantera = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
}, 60_000);

beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await db.exec("update platform_settings set delivery_mode = 'fixed'");
  await setVehicles(true);
  await db.exec("update business_settings set vehicle_moto = true, vehicle_auto = true");
  await db.exec("delete from courier_availability");
});

afterAll(async () => {
  await db.close();
});

describe("los vehículos del negocio — ENVIO-203", () => {
  it("los negocios que ya existían quedan con los dos", async () => {
    expect(await businessRow(NEG_ANA)).toEqual({ vehicle_moto: true, vehicle_auto: true });
    expect(await businessRow(NEG_OTRO)).toEqual({ vehicle_moto: true, vehicle_auto: true });
  });

  it("el negocio guarda los suyos", async () => {
    expect((await save(ANA, true, false)).ok).toBe(true);
    expect(await businessRow(NEG_ANA)).toEqual({ vehicle_moto: true, vehicle_auto: false });
  });

  it("exige al menos un vehículo", async () => {
    const r = await save(ANA, false, false);
    expect(!r.ok && r.code).toBe("22023");
    expect(await businessRow(NEG_ANA)).toEqual({ vehicle_moto: true, vehicle_auto: true });
    await expect(db.exec("update business_settings set vehicle_moto = false, vehicle_auto = false")).rejects.toThrow();
  });

  it("un negocio no cambia la configuración de otro; ni un repartidor ni sin sesión", async () => {
    expect((await save(OTRO, false, true)).ok).toBe(true);
    expect(await businessRow(NEG_OTRO)).toEqual({ vehicle_moto: false, vehicle_auto: true });
    expect(await businessRow(NEG_ANA)).toEqual({ vehicle_moto: true, vehicle_auto: true });

    const courier = await save(MOTO_USER, false, true);
    expect(courier.ok).toBe(false);
    const anon = await save("00000000-0000-0000-0000-00000000dead", false, true);
    expect(anon.ok).toBe(false);
    expect(await businessRow(NEG_ANA)).toEqual({ vehicle_moto: true, vehicle_auto: true });
  });
});

describe("quién ve y toma el pedido de un negocio — ENVIO-204", () => {
  it("negocio solo Moto: el repartidor solo Auto no lo ve ni lo toma; el de moto, sí", async () => {
    await save(ANA, true, false);
    const { id } = await envio();

    expect(await listed(AUTO_USER)).not.toContain(id);
    const blocked = await take(AUTO_USER, id);
    expect(!blocked.ok && blocked.code).toBe("P0024");

    expect(await listed(MOTO_USER)).toContain(id);
    expect((await take(MOTO_USER, id)).ok).toBe(true);
  });

  it("negocio con los dos: lo ven todos", async () => {
    const { id } = await envio();
    expect(await listed(MOTO_USER)).toContain(id);
    expect(await listed(AUTO_USER)).toContain(id);
  });

  it("negocio solo Auto: el de moto no lo ve", async () => {
    await save(ANA, false, true);
    const { id } = await envio();
    expect(await listed(MOTO_USER)).not.toContain(id);
    expect(await listed(AUTO_USER)).toContain(id);
  });

  it("ofertas: el repartidor que no sirve no oferta", async () => {
    await db.exec("update platform_settings set delivery_mode = 'offers'");
    await save(ANA, true, false);
    const { id } = await envio();

    const blocked = await offer(db, AUTO_USER, id);
    expect(!blocked.ok && blocked.code).toBe("P0024");
    expect((await offer(db, MOTO_USER, id)).ok).toBe(true);
  });

  it("asignación a mano: el local no puede asignar a uno que no sirve", async () => {
    await save(ANA, true, false);
    const { id } = await envio();

    const blocked = await call(ANA, `select public.business_assign_courier('${id}', '${AUTO}', null)`);
    expect(!blocked.ok && blocked.code).toBe("P0024");
    expect((await call(ANA, `select public.business_assign_courier('${id}', '${MOTO}', null)`)).ok).toBe(true);
  });

  it("al cambiar los vehículos se cierran las ofertas de quien ya no sirve", async () => {
    await db.exec("update platform_settings set delivery_mode = 'offers'");
    const { id } = await envio();
    expect((await offer(db, AUTO_USER, id)).ok).toBe(true);
    expect((await offer(db, MOTO_USER, id)).ok).toBe(true);

    await save(ANA, true, false);

    const open = await db.query<{ courier_id: string }>(
      "select courier_id from courier_offers where order_id = $1 and closed_at is null",
      [id],
    );
    expect(open.rows).toEqual([{ courier_id: MOTO }]);
  });

  it("con el interruptor apagado no se filtra nada", async () => {
    await save(ANA, true, false);
    const { id } = await envio();
    await setVehicles(false);

    expect(await listed(AUTO_USER)).toContain(id);
    expect((await take(AUTO_USER, id)).ok).toBe(true);
  });

  it("necesita auto sigue filtrando dentro de un negocio con los dos", async () => {
    const { id } = await envio();
    await call(ANA, `select public.set_order_needs_car('${id}', true)`);

    expect(await listed(MOTO_USER)).not.toContain(id);
    expect(await listed(AUTO_USER)).toContain(id);
  });
});

describe("el conteo de disponibles respeta el vehículo — ENVIO-207", () => {
  it("el panel del local y el seguimiento cuentan solo a quienes sirven", async () => {
    expect((await turn(AUTO_USER, true)).ok).toBe(true);
    const { code } = await envio();

    await save(ANA, true, false);
    expect(await total()).toBe(0);
    const none = await call(null, `select public.public_order_has_couriers('${code}') as v`);
    expect(none.ok && none.rows[0].v).toBe(false);

    expect((await turn(MOTO_USER, true)).ok).toBe(true);
    expect(await total()).toBe(1);
    const some = await call(null, `select public.public_order_has_couriers('${code}') as v`);
    expect(some.ok && some.rows[0].v).toBe(true);
  });

  it("el menú, con el negocio, también; sin el negocio cuenta a todos", async () => {
    await turn(AUTO_USER, true);
    await save(ANA, true, false);

    const withBusiness = await call(
      null,
      `select public.public_zone_has_couriers('${cantera}', '${NEG_ANA}') as v`,
    );
    expect(withBusiness.ok && withBusiness.rows[0].v).toBe(false);
    const without = await call(null, `select public.public_zone_has_couriers('${cantera}') as v`);
    expect(without.ok && without.rows[0].v).toBe(true);
  });

  it("apagado el interruptor, cuentan todos", async () => {
    await turn(AUTO_USER, true);
    await save(ANA, true, false);
    await setVehicles(false);

    expect(await total()).toBe(1);
  });
});
