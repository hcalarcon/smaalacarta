// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asService, asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer, openSearch } from "@/test/offers";

// ENVIO-191 a 202 contra Postgres real: el repartidor "Disponible", su registro de cambios, el apagado
// automático y los avisos de "no hay repartidores".
const SUPER = "99999999-0000-0000-0000-000000000009";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const OTRO = "aaaaaaaa-0000-0000-0000-000000000002";
const UNO_USER = "cccccccc-0000-0000-0000-000000000006";
const DOS_USER = "cccccccc-0000-0000-0000-000000000007";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_OTRO = "a1a1a1a1-0000-0000-0000-000000000002";
const UNO = "7a0c0e00-0000-4000-8000-000000000002";
const DOS = "7a0c0e00-0000-4000-8000-000000000003";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;
let cantera: string;
let alta: string;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const turn = (user: string, on: boolean) => call(user, `select public.courier_set_available(${on})`);
const setSwitch = (on: boolean) => db.exec(`update platform_settings set courier_availability_enabled = ${on}`);
const setTerms = (on: boolean) => db.exec(`update platform_settings set courier_terms_required = ${on}`);
const accept = (user: string, version = 1) => call(user, `select public.courier_accept_terms(${version})`);
const take = (user: string, id: string) => call(user, `select public.courier_take_order('${id}')`);

