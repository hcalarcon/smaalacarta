// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigration, asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ENVIO-45 a 56 contra Postgres real: varios repartidores, zonas de la plataforma, cobertura,
// zonas del local y favorito.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña de un negocio con envío
const BETO = "bbbbbbbb-0000-0000-0000-000000000002"; // dueño de otro negocio con envío
const CELIA = "cccccccc-0000-0000-0000-000000000005"; // dueña de un negocio sin envío
const REPA = "cccccccc-0000-0000-0000-000000000003"; // repartidora de Repartos al Toque
const REPA2 = "cccccccc-0000-0000-0000-000000000006"; // repartidor de otro servicio
const SUPER = "dddddddd-0000-0000-0000-000000000004";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const NEG_CELIA = "c3c3c3c3-0000-0000-0000-000000000003";
const TOQUE = "7a0c0e00-0000-4000-8000-000000000001"; // Repartos al Toque
const DOS = "7a0c0e00-0000-4000-8000-000000000002"; // otro repartidor activo
const INACTIVO = "7a0c0e00-0000-4000-8000-000000000003";

const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const count = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

function order(slug: string, zone: string | null) {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
  return call(
    null,
    `select public.create_public_order('${slug}', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => ${zone ? `'${zone}'::uuid` : "null"},
       p_customer_phone => '3515551234', p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
}

const prefs = (user: string, favorite: string | null) =>
  call(user, `select public.set_courier_preferences(${favorite ? `'${favorite}'` : "null"})`);

async function resetAna() {
  await db.exec(`
    delete from business_delivery_zones where business_id = '${NEG_ANA}';
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera');
    update business_settings set favorite_courier_id = null
      where business_id = '${NEG_ANA}';
  `);
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: CELIA, email: "celia@x.com" });
  await createUser(db, { id: REPA, email: "repa@x.com" });
  await createUser(db, { id: REPA2, email: "repa2@x.com" });
  await createUser(db, { id: SUPER, email: "super@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true, true),
      ('${NEG_CELIA}', 'Celia Café', 'celia', '5493510000003', true, false);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}'), ('${NEG_CELIA}', '${CELIA}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_ANA}', true, 'San Martín 100'), ('${NEG_BETO}', true, null), ('${NEG_CELIA}', true, null);

    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);

    insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${REPA}');
    insert into couriers (id, name, whatsapp, active) values
      ('${DOS}', 'Moto Express', '5493510000099', true),
      ('${INACTIVO}', 'Retirado', null, false);
    insert into courier_users (courier_id, user_id) values ('${DOS}', '${REPA2}');

    -- Moto Express cubre Centro y Cantera; el retirado cubre Oasis (solo él).
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${DOS}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera');
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${INACTIVO}', id from delivery_zones where name = 'Oasis';
  `);
  // Con el envío activo, la base ya les cargó todas las zonas (ENVIO-128): se parte de cero.
  await db.exec("delete from business_delivery_zones");
  await resetAna();
  await db.exec(`
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_BETO}', id from delivery_zones where name = 'Lolog'
  `);
}, 60_000);

// El freno de 20 pedidos por minuto.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

afterAll(async () => {
  await db.close();
});

