// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// Políticas de RLS de los negocios contra Postgres real (ADMIN-AUTH-1 a 3 y
// ADMIN-MENU). Dos usuarios, cada uno miembro de su negocio.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const CAT_ANA = "c1c1c1c1-0000-0000-0000-000000000001";
const CAT_BETO = "c2c2c2c2-0000-0000-0000-000000000002";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com", fullName: "Ana" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug) values
      ('${NEG_ANA}', 'Negocio Ana', 'ana'), ('${NEG_BETO}', 'Negocio Beto', 'beto');
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into categories (id, business_id, name) values
      ('${CAT_ANA}', '${NEG_ANA}', 'Cat Ana'), ('${CAT_BETO}', '${NEG_BETO}', 'Cat Beto');
    insert into products (business_id, name, category_id)
      values ('${NEG_BETO}', 'Prod Beto', '${CAT_BETO}');
  `);
}, 60_000);

describe("perfiles y membresías — ADMIN-AUTH-1 y 3", () => {
  it("al registrarse se crea el perfil con el nombre", async () => {
    const r = await db.query<{ full_name: string }>(
      `select full_name from profiles where id = '${ANA}'`,
    );
    expect(r.rows[0]?.full_name).toBe("Ana");
  });

  it("cada usuario ve solo su perfil", async () => {
    const r = await asUser(db, ANA, "select id from profiles");
    expect(r.ok && r.rows.map((x) => x.id)).toEqual([ANA]);
  });

  it("cada usuario ve solo su negocio y su membresía", async () => {
    const negocios = await asUser(db, ANA, "select id from businesses");
    const miembros = await asUser(db, ANA, "select user_id from business_users");
    expect(negocios.ok && negocios.rows.map((x) => x.id)).toEqual([NEG_ANA]);
    expect(miembros.ok && miembros.rows.map((x) => x.user_id)).toEqual([ANA]);
  });

  it("un usuario edita su negocio pero no el de otro", async () => {
    const propio = await asUser(
      db, ANA, `update businesses set name = 'Renombrado' where id = '${NEG_ANA}'`,
    );
    const ajeno = await asUser(
      db, ANA, `update businesses set name = 'hack' where id = '${NEG_BETO}'`,
    );
    expect(propio.ok && propio.affected).toBe(1);
    expect(ajeno.ok && ajeno.affected).toBe(0);
  });

  it("un usuario común no crea negocios ni se asigna a uno ajeno", async () => {
    const crear = await asUser(
      db, ANA, `insert into businesses (name, slug) values ('Nuevo', 'nuevo')`,
    );
    const asignarse = await asUser(
      db, ANA,
      `insert into business_users (business_id, user_id) values ('${NEG_BETO}', '${ANA}')`,
    );
    expect(crear.ok).toBe(false);
    expect(asignarse.ok).toBe(false);
  });

  it("sin sesión no se ve ningún negocio ni categoría", async () => {
    const negocios = await asUser(db, null, "select id from businesses");
    const categorias = await asUser(db, null, "select id from categories");
    expect(negocios.ok && negocios.rows).toHaveLength(0);
    expect(categorias.ok && categorias.rows).toHaveLength(0);
  });
});

describe("datos del negocio — ADMIN-AUTH-2", () => {
  it("un usuario ve solo las categorías y productos de su negocio", async () => {
    const cats = await asUser(db, ANA, "select id from categories");
    const prods = await asUser(db, ANA, "select id from products");
    expect(cats.ok && cats.rows.map((x) => x.id)).toEqual([CAT_ANA]);
    expect(prods.ok && prods.rows).toHaveLength(0);
  });

  it("crea categorías en su negocio", async () => {
    const r = await asUser(
      db, ANA, `insert into categories (business_id, name) values ('${NEG_ANA}', 'Nueva')`,
    );
    expect(r.ok).toBe(true);
  });

  it.each([
    ["categoría", `insert into categories (business_id, name) values ('${NEG_BETO}', 'x')`],
    ["producto", `insert into products (business_id, name) values ('${NEG_BETO}', 'x')`],
    ["promoción", `insert into promotions (business_id, name) values ('${NEG_BETO}', 'x')`],
    ["pedido", `insert into orders (business_id, order_number) values ('${NEG_BETO}', '1')`],
  ])("no crea %s en el negocio de otro", async (_tipo, sql) => {
    const r = await asUser(db, ANA, sql);
    expect(r.ok).toBe(false);
  });

  it("no mueve una fila propia al negocio de otro", async () => {
    const r = await asUser(
      db, ANA, `update categories set business_id = '${NEG_BETO}' where id = '${CAT_ANA}'`,
    );
    expect(r.ok).toBe(false);
  });

  it("no modifica ni borra filas de otro negocio", async () => {
    const upd = await asUser(
      db, ANA, `update categories set name = 'hack' where id = '${CAT_BETO}'`,
    );
    const del = await asUser(db, ANA, `delete from categories where id = '${CAT_BETO}'`);
    expect(upd.ok && upd.affected).toBe(0);
    expect(del.ok && del.affected).toBe(0);
  });
});

describe("categorías y productos — ADMIN-MENU", () => {
  it("un producto no puede colgar de la categoría de otro negocio", async () => {
    const r = await asUser(
      db, ANA,
      `insert into products (business_id, name, category_id)
       values ('${NEG_ANA}', 'Mezcla', '${CAT_BETO}')`,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23503"); // foreign_key_violation
  });

  it("borrar una categoría deja sus productos sin categoría y en su negocio", async () => {
    await db.exec(
      `insert into products (id, business_id, name, category_id)
       values ('d1d1d1d1-0000-0000-0000-000000000001', '${NEG_ANA}', 'Prod Ana', '${CAT_ANA}')`,
    );

    const del = await asUser(db, ANA, `delete from categories where id = '${CAT_ANA}'`);
    const prod = await db.query<{ business_id: string; category_id: string | null }>(
      `select business_id, category_id from products
       where id = 'd1d1d1d1-0000-0000-0000-000000000001'`,
    );

    expect(del.ok && del.affected).toBe(1);
    expect(prod.rows[0]).toEqual({ business_id: NEG_ANA, category_id: null });
  });
});
