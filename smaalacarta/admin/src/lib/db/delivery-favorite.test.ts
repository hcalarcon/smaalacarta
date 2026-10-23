// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { openSearch } from "@/test/offers";

// ENVIO-229 a 232 contra Postgres real: favorito y asignación a mano con zonas propias del repartidor.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const SUPER = "dddddddd-0000-0000-0000-000000000004";
const NEG = "a1a1a1a1-0000-0000-0000-000000000001";
const SOLO_PROPIAS = "7a0c0e00-0000-4000-8000-000000000010"; // solo zonas propias, no cubre zonas comunes
const COMUN = "7a0c0e00-0000-4000-8000-000000000011"; // cubre zonas comunes, sin zonas propias
const SIN_NADA = "7a0c0e00-0000-4000-8000-000000000012";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;
let cantera: string;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const business = (sql: string) => db.exec(`update businesses set ${sql} where id = '${NEG}'`);
const favorite = async () =>
  (await db.query<{ f: string | null }>("select favorite_courier_id as f from business_settings where business_id = $1", [NEG]))
    .rows[0].f;

async function zones() {
  const r = await call(null, "select public.public_delivery_zones('ana') as z");
  if (!r.ok) throw new Error(r.error);
  const z = r.rows[0].z as { zonas: { id: string; nombre: string }[] } | null;
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
  if (!r.ok) throw new Error(r.error);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  await openSearch(db, o.id);
  return o.id;
}

const assign = (user: string, order: string, courier: string) =>
  call(user, `select public.business_assign_courier('${order}', '${courier}')`);
// `null` es "Sin favorito" a propósito: hay que decirlo con `p_clear` (ENVIO-233).
const setFavorite = (user: string, courier: string | null) =>
  call(
    user,
    courier
      ? `select public.superadmin_set_favorite_courier('${NEG}', '${courier}')`
      : `select public.superadmin_set_favorite_courier('${NEG}', null, true)`,
  );

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "offers" });

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: SUPER, email: "super@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG}', 'Ana Resto', 'ana', '5493510000001', true, true);
    insert into business_users (business_id, user_id) values ('${NEG}', '${ANA}');
    insert into business_settings (business_id, published, address) values ('${NEG}', true, 'San Martín 100');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into couriers (id, name, whatsapp, active) values
      ('${SOLO_PROPIAS}', 'Solo propias', '5493510000099', true),
      ('${COMUN}', 'Común', '5493510000098', true),
      ('${SIN_NADA}', 'Sin nada', '5493510000097', true);
    delete from business_delivery_zones;
    delete from courier_zone_coverage;
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${COMUN}', id from delivery_zones where name = 'Cantera';
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG}', id from delivery_zones where name = 'Cantera';
    insert into courier_own_zones (courier_id, name, price) values ('${SOLO_PROPIAS}', 'Barrio Norte', 1500);
  `);
  cantera = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    update orders set status = 'cancelled' where status not in ('delivered', 'cancelled');
    update businesses set delivery_pricing = 'common' where id = '${NEG}';
    update business_settings set favorite_courier_id = null;
  `);
});

afterAll(async () => {
  await db.close();
});

