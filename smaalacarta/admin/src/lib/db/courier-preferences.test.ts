// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { openSearch, take } from "@/test/offers";

// SEGUIMIENTO-47 y ADMIN-REPARTIDOR-1 contra Postgres real: las preferencias del repartidor.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const TOQUE_USER = "cccccccc-0000-0000-0000-000000000003";
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const TOQUE = "7a0c0e00-0000-4000-8000-000000000001";
const MOTO = "7a0c0e00-0000-4000-8000-000000000002";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const sqlText = (value: string | null) => (value === null ? "null" : `'${value.replace(/'/g, "''")}'`);

const save = (user: string | null, shops: boolean, seeks: boolean, note: string | null) =>
  call(user, `select public.courier_save_preferences(${shops}, ${seeks}, ${sqlText(note)})`);

async function pedido() {
  const zone = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${zone}'::uuid, p_customer_phone => '351 555-1234', p_delivery_address => 'Calle 1') as result`,
  );
  if (!r.ok) throw new Error(r.error);
  const code = (r.rows[0].result as { code: string }).code;
  const id = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0].id;
  await openSearch(db, id);
  return { id, code };
}

const delivery = async (code: string) => {
  const r = await call(null, `select public.public_order_delivery('${code}') as d`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].d as { preferencias?: Record<string, unknown> };
};

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: TOQUE_USER, email: "toque@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery)
      values ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published, address) values ('${NEG_ANA}', true, 'San Martín 100');
    insert into categories (id, business_id, name, active)
      values ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active)
      values ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${TOQUE_USER}');
    insert into couriers (id, name, whatsapp, active) values ('${MOTO}', 'Moto Express', '5493510000099', true);
    insert into courier_users (courier_id, user_id) values ('${MOTO}', '${MOTO_USER}');
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Cantera';
  `);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("la tabla — ADMIN-REPARTIDOR-1", () => {
  it("cada repartidor lee solo las suyas y nadie escribe directo", async () => {
    expect((await save(TOQUE_USER, true, false, "Paso por la farmacia")).ok).toBe(true);
    expect((await save(MOTO_USER, false, true, null)).ok).toBe(true);

    const mine = await call(TOQUE_USER, "select courier_id, note from courier_preferences");
    expect(mine.ok && mine.rows).toEqual([{ courier_id: TOQUE, note: "Paso por la farmacia" }]);

    // Sin sesión no se ve nada, y un UPDATE directo no toca ninguna fila (no hay política de escritura).
    const anon = await call(null, "select count(*)::int n from courier_preferences");
    expect(!anon.ok || anon.rows[0].n === 0).toBe(true);

    await call(MOTO_USER, `update courier_preferences set note = 'hack' where courier_id = '${TOQUE}'`);
    const after = await db.query<{ note: string }>("select note from courier_preferences where courier_id = $1", [TOQUE]);
    expect(after.rows[0].note).toBe("Paso por la farmacia");
  });

  it("solo un repartidor guarda; el texto se recorta y tiene hasta 140 caracteres", async () => {
    expect((await save(ANA, true, true, null)).ok).toBe(false);
    expect((await save(null, true, true, null)).ok).toBe(false);

    expect((await save(TOQUE_USER, true, true, "   ")).ok).toBe(true);
    expect((await db.query("select note from courier_preferences where courier_id = $1", [TOQUE])).rows[0]).toEqual({
      note: null,
    });

    expect((await save(TOQUE_USER, true, true, "x".repeat(140))).ok).toBe(true);
    expect((await save(TOQUE_USER, true, true, "x".repeat(141))).ok).toBe(false);
  });
});

describe("el seguimiento — SEGUIMIENTO-47", () => {
  it("las ve solo con repartidor asignado y del repartidor de ese pedido", async () => {
    await save(TOQUE_USER, true, false, "Paso por la farmacia");
    await save(MOTO_USER, false, true, "Voy por la ruta");

    const o = await pedido();
    // Buscando: todavía no hay repartidor asignado.
    expect((await delivery(o.code)).preferencias).toBeUndefined();

    const taken = await take(db, TOQUE_USER, o.id);
    expect(taken.ok).toBe(true);

    expect((await delivery(o.code)).preferencias).toEqual({
      compras_en_camino: true,
      busca_pedidos: false,
      texto: "Paso por la farmacia",
    });
  });

  it("sin nada marcado ni escrito no hay bloque", async () => {
    await save(MOTO_USER, false, false, null);
    const o = await pedido();
    await take(db, MOTO_USER, o.id);

    expect((await delivery(o.code)).preferencias).toBeUndefined();
  });
});