describe("la migración copia lo que ya había — ENVIO-45", () => {
  it("las zonas conservan su id, los pedidos siguen apuntando a ellas y la cobertura arranca completa", async () => {
    const old = await createTestDb({ before: "20261021000000_varios_repartidores_zonas.sql" });

    try {
      await createUser(old, { id: ANA, email: "ana@x.com" });
      await old.exec(`
        insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
          ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
          ('${NEG_CELIA}', 'Celia Café', 'celia', '5493510000003', true, false);
        insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
        insert into business_settings (business_id, published) values ('${NEG_ANA}', true), ('${NEG_CELIA}', true);
        insert into categories (id, business_id, name, active) values
          ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
        insert into products (id, business_id, category_id, name, price, active) values
          ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
        update courier_zones set active = false where name = 'Lolog';
      `);

      const before = (
        await old.query<{ id: string; name: string; price: string }>(
          "select id, name, price from courier_zones order by sort_order",
        )
      ).rows;
      expect(before).toHaveLength(39);

      const cantera = before.find((z) => z.name === "Cantera")!;
      const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
      const made = await asUser(
        old,
        null,
        `select public.create_public_order('ana', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
           p_delivery_zone => '${cantera.id}'::uuid, p_customer_phone => '3515551234',
           p_delivery_address => 'Av. Siempre Viva 742') as result`,
      );
      expect(made.ok).toBe(true);

      await applyMigration(old, "20261021000000_varios_repartidores_zonas.sql");

      const after = (
        await old.query<{ id: string; name: string; price: string }>(
          "select id, name, price from delivery_zones order by sort_order",
        )
      ).rows;
      expect(after).toEqual(before);

      const o = await old.query<{ ok: boolean }>(
        `select (o.delivery_zone_id = z.id) as ok
         from orders o join delivery_zones z on z.id = o.delivery_zone_id`,
      );
      expect(o.rows).toEqual([{ ok: true }]);

      // Repartos al Toque cubre las zonas que estaban activas (38: Lolog estaba de baja).
      const cover = await old.query<{ n: string }>(
        "select count(*) n from courier_zone_coverage where courier_id = '7a0c0e00-0000-4000-8000-000000000001'",
      );
      expect(Number(cover.rows[0].n)).toBe(38);

      // El negocio con envío envía a todas las zonas activas; el que no tiene envío, a ninguna.
      const zones = await old.query<{ business_id: string; n: string }>(
        "select business_id, count(*) n from business_delivery_zones group by business_id",
      );
      expect(zones.rows).toEqual([{ business_id: NEG_ANA, n: 38 }]);

      const gone = await old.query<{ t: string | null }>("select to_regclass('public.courier_zones') as t");
      expect(gone.rows[0].t).toBeNull();
    } finally {
      await old.close();
    }
  }, 60_000);

  it("Repartos al Toque queda con sus 39 zonas y puede haber varios repartidores activos", async () => {
    expect(await count("select count(*) n from delivery_zones where name <> 'Zona ajena'")).toBe(39);
    expect(await count("select count(*) n from couriers where active")).toBe(2);
    expect(
      await count(`select count(*) n from courier_zone_coverage where courier_id = '${TOQUE}'`),
    ).toBe(39);
  });
});

describe("delivery_zones — ENVIO-46", () => {
  it("la leen los usuarios con sesión (no un visitante) y la escribe solo el superadmin", async () => {
    for (const user of [SUPER, REPA, REPA2, ANA, BETO, CELIA]) {
      const r = await call(user, "select id from delivery_zones");
      expect(r.ok && r.rows.length, user).toBe(39);
    }
    const anon = await call(null, "select id from delivery_zones");
    expect(anon.ok && anon.rows.length).toBe(0);

    for (const user of [REPA, ANA, null]) {
      const insert = await call(user, "insert into delivery_zones (name, price) values ('Intrusa', 1)");
      expect(insert.ok, String(user)).toBe(false);

      const update = await call(user, "update delivery_zones set price = 1");
      expect(update.ok && update.affected, String(user)).toBe(0);

      const del = await call(user, "delete from delivery_zones");
      expect(del.ok && del.affected, String(user)).toBe(0);
    }
  });

  it("el superadmin da de alta, cambia y borra zonas, con nombre de 1 a 60 y precio desde 0", async () => {
    const insert = await call(SUPER, "insert into delivery_zones (name, price, sort_order) values ('Nueva', 0, 50)");
    expect(insert.ok).toBe(true);

    const update = await call(SUPER, "update delivery_zones set price = 1234.5 where name = 'Nueva'");
    expect(update.ok && update.affected).toBe(1);

    const negative = await call(SUPER, "update delivery_zones set price = -1 where name = 'Nueva'");
    expect(negative.ok).toBe(false);

    const longName = await call(SUPER, `insert into delivery_zones (name, price) values ('${"x".repeat(61)}', 1)`);
    expect(longName.ok).toBe(false);

    const del = await call(SUPER, "delete from delivery_zones where name = 'Nueva'");
    expect(del.ok && del.affected).toBe(1);
  });
});