describe("el superadmin fija el favorito — ENVIO-229", () => {
  it("un repartidor sin zonas comunes, y el menú muestra sus zonas", async () => {
    await business("delivery_pricing = 'courier'");
    expect((await setFavorite(SUPER, SOLO_PROPIAS)).ok).toBe(true);

    expect(await favorite()).toBe(SOLO_PROPIAS);
    expect((await zones())?.map((z) => z.nombre)).toEqual(["Barrio Norte"]);
  });

  it("rechaza a un repartidor sin zonas propias activas, o inactivo", async () => {
    await business("delivery_pricing = 'courier'");

    const sin = await setFavorite(SUPER, SIN_NADA);
    expect(!sin.ok && sin.code).toBe("P0017");

    await db.exec(`update courier_own_zones set active = false where courier_id = '${SOLO_PROPIAS}'`);
    expect((await setFavorite(SUPER, SOLO_PROPIAS)).ok).toBe(false);
    await db.exec(`update courier_own_zones set active = true where courier_id = '${SOLO_PROPIAS}'`);

    await db.exec(`update couriers set active = false where id = '${SOLO_PROPIAS}'`);
    expect((await setFavorite(SUPER, SOLO_PROPIAS)).ok).toBe(false);
    await db.exec(`update couriers set active = true where id = '${SOLO_PROPIAS}'`);
  });

  it("solo el superadmin la llama; el superadmin también puede sacarlo", async () => {
    await business("delivery_pricing = 'courier'");
    const local = await setFavorite(ANA, SOLO_PROPIAS);
    expect(!local.ok && local.code).toBe("42501");

    await setFavorite(SUPER, SOLO_PROPIAS);
    expect((await setFavorite(SUPER, null)).ok).toBe(true);
    expect(await favorite()).toBeNull();
  });
});

describe("sacar el favorito solo a propósito — ENVIO-233", () => {
  const OTRO = "a2a2a2a2-0000-0000-0000-000000000002";

  it("un null sin avisar que es a propósito no saca el favorito", async () => {
    await business("delivery_pricing = 'courier'");
    await setFavorite(SUPER, SOLO_PROPIAS);

    const r = await call(SUPER, `select public.superadmin_set_favorite_courier('${NEG}', null)`);
    expect(!r.ok && r.code).toBe("22023");
    expect(await favorite()).toBe(SOLO_PROPIAS);
  });

  it("no se puede pedir 'sacar' y a la vez fijar a alguien", async () => {
    const r = await call(SUPER, `select public.superadmin_set_favorite_courier('${NEG}', '${SOLO_PROPIAS}', true)`);
    expect(!r.ok && r.code).toBe("22023");
  });

  it("sacar solo toca el favorito: el resto de la configuración queda igual", async () => {
    await business("delivery_pricing = 'courier'");
    await setFavorite(SUPER, SOLO_PROPIAS);
    expect((await setFavorite(SUPER, null)).ok).toBe(true);

    const row = (await db.query<{ published: boolean; address: string; f: string | null }>(
      "select published, address, favorite_courier_id as f from business_settings where business_id = $1",
      [NEG],
    )).rows[0];
    expect(row).toEqual({ published: true, address: "San Martín 100", f: null });
  });

  it("sacar el favorito de un negocio sin configuración no crea una fila vacía", async () => {
    await db.exec(`
      insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery)
      values ('${OTRO}', 'Otro', 'otro', '5493510000002', true, true)`);

    const r = await call(SUPER, `select public.superadmin_set_favorite_courier('${OTRO}', null, true)`);
    expect(r.ok).toBe(true);
    const rows = await db.query("select 1 from business_settings where business_id = $1", [OTRO]);
    expect(rows.rows).toHaveLength(0);

    await db.exec(`delete from businesses where id = '${OTRO}'`);
  });

  it("un local no puede vaciar el favorito fijado con un upsert que trae null", async () => {
    await business("delivery_pricing = 'courier'");
    await setFavorite(SUPER, SOLO_PROPIAS);

    const r = await call(
      ANA,
      `insert into business_settings (business_id, favorite_courier_id) values ('${NEG}', null)
         on conflict (business_id) do update set favorite_courier_id = excluded.favorite_courier_id`,
    );
    expect(!r.ok && r.code).toBe("P0030");
    expect(await favorite()).toBe(SOLO_PROPIAS);
  });
});

