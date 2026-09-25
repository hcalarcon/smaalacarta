// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-MENU-4 y 5 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const CAT_ANA_1 = "c1c1c1c1-0000-0000-0000-000000000001";
const CAT_ANA_2 = "c1c1c1c1-0000-0000-0000-000000000002";
const CAT_BETO = "c2c2c2c2-0000-0000-0000-000000000001";
const PROD_ANA_1 = "d1d1d1d1-0000-0000-0000-000000000001";
const PROD_ANA_2 = "d1d1d1d1-0000-0000-0000-000000000002";
const PROD_BETO = "d2d2d2d2-0000-0000-0000-000000000001";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug) values
      ('${NEG_ANA}', 'Ana', 'ana'), ('${NEG_BETO}', 'Beto', 'beto');
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into categories (id, business_id, name) values
      ('${CAT_ANA_1}', '${NEG_ANA}', 'Uno'),
      ('${CAT_ANA_2}', '${NEG_ANA}', 'Dos'),
      ('${CAT_BETO}', '${NEG_BETO}', 'Beto');
    insert into products (id, business_id, category_id, name) values
      ('${PROD_ANA_1}', '${NEG_ANA}', '${CAT_ANA_1}', 'P1'),
      ('${PROD_ANA_2}', '${NEG_ANA}', '${CAT_ANA_1}', 'P2'),
      ('${PROD_BETO}', '${NEG_BETO}', '${CAT_BETO}', 'PB');
  `);
}, 60_000);

describe("orden guardado — ADMIN-MENU-4", () => {
  it("categorías y productos nacen sin orden (nulo)", async () => {
    const cats = await db.query<{ sort_order: number | null }>(
      "select sort_order from categories",
    );
    const prods = await db.query<{ sort_order: number | null }>(
      "select sort_order from products",
    );
    expect(cats.rows.every((r) => r.sort_order === null)).toBe(true);
    expect(prods.rows.every((r) => r.sort_order === null)).toBe(true);
  });

  it("un negocio guarda la posición de sus categorías", async () => {
    const a = await asUser(
      db, ANA, `update categories set sort_order = 1 where id = '${CAT_ANA_1}'`,
    );
    const b = await asUser(
      db, ANA, `update categories set sort_order = 0 where id = '${CAT_ANA_2}'`,
    );
    const orden = await asUser(
      db, ANA, "select id from categories order by sort_order nulls last",
    );

    expect(a.ok && a.affected).toBe(1);
    expect(b.ok && b.affected).toBe(1);
    expect(orden.ok && orden.rows.map((r) => r.id)).toEqual([CAT_ANA_2, CAT_ANA_1]);
  });

  it("y la de los productos de una categoría", async () => {
    await asUser(db, ANA, `update products set sort_order = 1 where id = '${PROD_ANA_1}'`);
    await asUser(db, ANA, `update products set sort_order = 0 where id = '${PROD_ANA_2}'`);

    const orden = await asUser(
      db, ANA,
      `select id from products where category_id = '${CAT_ANA_1}' order by sort_order`,
    );
    expect(orden.ok && orden.rows.map((r) => r.id)).toEqual([PROD_ANA_2, PROD_ANA_1]);
  });
});

describe("aislamiento — ADMIN-MENU-5", () => {
  it("no se reordenan categorías ni productos de otro negocio", async () => {
    const cat = await asUser(
      db, ANA, `update categories set sort_order = 9 where id = '${CAT_BETO}'`,
    );
    const prod = await asUser(
      db, ANA, `update products set sort_order = 9 where id = '${PROD_BETO}'`,
    );

    expect(cat.ok && cat.affected).toBe(0);
    expect(prod.ok && prod.affected).toBe(0);

    const intacto = await db.query<{ sort_order: number | null }>(
      `select sort_order from categories where id = '${CAT_BETO}'`,
    );
    expect(intacto.rows[0].sort_order).toBeNull();
  });
});