describe("courier_zone_coverage — ENVIO-47", () => {
  it("cada repartidor ve, agrega y borra solo las suyas", async () => {
    const own = await call(REPA2, "select zone_id from courier_zone_coverage");
    expect(own.ok && own.rows.length).toBe(2);

    const lolog = await zoneId("Lolog");
    const add = await call(REPA2, `insert into courier_zone_coverage (courier_id, zone_id) values ('${DOS}', '${lolog}')`);
    expect(add.ok).toBe(true);

    const del = await call(REPA2, `delete from courier_zone_coverage where zone_id = '${lolog}'`);
    expect(del.ok && del.affected).toBe(1);
  });

  it("no toca la cobertura de otro repartidor", async () => {
    const lolog = await zoneId("Lolog");

    const add = await call(REPA2, `insert into courier_zone_coverage (courier_id, zone_id) values ('${TOQUE}', '${lolog}')`);
    expect(add.ok).toBe(false);

    const del = await call(REPA2, `delete from courier_zone_coverage where courier_id = '${TOQUE}'`);
    expect(del.ok && del.affected).toBe(0);

    expect(await count(`select count(*) n from courier_zone_coverage where courier_id = '${TOQUE}'`)).toBe(39);
  });

  it("un local y un visitante no la leen; el superadmin la lee toda", async () => {
    for (const user of [ANA, BETO, CELIA, null]) {
      const r = await call(user, "select * from courier_zone_coverage");
      expect(r.ok && r.rows.length, String(user)).toBe(0);
    }

    const add = await call(ANA, `insert into courier_zone_coverage (courier_id, zone_id)
      select '${TOQUE}', id from delivery_zones limit 1 on conflict do nothing`);
    expect(add.ok).toBe(false);

    const all = await call(SUPER, "select * from courier_zone_coverage");
    expect(all.ok && all.rows.length).toBe(39 + 2 + 1);
  });
});

describe("business_delivery_zones — ENVIO-48", () => {
  it("los miembros ven, agregan y borran solo las de su negocio", async () => {
    const own = await call(ANA, "select zone_id from business_delivery_zones");
    expect(own.ok && own.rows.length).toBe(2);

    const lolog = await zoneId("Lolog");
    const add = await call(ANA, `insert into business_delivery_zones (business_id, zone_id) values ('${NEG_ANA}', '${lolog}')`);
    expect(add.ok).toBe(true);

    const del = await call(ANA, `delete from business_delivery_zones where zone_id = '${lolog}'`);
    expect(del.ok && del.affected).toBe(1);
  });

  it("otro negocio, un negocio ajeno o un visitante no tocan las de Ana", async () => {
    const lolog = await zoneId("Lolog");

    const seen = await call(BETO, "select business_id from business_delivery_zones");
    expect(seen.ok && seen.rows.every((r) => r.business_id === NEG_BETO)).toBe(true);

    const add = await call(BETO, `insert into business_delivery_zones (business_id, zone_id) values ('${NEG_ANA}', '${lolog}')`);
    expect(add.ok).toBe(false);

    const del = await call(BETO, `delete from business_delivery_zones where business_id = '${NEG_ANA}'`);
    expect(del.ok && del.affected).toBe(0);

    const repa = await call(REPA, "select * from business_delivery_zones");
    expect(repa.ok && repa.rows.length).toBe(0);

    const anon = await call(null, "select * from business_delivery_zones");
    expect(anon.ok && anon.rows.length).toBe(0);
  });

  it("el superadmin las lee todas", async () => {
    const all = await call(SUPER, "select * from business_delivery_zones");
    expect(all.ok && all.rows.length).toBe(3);
  });
});

