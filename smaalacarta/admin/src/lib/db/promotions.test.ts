// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-PROMOS-1 a 3, 5 y 6 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const CAT_ANA = "c1c1c1c1-0000-0000-0000-000000000001";
const CAT_BETO = "c2c2c2c2-0000-0000-0000-000000000001";
const P1 = "d1d1d1d1-0000-0000-0000-000000000001";
const P2 = "d1d1d1d1-0000-0000-0000-000000000002";
const P3 = "d1d1d1d1-0000-0000-0000-000000000003";
const PB = "d2d2d2d2-0000-0000-0000-000000000001";

let db: TestDb;

type Promo = {
  id?: string | null;
  business?: string;
  name?: string;
  type?: string;
  discount?: number;
  price?: number | null;
  active?: boolean;
  products: string[];
};

// Llama a la función que guarda una promoción, como lo haría la app.
function save(user: string | null, p: Promo) {
  const uuids = `ARRAY[${p.products.map((id) => `'${id}'`).join(",")}]::uuid[]`;
  return asUser(
    db,
    user,
    `select public.save_promotion(
       ${p.id ? `'${p.id}'` : "null"}::uuid,
       '${p.business ?? NEG_ANA}'::uuid,
       '${p.name ?? "Promo"}', 'desc',
       '${p.type ?? "percent"}',
       ${p.discount ?? 20}::numeric,
       ${p.price ?? "null"}::numeric,
       ${p.active ?? true},
       ${uuids}) as id`,
  );
}

async function items(promoId: string) {
  const r = await db.query<{ product_id: string }>(
    `select product_id from promotion_items where promotion_id = '${promoId}' order by sort_order`,
  );
  return r.rows.map((x) => x.product_id);
}