describe("el local con tipo courier — ENVIO-230", () => {
  const choose = (courier: string | null) =>
    call(ANA, `select public.set_courier_preferences(${courier ? `'${courier}'` : "null"})`);

  it("no cambia el favorito, ni elegirlo ni sacarlo", async () => {
    await business("delivery_pricing = 'courier'");
    await setFavorite(SUPER, SOLO_PROPIAS);

    const otro = await choose(COMUN);
    expect(!otro.ok && otro.code).toBe("P0030");
    const sacar = await choose(null);
    expect(!sacar.ok && sacar.code).toBe("P0030");
    expect(await favorite()).toBe(SOLO_PROPIAS);

    // Guardar el mismo favorito (lo hace guardar Configuración) no es un cambio.
    expect((await choose(SOLO_PROPIAS)).ok).toBe(true);
  });

  it("con los otros tipos sigue como hoy: elige uno que cubre zonas, no uno que solo tiene zonas propias", async () => {
    expect((await choose(COMUN)).ok).toBe(true);
    expect(await favorite()).toBe(COMUN);

    const propias = await choose(SOLO_PROPIAS);
    expect(!propias.ok && propias.code).toBe("P0017");
  });
});

describe("guardar Configuración con el favorito fijado — ENVIO-230", () => {
  it("el local guarda sus ajustes sin tocar el favorito, que queda como estaba", async () => {
    await business("delivery_pricing = 'courier'");
    expect((await setFavorite(SUPER, SOLO_PROPIAS)).ok).toBe(true);

    const guardar = await call(
      ANA,
      `select public.save_business_settings(
         '${NEG}'::uuid, true, 'moderno', '', '#463AE5', '#9A6CE0', null, '{}'::jsonb, '5493510000000', '', '', '',
         false, '', null::date, null, null, 'claro', array['delivery']::text[], array['efectivo']::text[], null, null,
         true, 30, false, '{}'::jsonb, 50, 50, true)`,
    );

    expect(guardar.ok).toBe(true);
    expect(await favorite()).toBe(SOLO_PROPIAS);
  });

  it("el superadmin ve el favorito guardado, no el efectivo", async () => {
    await business("delivery_pricing = 'courier'");
    const pricing = async () => {
      const r = await call(SUPER, `select public.business_delivery_pricing('${NEG}') as p`);
      if (!r.ok) throw new Error(r.error);
      return r.rows[0].p as { favorite_id: string | null };
    };

    expect((await pricing()).favorite_id).toBeNull();
    await setFavorite(SUPER, SOLO_PROPIAS);
    expect((await pricing()).favorite_id).toBe(SOLO_PROPIAS);
  });
});

describe("el tablero y la asignación a mano — ENVIO-231 y 232", () => {
  it("las opciones traen las zonas propias y al repartidor que solo tiene esas", async () => {
    const r = await call(ANA, "select public.business_delivery_options() as o");
    if (!r.ok) throw new Error(r.error);
    const options = r.rows[0].o as { couriers: { id: string; zone_ids: string[]; own_zone_ids: string[] }[] };

    const own = options.couriers.find((c) => c.id === SOLO_PROPIAS);
    expect(own?.zone_ids).toEqual([]);
    expect(own?.own_zone_ids).toHaveLength(1);
    expect(options.couriers.find((c) => c.id === COMUN)?.own_zone_ids).toEqual([]);
    expect(options.couriers.some((c) => c.id === SIN_NADA)).toBe(false);
  });

  it("pedido con zona propia: se asigna al dueño y se rechaza a otro", async () => {
    await business("delivery_pricing = 'courier'");
    await setFavorite(SUPER, SOLO_PROPIAS);
    const zone = (await zones())![0].id;
    const id = await envio(zone);

    const otro = await assign(ANA, id, COMUN);
    expect(!otro.ok && otro.code).toBe("22023");

    expect((await assign(ANA, id, SOLO_PROPIAS)).ok).toBe(true);
    const o = (await db.query<{ c: string; s: string }>("select courier_id as c, courier_status as s from orders where id = $1", [id]))
      .rows[0];
    expect(o).toEqual({ c: SOLO_PROPIAS, s: "accepted" });
  });

  it("pedido con zona común: sigue igual (asigna a quien la cubre, rechaza al que solo tiene zonas propias)", async () => {
    const id = await envio(cantera);

    const propias = await assign(ANA, id, SOLO_PROPIAS);
    expect(!propias.ok && propias.code).toBe("22023");
    expect((await assign(ANA, id, COMUN)).ok).toBe(true);
  });
});