describe("couriers — ENVIO-49", () => {
  it("un miembro ve solo a los repartidores activos que cubren alguna de sus zonas", async () => {
    // Ana marca Centro y Cantera: las cubren Repartos al Toque y Moto Express.
    const ana = await call(ANA, "select id from couriers order by id");
    expect(ana.ok && ana.rows.map((r) => r.id)).toEqual([TOQUE, DOS]);

    // Beto solo envía a Lolog: lo cubre solo Repartos al Toque.
    const beto = await call(BETO, "select id from couriers");
    expect(beto.ok && beto.rows.map((r) => r.id)).toEqual([TOQUE]);

    // Celia no tiene envío: no ve ninguno.
    const celia = await call(CELIA, "select id from couriers");
    expect(celia.ok && celia.rows.length).toBe(0);
  });

  it("un repartidor inactivo no se ve aunque cubra una zona del local", async () => {
    await db.exec(`insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Oasis'`);

    const r = await call(ANA, "select id from couriers");
    expect(r.ok && r.rows.map((x) => x.id)).not.toContain(INACTIVO);

    await db.exec(`delete from business_delivery_zones where business_id = '${NEG_ANA}'
      and zone_id = (select id from delivery_zones where name = 'Oasis')`);
  });

  it("cada repartidor ve su propia fila, y la escribe solo el superadmin", async () => {
    const own = await call(REPA2, "select id from couriers");
    expect(own.ok && own.rows.map((r) => r.id)).toEqual([DOS]);

    const rename = await call(REPA2, "update couriers set name = 'Mío'");
    expect(rename.ok && rename.affected).toBe(0);

    const insert = await call(REPA2, "insert into couriers (name) values ('Otro')");
    expect(insert.ok).toBe(false);

    const member = await call(ANA, "update couriers set active = false");
    expect(member.ok && member.affected).toBe(0);

    const anon = await call(null, "select * from couriers");
    expect(anon.ok && anon.rows.length).toBe(0);

    const sup = await call(SUPER, "update couriers set name = 'Moto Express' where id = '" + DOS + "'");
    expect(sup.ok && sup.affected).toBe(1);
  });
});

describe("create_courier_with_user — ENVIO-50", () => {
  it("solo el superadmin crea el repartidor y su usuario, juntos", async () => {
    await createUser(db, { id: "eeeeeeee-0000-0000-0000-000000000007", email: "nuevo@x.com" });

    const denied = await call(ANA, `select public.create_courier_with_user('Nuevo', '5493510000077', 'eeeeeeee-0000-0000-0000-000000000007')`);
    expect(!denied.ok && denied.code).toBe("42501");

    const ok = await call(SUPER, `select public.create_courier_with_user(' Nuevo ', '5493510000077', 'eeeeeeee-0000-0000-0000-000000000007') as id`);
    expect(ok.ok).toBe(true);

    const row = await db.query<{ name: string; whatsapp: string; active: boolean }>(
      "select c.name, c.whatsapp, c.active from couriers c join courier_users u on u.courier_id = c.id where u.user_id = 'eeeeeeee-0000-0000-0000-000000000007'",
    );
    expect(row.rows).toEqual([{ name: "Nuevo", whatsapp: "5493510000077", active: true }]);
  });

  it("si el usuario ya es repartidor no queda un repartidor huérfano", async () => {
    const before = await count("select count(*) n from couriers");
    const r = await call(SUPER, `select public.create_courier_with_user('Otra', null, '${REPA}')`);
    expect(r.ok).toBe(false);
    expect(await count("select count(*) n from couriers")).toBe(before);
  });
});