async function envio(zone = cantera, slug = "ana") {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('${slug}', 'Cliente Prueba', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${zone}'::uuid, p_customer_phone => '3515551234',
       p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  await openSearch(db, o.id);
  return { id: o.id, code };
}

const zoneHas = async (user: string | null, zone: string) => {
  const r = await call(user, `select public.public_zone_has_couriers('${zone}') as v`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].v as boolean;
};

const orderHas = async (code: string) => {
  const r = await call(null, `select public.public_order_has_couriers('${code}') as v`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].v as boolean | null;
};

const events = async (courier: string) =>
  (
    await db.query<{ available: boolean; reason: string }>(
      "select available, reason from courier_availability_events where courier_id = $1 order by at, id",
      [courier],
    )
  ).rows;

const forgetActivity = (courier: string, hours: number) =>
  db.exec(
    `update courier_availability set last_activity_at = now() - interval '${hours} hours' where courier_id = '${courier}'`,
  );

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed", courierAvailability: true });

  await createUser(db, { id: SUPER, email: "super@x.com" });
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: OTRO, email: "otro@x.com" });
  await createUser(db, { id: UNO_USER, email: "uno@x.com" });
  await createUser(db, { id: DOS_USER, email: "dos@x.com" });

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
      ('${UNO}', 'Uno Express', '5493510000099', true),
      ('${DOS}', 'Dos Express', '5493510000098', true);
    insert into courier_users (courier_id, user_id) values ('${UNO}', '${UNO_USER}'), ('${DOS}', '${DOS_USER}');
    delete from business_delivery_zones;
  `);

  cantera = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
  alta = (
    await db.query<{ id: string }>("select id from delivery_zones where active and name <> 'Cantera' order by name limit 1")
  ).rows[0].id;

  // Ana envía a Cantera; Otro, a la otra zona. UNO cubre Cantera; DOS, la otra.
  await db.exec(`
    insert into business_delivery_zones (business_id, zone_id) values ('${NEG_ANA}', '${cantera}'), ('${NEG_OTRO}', '${alta}');
    insert into courier_zone_coverage (courier_id, zone_id) values ('${UNO}', '${cantera}'), ('${DOS}', '${alta}');
  `);
}, 60_000);

beforeEach(async () => {
  // El freno de 20 pedidos por minuto.
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await db.exec("delete from courier_availability");
  await db.exec("delete from courier_availability_events");
  await setSwitch(true);
  await setTerms(false);
  await db.exec("update platform_settings set delivery_mode = 'fixed'");
});

afterAll(async () => {
  await db.close();
});

describe("el interruptor del repartidor — ENVIO-191", () => {
  it("todos arrancan No disponible", async () => {
    const r = await call(UNO_USER, "select public.courier_availability_status() as s");
    expect(r.ok && r.rows[0].s).toMatchObject({ enabled: true, available: false });
  });

  it("prender y apagar cambia el estado y deja desde cuándo está prendido", async () => {
    expect((await turn(UNO_USER, true)).ok).toBe(true);
    const on = await call(UNO_USER, "select public.courier_availability_status() as s");
    const s = on.ok ? (on.rows[0].s as Record<string, unknown>) : {};
    expect(s).toMatchObject({ available: true });
    expect(typeof s.since).toBe("string");
    expect(typeof s.expires_at).toBe("string");

    expect((await turn(UNO_USER, false)).ok).toBe(true);
    const off = await call(UNO_USER, "select public.courier_availability_status() as s");
    expect(off.ok && off.rows[0].s).toMatchObject({ available: false });
  });

  it("solo el repartidor lo cambia, y solo el suyo", async () => {
    const ana = await turn(ANA, true);
    expect(!ana.ok && ana.code).toBe("42501");
    const anon = await call(null, "select public.courier_set_available(true)");
    expect(anon.ok).toBe(false);

    await turn(UNO_USER, true);
    // Ni con una escritura directa, ni sobre la fila de otro.
    const upd = await call(DOS_USER, `update courier_availability set available = true where courier_id = '${UNO}'`);
    expect(upd.ok && upd.affected).toBe(0);
    const ins = await call(
      DOS_USER,
      `insert into courier_availability (courier_id, available, since, last_activity_at) values ('${DOS}', true, now(), now())`,
    );
    expect(ins.ok).toBe(false);
    expect((await db.query("select count(*)::int as n from courier_availability")).rows[0]).toEqual({ n: 1 });
  });

  it("cada repartidor lee solo su fila, y el superadmin todas", async () => {
    await turn(UNO_USER, true);
    await turn(DOS_USER, true);

    const uno = await call(UNO_USER, "select courier_id from courier_availability");
    expect(uno.ok && uno.rows).toEqual([{ courier_id: UNO }]);
    const ana = await call(ANA, "select * from courier_availability");
    expect(ana.ok && ana.rows).toEqual([]);
    const sup = await call(SUPER, "select courier_id from courier_availability");
    expect(sup.ok && sup.rows).toHaveLength(2);
  });
});

describe("el registro de cambios — ENVIO-192", () => {
  it("prender y apagar guardan un evento cada vez que cambia", async () => {
    await turn(UNO_USER, true);
    await turn(UNO_USER, true);
    await turn(UNO_USER, false);
    await turn(UNO_USER, false);

    expect(await events(UNO)).toEqual([
      { available: true, reason: "manual" },
      { available: false, reason: "manual" },
    ]);
  });

  it("nadie lo edita ni lo borra, ni lo ve de otro", async () => {
    await turn(UNO_USER, true);
    await turn(DOS_USER, true);

    const ins = await call(
      UNO_USER,
      `insert into courier_availability_events (courier_id, available, reason) values ('${UNO}', false, 'manual')`,
    );
    expect(ins.ok).toBe(false);
    const upd = await call(UNO_USER, "update courier_availability_events set available = false");
    expect(upd.ok && upd.affected).toBe(0);
    const del = await call(SUPER, "delete from courier_availability_events");
    expect(del.ok && del.affected).toBe(0);

    const mine = await call(UNO_USER, "select courier_id from courier_availability_events");
    expect(mine.ok && mine.rows).toEqual([{ courier_id: UNO }]);
    const sup = await call(SUPER, "select courier_id from courier_availability_events");
    expect(sup.ok && sup.rows).toHaveLength(2);
    const ana = await call(ANA, "select * from courier_availability_events");
    expect(ana.ok && ana.rows).toEqual([]);
  });
});

describe("el interruptor del superadmin — ENVIO-193", () => {
  it("arranca prendido", async () => {
    const fresh = await createTestDb({ before: "20261118000000" });
    const r = await fresh.query("select courier_availability_enabled from platform_settings");
    expect(r.rows).toEqual([{ courier_availability_enabled: true }]);
    await fresh.close();
  }, 60_000);

  it("solo el superadmin lo cambia", async () => {
    const a = await call(ANA, "update platform_settings set courier_availability_enabled = false");
    expect(a.ok && a.affected).toBe(0);
    const c = await call(UNO_USER, "update platform_settings set courier_availability_enabled = false");
    expect(c.ok && c.affected).toBe(0);
    const s = await call(SUPER, "update platform_settings set courier_availability_enabled = false returning 1 as ok");
    expect(s.ok && s.affected).toBe(1);
  });

  it("apagado, el repartidor no puede prender y el estado lo dice", async () => {
    await setSwitch(false);
    const r = await turn(UNO_USER, true);
    expect(!r.ok && r.code).toBe("P0027");
    const st = await call(UNO_USER, "select public.courier_availability_status() as s");
    expect(st.ok && st.rows[0].s).toMatchObject({ enabled: false, available: false });
  });
});

describe("el apagado automático — ENVIO-194", () => {
  const expire = async () => {
    // Lo corre pg_cron como dueño de la base, no la API.
    return (await db.query<{ n: number }>("select public.courier_availability_expire() as n")).rows[0].n;
  };

  it("a las 4 horas sin actividad se apaga solo y deja auto_off", async () => {
    await turn(UNO_USER, true);
    await forgetActivity(UNO, 5);

    expect(await expire()).toBe(1);

    const st = await call(UNO_USER, "select public.courier_availability_status() as s");
    expect(st.ok && st.rows[0].s).toMatchObject({ available: false });
    expect(await events(UNO)).toEqual([
      { available: true, reason: "manual" },
      { available: false, reason: "auto_off" },
    ]);
  });

  it("antes de las 4 horas no se apaga", async () => {
    await turn(UNO_USER, true);
    await forgetActivity(UNO, 3);
    expect(await expire()).toBe(0);
    expect(await events(UNO)).toHaveLength(1);
  });

  it("aunque el cron se atrase, no cuenta como disponible pasadas las 4 horas", async () => {
    await turn(UNO_USER, true);
    expect(await zoneHas(null, cantera)).toBe(true);
    await forgetActivity(UNO, 5);
    expect(await zoneHas(null, cantera)).toBe(false);
  });

  it("solo la clave de servicio o el cron la ejecutan", async () => {
    const r = await call(UNO_USER, "select public.courier_availability_expire()");
    expect(r.ok).toBe(false);
  });

  it("prender de nuevo cuenta como actividad", async () => {
    await turn(UNO_USER, true);
    await forgetActivity(UNO, 3);
    await turn(UNO_USER, true);
    const row = (
      await db.query<{ fresh: boolean }>(
        "select last_activity_at > now() - interval '1 minute' as fresh from courier_availability where courier_id = $1",
        [UNO],
      )
    ).rows[0];
    expect(row.fresh).toBe(true);
  });

  it("tomar un pedido cuenta como actividad", async () => {
    await turn(UNO_USER, true);
    await forgetActivity(UNO, 3);
    const o = await envio();

    expect((await take(UNO_USER, o.id)).ok).toBe(true);

    const row = (
      await db.query<{ fresh: boolean }>(
        "select last_activity_at > now() - interval '1 minute' as fresh from courier_availability where courier_id = $1",
        [UNO],
      )
    ).rows[0];
    expect(row.fresh).toBe(true);
  });

  it("ofertar un pedido cuenta como actividad", async () => {
    await db.exec("update platform_settings set delivery_mode = 'offers'");
    await turn(UNO_USER, true);
    await forgetActivity(UNO, 3);
    const o = await envio();

    expect((await offer(db, UNO_USER, o.id)).ok).toBe(true);

    const row = (
      await db.query<{ fresh: boolean }>(
        "select last_activity_at > now() - interval '1 minute' as fresh from courier_availability where courier_id = $1",
        [UNO],
      )
    ).rows[0];
    expect(row.fresh).toBe(true);
  });

  it("volver a ofertar con otro precio cuenta como actividad, pero cerrar la oferta sin que él haga nada no", async () => {
    await db.exec("update platform_settings set delivery_mode = 'offers'");
    await turn(UNO_USER, true);
    const o = await envio();
    expect((await offer(db, UNO_USER, o.id)).ok).toBe(true);
    await forgetActivity(UNO, 3);

    // La lectura perezosa cierra la oferta con la sesión del repartidor: no es actividad suya.
    await call(UNO_USER, `update courier_offers set closed_at = now() where order_id = '${o.id}'`);
    const closed = (
      await db.query<{ stale: boolean }>(
        "select last_activity_at < now() - interval '2 hours' as stale from courier_availability where courier_id = $1",
        [UNO],
      )
    ).rows[0];
    expect(closed.stale).toBe(true);

    const list = (await db.query<{ p: string }>("select delivery_fee_list as p from orders where id = $1", [o.id])).rows[0].p;
    expect((await offer(db, UNO_USER, o.id, Number(list) - 100, "Voy cerca")).ok).toBe(true);
    const again = (
      await db.query<{ fresh: boolean }>(
        "select last_activity_at > now() - interval '1 minute' as fresh from courier_availability where courier_id = $1",
        [UNO],
      )
    ).rows[0];
    expect(again.fresh).toBe(true);
  });

  it("cambiar el estado de un pedido propio cuenta como actividad", async () => {
    await turn(UNO_USER, true);
    const o = await envio();
    await take(UNO_USER, o.id);
    for (const s of ["confirmed", "preparing", "ready", "handed_to_courier"]) {
      expect((await call(ANA, `select public.set_order_status('${o.id}', '${s}')`)).ok).toBe(true);
    }
    await forgetActivity(UNO, 3);

    expect((await call(UNO_USER, `select public.courier_set_status('${o.id}', 'on_the_way')`)).ok).toBe(true);

    const row = (
      await db.query<{ fresh: boolean }>(
        "select last_activity_at > now() - interval '1 minute' as fresh from courier_availability where courier_id = $1",
        [UNO],
      )
    ).rows[0];
    expect(row.fresh).toBe(true);
  });

  it("lo que hace el local sobre su pedido no cuenta como actividad del repartidor", async () => {
    await turn(UNO_USER, true);
    const o = await envio();
    await take(UNO_USER, o.id);
    await forgetActivity(UNO, 3);

    await call(ANA, `select public.set_order_status('${o.id}', 'cancelled')`);

    const row = (
      await db.query<{ stale: boolean }>(
        "select last_activity_at < now() - interval '2 hours' as stale from courier_availability where courier_id = $1",
        [UNO],
      )
    ).rows[0];
    expect(row.stale).toBe(true);
  });
});

describe("quién cuenta por zona — ENVIO-196", () => {
  it("disponible, activo y que cubre la zona", async () => {
    expect(await zoneHas(null, cantera)).toBe(false);
    await turn(UNO_USER, true);
    expect(await zoneHas(null, cantera)).toBe(true);
    // DOS cubre otra zona: no cuenta para Cantera.
    await turn(DOS_USER, true);
    await turn(UNO_USER, false);
    expect(await zoneHas(null, cantera)).toBe(false);
  });

  it("un repartidor inactivo no cuenta", async () => {
    await turn(UNO_USER, true);
    await db.exec(`update couriers set active = false where id = '${UNO}'`);
    expect(await zoneHas(null, cantera)).toBe(false);
    await db.exec(`update couriers set active = true where id = '${UNO}'`);
  });

  it("con los términos exigidos, solo si aceptó la versión vigente", async () => {
    await turn(UNO_USER, true);
    await setTerms(true);
    expect(await zoneHas(null, cantera)).toBe(false);
    await accept(UNO_USER);
    expect(await zoneHas(null, cantera)).toBe(true);
    await db.exec("update platform_settings set courier_terms_version = 2");
    expect(await zoneHas(null, cantera)).toBe(false);
    await db.exec("update platform_settings set courier_terms_version = 1");
    await db.exec("delete from courier_terms_acceptances");
  });
});

describe("la función pública — ENVIO-197", () => {
  it("responde por zona a cualquiera, sin sesión, y solo sí o no", async () => {
    await turn(UNO_USER, true);
    const r = await call(null, `select public.public_zone_has_couriers('${cantera}') as v`);
    expect(r.ok && r.rows).toEqual([{ v: true }]);
  });

  it("una zona que no existe no avisa nada", async () => {
    expect(await zoneHas(null, "00000000-0000-4000-8000-0000000000ff")).toBe(true);
  });

  it("con el interruptor apagado no avisa nada", async () => {
    await setSwitch(false);
    expect(await zoneHas(null, cantera)).toBe(true);
  });

  it("por código del pedido: sí o no mientras busca, y nada cuando no aplica", async () => {
    const o = await envio();
    expect(await orderHas(o.code)).toBe(false);

    await turn(UNO_USER, true);
    expect(await orderHas(o.code)).toBe(true);

    expect(await orderHas("no-es-un-codigo")).toBeNull();
    expect(await orderHas("0".repeat(20))).toBeNull();

    await take(UNO_USER, o.id);
    expect(await orderHas(o.code)).toBeNull();

    await setSwitch(false);
    const otro = await envio();
    expect(await orderHas(otro.code)).toBeNull();
  });

  it("no expone tablas ni datos de repartidores al público", async () => {
    await turn(UNO_USER, true);
    const t = await call(null, "select * from courier_availability");
    expect(!t.ok || t.rows.length === 0).toBe(true);
    const fn = await call(null, "select public.zone_available_couriers(gen_random_uuid())");
    expect(fn.ok).toBe(false);
  });
});

describe("el conteo del local — ENVIO-200", () => {
  const count = async (user: string, business: string) => {
    const r = await call(user, `select public.business_courier_availability('${business}') as v`);
    if (!r.ok) throw new Error(r.error);
    return r.rows[0].v as { enabled: boolean; total?: number; empty_zone_ids?: string[] };
  };

  it("cuenta solo a los que cubren sus zonas, sin nombres", async () => {
    await turn(UNO_USER, true);
    await turn(DOS_USER, true);

    const ana = await count(ANA, NEG_ANA);
    expect(ana).toEqual({ enabled: true, total: 1, empty_zone_ids: [] });
    const otro = await count(OTRO, NEG_OTRO);
    expect(otro).toEqual({ enabled: true, total: 1, empty_zone_ids: [] });
  });

  it("con 0, lista las zonas vacías", async () => {
    const ana = await count(ANA, NEG_ANA);
    expect(ana).toEqual({ enabled: true, total: 0, empty_zone_ids: [cantera] });
  });

  it("un repartidor en dos zonas del local cuenta una sola vez", async () => {
    await db.exec(`insert into business_delivery_zones (business_id, zone_id) values ('${NEG_ANA}', '${alta}')`);
    await db.exec(`insert into courier_zone_coverage (courier_id, zone_id) values ('${UNO}', '${alta}')`);
    await turn(UNO_USER, true);

    const ana = await count(ANA, NEG_ANA);
    expect(ana.total).toBe(1);

    await db.exec(`delete from courier_zone_coverage where courier_id = '${UNO}' and zone_id = '${alta}'`);
    await db.exec(`delete from business_delivery_zones where business_id = '${NEG_ANA}' and zone_id = '${alta}'`);
  });

  it("marca también la zona de un pedido abierto que el local ya no tiene entre las suyas", async () => {
    const o = await envio();
    await db.exec(`delete from business_delivery_zones where business_id = '${NEG_ANA}' and zone_id = '${cantera}'`);

    const ana = await count(ANA, NEG_ANA);
    expect(ana.empty_zone_ids).toEqual([cantera]);

    await db.exec(`insert into business_delivery_zones (business_id, zone_id) values ('${NEG_ANA}', '${cantera}')`);
    await take(UNO_USER, o.id);
  });

  it("solo un miembro del negocio lo puede pedir", async () => {
    const r = await call(OTRO, `select public.business_courier_availability('${NEG_ANA}')`);
    expect(!r.ok && r.code).toBe("42501");
    const anon = await call(null, `select public.business_courier_availability('${NEG_ANA}')`);
    expect(anon.ok).toBe(false);
    const rep = await call(UNO_USER, `select public.business_courier_availability('${NEG_ANA}')`);
    expect(rep.ok).toBe(false);
  });

  it("con el interruptor apagado dice que no está activo", async () => {
    await setSwitch(false);
    expect(await count(ANA, NEG_ANA)).toEqual({ enabled: false });
  });
});

describe("el aviso push de pedido nuevo — ENVIO-195", () => {
  const eligible = async () => {
    const r = await asService(db, `select public.courier_push_eligible(array['${UNO}', '${DOS}']::uuid[]) as ids`);
    if (!r.ok) throw new Error(r.error);
    return (r.rows[0].ids as string[]).sort();
  };

  it("solo les llega a los disponibles", async () => {
    expect(await eligible()).toEqual([]);
    await turn(UNO_USER, true);
    expect(await eligible()).toEqual([UNO]);
    await turn(UNO_USER, false);
    expect(await eligible()).toEqual([]);
  });

  it("con el interruptor apagado les llega a todos", async () => {
    await setSwitch(false);
    expect(await eligible()).toEqual([UNO, DOS].sort());
  });

  it("combina con los términos: disponible y con la versión vigente aceptada", async () => {
    await turn(UNO_USER, true);
    await turn(DOS_USER, true);
    await setTerms(true);
    await accept(UNO_USER);
    expect(await eligible()).toEqual([UNO]);
    await setTerms(false);
    await db.exec("delete from courier_terms_acceptances");
  });
});

describe("No disponible igual ve y toma pedidos — ENVIO-195", () => {
  it("ve el pedido y lo puede tomar", async () => {
    const o = await envio();

    const list = await call(UNO_USER, "select public.courier_available_orders() as l");
    expect(list.ok && (list.rows[0].l as { id: string }[]).map((x) => x.id)).toContain(o.id);
    expect((await take(UNO_USER, o.id)).ok).toBe(true);
  });
});

describe("el contador de Realtime — ENVIO-202", () => {
  const pulse = async () => Number((await db.query<{ n: string }>("select n from courier_availability_pulse")).rows[0].n);

  it("sube con cada cambio de disponibilidad y lo puede leer cualquiera con sesión", async () => {
    const before = await pulse();
    await turn(UNO_USER, true);
    const on = await pulse();
    expect(on).toBeGreaterThan(before);
    await turn(UNO_USER, false);
    expect(await pulse()).toBeGreaterThan(on);

    const r = await call(ANA, "select n from courier_availability_pulse");
    expect(r.ok && r.rows).toHaveLength(1);
    const w = await call(ANA, "update courier_availability_pulse set n = 0");
    expect(w.ok && w.affected).toBe(0);
  });

  it("también sube con el apagado automático", async () => {
    await turn(UNO_USER, true);
    await forgetActivity(UNO, 5);
    const before = await pulse();
    await db.query("select public.courier_availability_expire()");
    expect(await pulse()).toBeGreaterThan(before);
  });
});