const idOf = (r: Awaited<ReturnType<typeof save>>) =>
  r.ok ? (r.rows[0].id as string) : "";

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
      ('${CAT_ANA}', '${NEG_ANA}', 'Ana'), ('${CAT_BETO}', '${NEG_BETO}', 'Beto');
    insert into products (id, business_id, category_id, name, price) values
      ('${P1}', '${NEG_ANA}', '${CAT_ANA}', 'P1', 1000),
      ('${P2}', '${NEG_ANA}', '${CAT_ANA}', 'P2', 2000),
      ('${P3}', '${NEG_ANA}', '${CAT_ANA}', 'P3', 3000),
      ('${PB}', '${NEG_BETO}', '${CAT_BETO}', 'PB', 500);
  `);
}, 60_000);

describe("crear promociones — ADMIN-PROMOS-1 y 2", () => {
  it("guarda una promoción de porcentaje con sus productos en el orden elegido", async () => {
    const r = await save(ANA, { products: [P3, P1, P2] });

    expect(r.ok).toBe(true);
    expect(await items(idOf(r))).toEqual([P3, P1, P2]);
  });

  it("guarda un combo con precio fijo", async () => {
    const r = await save(ANA, {
      type: "combo", discount: 0, price: 2500, products: [P1, P2],
    });
    expect(r.ok).toBe(true);
  });

  it.each([
    ["porcentaje en 0", { discount: 0 }],
    ["porcentaje mayor a 100", { discount: 101 }],
    ["porcentaje con precio fijo", { discount: 10, price: 500 }],
    ["combo sin precio", { type: "combo", discount: 0, price: null }],
    ["combo con precio 0", { type: "combo", discount: 0, price: 0 }],
    ["combo con descuento", { type: "combo", discount: 10, price: 500 }],
    ["tipo desconocido", { type: "sorteo" }],
  ])("rechaza %s", async (_caso, extra) => {
    const r = await save(ANA, { products: [P1], ...extra });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23514");
  });

  it("exige al menos un producto", async () => {
    const r = await save(ANA, { products: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/al menos un producto/i);
  });

  it("no acepta productos de otro negocio", async () => {
    const antes = await db.query("select id from promotions");
    const r = await save(ANA, { name: "Con ajeno", products: [P1, PB] });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23503");
    const despues = await db.query("select id from promotions");
    expect(despues.rows).toHaveLength(antes.rows.length);
  });
});

describe("editar promociones — ADMIN-PROMOS-2 y 3", () => {
  it("al editar reemplaza los productos y su orden", async () => {
    const creada = idOf(await save(ANA, { name: "Editable", products: [P1, P2] }));

    const r = await save(ANA, { id: creada, name: "Editada", products: [P2, P3] });

    expect(r.ok).toBe(true);
    expect(await items(creada)).toEqual([P2, P3]);
    const promo = await db.query<{ name: string }>(
      `select name from promotions where id = '${creada}'`,
    );
    expect(promo.rows[0].name).toBe("Editada");
  });

  it("es atómico: si un producto es inválido no cambia nada", async () => {
    const creada = idOf(await save(ANA, { name: "Atómica", products: [P1, P2] }));

    const r = await save(ANA, { id: creada, name: "Rota", products: [P3, PB] });

    expect(r.ok).toBe(false);
    expect(await items(creada)).toEqual([P1, P2]);
    const promo = await db.query<{ name: string }>(
      `select name from promotions where id = '${creada}'`,
    );
    expect(promo.rows[0].name).toBe("Atómica");
  });

  it("es atómico también con datos inválidos de la promoción", async () => {
    const creada = idOf(await save(ANA, { name: "Atómica 2", products: [P1] }));

    const r = await save(ANA, { id: creada, discount: 500, products: [P2, P3] });

    expect(r.ok).toBe(false);
    expect(await items(creada)).toEqual([P1]);
  });
});

describe("aislamiento — ADMIN-PROMOS-5", () => {
  it("un negocio no ve promociones ajenas", async () => {
    const r = await asUser(db, BETO, "select id from promotions");
    expect(r.ok && r.rows).toHaveLength(0);

    const it = await asUser(db, BETO, "select product_id from promotion_items");
    expect(it.ok && it.rows).toHaveLength(0);
  });

  it("no puede crear promociones en el negocio de otro", async () => {
    const r = await save(BETO, { business: NEG_ANA, products: [P1] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501");
  });

  it("no puede editar la promoción de otro, ni siquiera nombrando su propio negocio", async () => {
    const ajena = idOf(await save(ANA, { name: "De Ana", products: [P1] }));

    const r = await save(BETO, { id: ajena, business: NEG_BETO, products: [PB] });

    expect(r.ok).toBe(false);
    expect(await items(ajena)).toEqual([P1]);
  });

  it("no puede modificar ni borrar promociones ajenas", async () => {
    const ajena = idOf(await save(ANA, { name: "Intocable", products: [P1] }));

    const upd = await asUser(
      db, BETO, `update promotions set name = 'hack' where id = '${ajena}'`,
    );
    const del = await asUser(db, BETO, `delete from promotions where id = '${ajena}'`);
    const delItem = await asUser(
      db, BETO, `delete from promotion_items where promotion_id = '${ajena}'`,
    );

    expect(upd.ok && upd.affected).toBe(0);
    expect(del.ok && del.affected).toBe(0);
    expect(delItem.ok && delItem.affected).toBe(0);
    expect(await items(ajena)).toEqual([P1]);
  });

  it("sin sesión no se ve ni se guarda nada", async () => {
    const lista = await asUser(db, null, "select id from promotions");
    const guardar = await save(null, { products: [P1] });

    expect(lista.ok && lista.rows).toHaveLength(0);
    expect(guardar.ok).toBe(false);
  });

  it("un negocio borra sus propias promociones", async () => {
    const propia = idOf(await save(ANA, { name: "Borrable", products: [P1] }));

    const del = await asUser(db, ANA, `delete from promotions where id = '${propia}'`);

    expect(del.ok && del.affected).toBe(1);
  });
});

describe("borrados — ADMIN-PROMOS-6", () => {
  it("borrar un producto lo saca de sus promociones", async () => {
    const extra = "d1d1d1d1-0000-0000-0000-0000000000ff";
    await db.exec(
      `insert into products (id, business_id, category_id, name) values ('${extra}', '${NEG_ANA}', '${CAT_ANA}', 'Efímero')`,
    );
    const promo = idOf(await save(ANA, { name: "Con efímero", products: [P1, extra] }));

    await asUser(db, ANA, `delete from products where id = '${extra}'`);

    expect(await items(promo)).toEqual([P1]);
  });

  it("borrar una promoción no borra sus productos", async () => {
    const promo = idOf(await save(ANA, { name: "Se va", products: [P1, P2] }));

    await asUser(db, ANA, `delete from promotions where id = '${promo}'`);

    const prods = await db.query("select id from products where id in ($1, $2)", [P1, P2]);
    expect(prods.rows).toHaveLength(2);
    expect(await items(promo)).toEqual([]);
  });
});