describe("public_delivery_zones — ENVIO-51", () => {
  it("devuelve solo las zonas del local que cubre algún repartidor activo, con precio de referencia", async () => {
    const r = await call(null, "select public.public_delivery_zones('ana') as z");
    const z = r.ok ? (r.rows[0].z as { zonas: { id: string; nombre: string; precio: number }[] }) : null;

    expect(z?.zonas.map((x) => x.nombre)).toEqual(["Centro (hasta Av. Koessler)", "Cantera"]);
    expect(z?.zonas[1]).toMatchObject({ nombre: "Cantera", precio: 5000 });
    // Al pedir todavía no hay repartidor: no se nombra a ninguno.
    expect(Object.keys(z ?? {}).sort()).toEqual(["coordinar", "propio", "zonas"]);
  });

  it("una zona marcada que nadie cubre, o dada de baja, no aparece", async () => {
    await db.exec(`insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Oasis'`);
    const sinCobertura = await call(null, "select public.public_delivery_zones('ana') as z");
    const names = (sinCobertura.ok ? (sinCobertura.rows[0].z as { zonas: { nombre: string }[] }).zonas : []).map(
      (x) => x.nombre,
    );
    // Oasis lo cubre Repartos al Toque (activo): aparece. Si se queda sin repartidores activos, no.
    expect(names).toContain("Oasis");

    await db.exec(`delete from courier_zone_coverage where courier_id = '${TOQUE}'
      and zone_id = (select id from delivery_zones where name = 'Oasis')`);
    await db.exec(`insert into courier_zone_coverage (courier_id, zone_id)
      select '${INACTIVO}', id from delivery_zones where name = 'Oasis' on conflict do nothing`);
    const soloInactivo = await call(null, "select public.public_delivery_zones('ana') as z");
    expect(
      (soloInactivo.ok ? (soloInactivo.rows[0].z as { zonas: { nombre: string }[] }).zonas : []).map((x) => x.nombre),
    ).not.toContain("Oasis");

    await db.exec(`insert into courier_zone_coverage (courier_id, zone_id)
      select '${TOQUE}', id from delivery_zones where name = 'Oasis'`);
    await db.exec("update delivery_zones set active = false where name = 'Cantera'");
    const baja = await call(null, "select public.public_delivery_zones('ana') as z");
    expect(
      (baja.ok ? (baja.rows[0].z as { zonas: { nombre: string }[] }).zonas : []).map((x) => x.nombre),
    ).not.toContain("Cantera");

    await db.exec("update delivery_zones set active = true where name = 'Cantera'");
    await resetAna();
  });

  it("otro local ve solo sus zonas", async () => {
    const r = await call(null, "select public.public_delivery_zones('beto') as z");
    expect(r.ok && (r.rows[0].z as { zonas: { nombre: string }[] }).zonas.map((x) => x.nombre)).toEqual(["Lolog"]);
  });

  it("es null sin envío, sin repartidor disponible o con el local sin publicar", async () => {
    const celia = await call(null, "select public.public_delivery_zones('celia') as z");
    expect(celia.ok && celia.rows[0].z).toBeNull();

    // Con un solo repartidor de baja, el otro sigue cubriendo las zonas de Ana.
    await db.exec(`update couriers set active = false where id = '${TOQUE}'`);
    const uno = await call(null, "select public.public_delivery_zones('ana') as z");
    expect(uno.ok && (uno.rows[0].z as { zonas: unknown[] }).zonas).toHaveLength(2);

    await db.exec(`update couriers set active = false where id = '${DOS}'`);
    const none = await call(null, "select public.public_delivery_zones('ana') as z");
    expect(none.ok && none.rows[0].z).toBeNull();
    await db.exec(`update couriers set active = true where id in ('${TOQUE}', '${DOS}')`);
  });
});

describe("set_courier_preferences — ENVIO-52", () => {
  it("guarda el favorito (sin minutos: ya no hay ventana exclusiva, ENVIO-112)", async () => {
    const def = await db.query<{ favorite_courier_id: string | null }>(
      `select favorite_courier_id from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(def.rows[0]).toEqual({ favorite_courier_id: null });

    const r = await prefs(ANA, DOS);
    expect(r.ok).toBe(true);

    const after = await db.query<{ favorite_courier_id: string }>(
      `select favorite_courier_id from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(after.rows[0]).toEqual({ favorite_courier_id: DOS });

    // Sin favorito: la oferta de nadie va primero.
    const none = await prefs(ANA, null);
    expect(none.ok).toBe(true);
    await resetAna();
  });

  it("P0017 si el favorito está inactivo, no existe o no cubre ninguna zona del local", async () => {
    // Moto Express cubre Centro y Cantera, pero Beto solo envía a Lolog.
    const noCubre = await prefs(BETO, DOS);
    expect(!noCubre.ok && noCubre.code).toBe("P0017");

    await db.exec(`insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Oasis'`);
    const inactivo = await prefs(ANA, INACTIVO);
    expect(!inactivo.ok && inactivo.code).toBe("P0017");

    const fantasma = await prefs(ANA, "99999999-0000-0000-0000-000000000009");
    expect(!fantasma.ok && fantasma.code).toBe("P0017");

    await db.exec(`update couriers set active = false where id = '${DOS}'`);
    const baja = await prefs(ANA, DOS);
    expect(!baja.ok && baja.code).toBe("P0017");
    await db.exec(`update couriers set active = true where id = '${DOS}'`);

    await resetAna();
  });

  it("ya no recibe minutos para el favorito (ENVIO-112)", async () => {
    const r = await call(ANA, "select public.set_courier_preferences(null, 5)");
    expect(r.ok).toBe(false);
    expect((await prefs(ANA, null)).ok).toBe(true);
    await resetAna();
  });

  it("un UPDATE directo tampoco salta la validación del favorito", async () => {
    const r = await call(BETO, `update business_settings set favorite_courier_id = '${DOS}' where business_id = '${NEG_BETO}'`);
    expect(!r.ok && r.code).toBe("P0017");
  });

  it("un negocio sin envío no puede usarla", async () => {
    const r = await prefs(CELIA, null);
    expect(!r.ok && r.code).toBe("42501");
  });

  it("un visitante no puede llamarla", async () => {
    const r = await call(null, "select public.set_courier_preferences(null, 5)");
    expect(r.ok).toBe(false);
  });
});

describe("save_delivery_preferences — ENVIO-53", () => {
  it("guarda zonas y favorito juntos: el favorito se valida contra las zonas nuevas", async () => {
    const lolog = await zoneId("Lolog");
    const centro = await zoneId("Centro (hasta Av. Koessler)");

    // Moto Express no cubre Lolog: con solo Lolog, falla.
    const fail = await call(ANA, `select public.save_delivery_preferences(array['${lolog}']::uuid[], '${DOS}')`);
    expect(!fail.ok && fail.code).toBe("P0017");
    // Y no quedó nada a medias.
    expect(await count(`select count(*) n from business_delivery_zones where business_id = '${NEG_ANA}'`)).toBe(2);

    const ok = await call(ANA, `select public.save_delivery_preferences(array['${centro}']::uuid[], '${DOS}')`);
    expect(ok.ok).toBe(true);

    const zones = await db.query<{ name: string }>(
      `select z.name from business_delivery_zones bz join delivery_zones z on z.id = bz.zone_id
       where bz.business_id = '${NEG_ANA}'`,
    );
    expect(zones.rows).toEqual([{ name: "Centro (hasta Av. Koessler)" }]);

    const s = await db.query<{ favorite_courier_id: string }>(
      `select favorite_courier_id from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(s.rows[0]).toEqual({ favorite_courier_id: DOS });

    await resetAna();
  });

  it("rechaza una zona que no existe o está de baja, y deja el local como estaba", async () => {
    const r = await call(
      ANA,
      "select public.save_delivery_preferences(array['99999999-0000-0000-0000-000000000009']::uuid[], null)",
    );
    expect(!r.ok && r.code).toBe("22023");
    expect(await count(`select count(*) n from business_delivery_zones where business_id = '${NEG_ANA}'`)).toBe(2);
  });

  it("una lista vacía deja al local sin zonas", async () => {
    const r = await call(ANA, "select public.save_delivery_preferences(array[]::uuid[], null)");
    expect(r.ok).toBe(true);
    expect(await count(`select count(*) n from business_delivery_zones where business_id = '${NEG_ANA}'`)).toBe(0);
    await resetAna();
  });

  it("business_delivery_options trae zonas (marcadas y cubiertas) y repartidores con sus zonas", async () => {
    const r = await call(ANA, "select public.business_delivery_options() as o");
    const o = r.ok
      ? (r.rows[0].o as {
          zones: { name: string; selected: boolean; covered: boolean }[];
          couriers: { id: string; zone_ids: string[] }[];
          favorite_id: string | null;
        })
      : null;

    expect(o?.zones).toHaveLength(39);
    expect(o?.zones.filter((z) => z.selected).map((z) => z.name)).toEqual([
      "Centro (hasta Av. Koessler)",
      "Cantera",
    ]);
    expect(o?.zones.every((z) => z.covered)).toBe(true);
    expect(o?.couriers.map((c) => c.id).sort()).toEqual([TOQUE, DOS].sort());
    expect(o?.couriers.find((c) => c.id === DOS)?.zone_ids).toHaveLength(2);
    expect(o).toMatchObject({ favorite_id: null });
    expect(o).not.toHaveProperty("favorite_minutes");

    const sinEnvio = await call(CELIA, "select public.business_delivery_options() as o");
    expect(sinEnvio.ok && sinEnvio.rows[0].o).toBeNull();
  });
});

describe("create_public_order con las zonas del local — ENVIO-54", () => {
  it("solo acepta zonas que el local marcó y que cubre un repartidor activo (P0016)", async () => {
    const lolog = await zoneId("Lolog"); // existe, pero Ana no la marcó
    const noMarcada = await order("ana", lolog);
    expect(!noMarcada.ok && noMarcada.code).toBe("P0016");

    const oasis = await zoneId("Oasis");
    await db.exec(`insert into business_delivery_zones (business_id, zone_id) values ('${NEG_ANA}', '${oasis}')`);
    await db.exec(`delete from courier_zone_coverage where zone_id = '${oasis}' and courier_id = '${TOQUE}'`);
    const sinRepartidor = await order("ana", oasis); // solo la cubre un repartidor inactivo
    expect(!sinRepartidor.ok && sinRepartidor.code).toBe("P0016");

    await db.exec(`insert into courier_zone_coverage (courier_id, zone_id) values ('${TOQUE}', '${oasis}')`);
    await resetAna();
  });

  it("el pedido nace sin repartidor, con o sin favorito: lo asigna la búsqueda", async () => {
    const sin = await order("ana", await zoneId("Cantera"));
    const sinCode = (sin.ok ? (sin.rows[0].result as { code: string }).code : "") as string;
    const o = await db.query<{ courier_id: string | null; delivery_fee_list: string; courier_status: string }>(
      "select courier_id, delivery_fee_list, courier_status from orders where code = $1",
      [sinCode],
    );
    // La búsqueda se abre cuando el local acepta el pedido (ENVIO-155).
    expect(o.rows[0]).toEqual({ courier_id: null, delivery_fee_list: "5000.00", courier_status: "waiting" });

    expect((await prefs(ANA, DOS)).ok).toBe(true);
    const fav = await order("ana", await zoneId("Cantera"));
    const favCode = (fav.ok ? (fav.rows[0].result as { code: string }).code : "") as string;
    const favOrder = await db.query<{ courier_id: string | null }>(
      "select courier_id from orders where code = $1",
      [favCode],
    );
    expect(favOrder.rows[0].courier_id).toBeNull();

    // El menú ya no nombra a ningún repartidor: todavía no lo hay.
    const menu = await call(null, "select public.public_delivery_zones('ana') as z");
    const z = (menu.ok ? menu.rows[0].z : null) as Record<string, unknown>;
    expect(Object.keys(z).sort()).toEqual(["coordinar", "propio", "zonas"]);

    await resetAna();
  });

  it("las funciones de la transición ya no existen", async () => {
    const r = await call(ANA, "select public.my_delivery_courier()");
    expect(r.ok).toBe(false);
  });
});

describe("delete_delivery_zone — ENVIO-56", () => {
  it("borra una zona sin pedidos y desactiva una que ya usan pedidos", async () => {
    await db.exec("insert into delivery_zones (name, price, sort_order) values ('Sin uso', 100, 70)");
    const sinUso = await zoneId("Sin uso");

    const del = await call(SUPER, `select public.delete_delivery_zone('${sinUso}') as r`);
    expect(del.ok && del.rows[0].r).toBe("deleted");
    expect(await count("select count(*) n from delivery_zones where name = 'Sin uso'")).toBe(0);

    // Un pedido con envío a Cantera.
    expect((await order("ana", await zoneId("Cantera"))).ok).toBe(true);
    const cantera = await zoneId("Cantera");

    const used = await call(SUPER, `select public.delete_delivery_zone('${cantera}') as r`);
    expect(used.ok && used.rows[0].r).toBe("deactivated");
    expect(await count("select count(*) n from delivery_zones where name = 'Cantera' and not active")).toBe(1);

    await db.exec("update delivery_zones set active = true where name = 'Cantera'");
  });

  it("solo la llama un superadmin y una zona inexistente da P0002", async () => {
    const lolog = await zoneId("Lolog");
    for (const user of [ANA, REPA]) {
      const r = await call(user, `select public.delete_delivery_zone('${lolog}')`);
      expect(!r.ok && r.code, user).toBe("42501");
    }
    const anon = await call(null, `select public.delete_delivery_zone('${lolog}')`);
    expect(anon.ok).toBe(false);

    const none = await call(SUPER, "select public.delete_delivery_zone('99999999-0000-0000-0000-000000000009')");
    expect(!none.ok && none.code).toBe("P0002");
  });
});
