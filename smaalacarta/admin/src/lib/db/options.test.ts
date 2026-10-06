// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-OPCIONES-1 a 11 contra Postgres real.
const SUPER = "5a5a5a5a-0000-0000-0000-000000000001";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const CAT_ANA = "c1c1c1c1-0000-0000-0000-000000000001";
const CAT_BETO = "c2c2c2c2-0000-0000-0000-000000000001";
const P1 = "d1d1d1d1-0000-0000-0000-000000000001";
const P2 = "d1d1d1d1-0000-0000-0000-000000000002";
const PB = "d2d2d2d2-0000-0000-0000-000000000001";

let db: TestDb;

type Opt = {
  id?: string;
  name?: string;
  price_delta?: number;
  active?: boolean;
  sold_out?: boolean;
};
type Group = {
  id?: string | null;
  business?: string;
  name?: string;
  min?: number;
  max?: number;
  repeat?: boolean;
  active?: boolean;
  options?: Opt[];
};

const opts = (n: number): Opt[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Op ${i + 1}`, price_delta: 0 }));

function saveGroup(user: string | null, g: Group = {}) {
  const options = JSON.stringify(
    (g.options ?? opts(3)).map((o) => ({
      ...(o.id && { id: o.id }),
      name: o.name ?? "Opción",
      price_delta: o.price_delta ?? 0,
      active: o.active ?? true,
      sold_out: o.sold_out ?? false,
    })),
  );

  return asUser(
    db,
    user,
    `select public.save_option_group(
       ${g.id ? `'${g.id}'` : "null"}::uuid,
       '${g.business ?? NEG_ANA}'::uuid,
       '${g.name ?? "Extras"}',
       ${g.min ?? 0}, ${g.max ?? 2}, ${g.repeat ?? false}, ${g.active ?? true},
       '${options}'::jsonb) as id`,
  );
}

function setGroups(user: string | null, product: string, groupIds: string[], business = NEG_ANA) {
  const ids = `ARRAY[${groupIds.map((id) => `'${id}'`).join(",")}]::uuid[]`;
  return asUser(
    db,
    user,
    `select public.set_product_option_groups('${business}'::uuid, '${product}'::uuid, ${ids})`,
  );
}

const idOf = (r: Awaited<ReturnType<typeof saveGroup>>) => (r.ok ? (r.rows[0].id as string) : "");

async function mustSave(g: Group = {}) {
  const r = await saveGroup(ANA, g);
  expect(r.ok, !r.ok ? r.error : "").toBe(true);
  return idOf(r);
}

async function optionsOf(groupId: string) {
  const r = await db.query<{ id: string; name: string; price_delta: string }>(
    `select id, name, price_delta from options where group_id = '${groupId}' order by sort_order`,
  );
  return r.rows;
}

async function groupsOf(productId: string) {
  const r = await db.query<{ group_id: string }>(
    `select group_id from product_option_groups where product_id = '${productId}' order by sort_order`,
  );
  return r.rows.map((x) => x.group_id);
}

async function count(table: string, where = "true") {
  const r = await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`);
  return r.rows[0].n;
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: SUPER, email: "super@sma.com" });
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug) values
      ('${NEG_ANA}', 'Ana', 'ana'), ('${NEG_BETO}', 'Beto', 'beto');
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into categories (id, business_id, name) values
      ('${CAT_ANA}', '${NEG_ANA}', 'Ana'), ('${CAT_BETO}', '${NEG_BETO}', 'Beto');
    insert into products (id, business_id, category_id, name, price) values
      ('${P1}', '${NEG_ANA}', '${CAT_ANA}', 'P1', 1000),
      ('${P2}', '${NEG_ANA}', '${CAT_ANA}', 'P2', 2000),
      ('${PB}', '${NEG_BETO}', '${CAT_BETO}', 'PB', 500);
  `);
}, 60_000);

describe("guardar un grupo con sus opciones — ADMIN-OPCIONES-1 a 3", () => {
  it("guarda el grupo con sus opciones en el orden enviado", async () => {
    const id = await mustSave({
      name: "Toppings",
      options: [
        { name: "Dulce de leche", price_delta: 300 },
        { name: "Chocolate", price_delta: 0 },
        { name: "Crema", price_delta: 150.5 },
      ],
    });

    const rows = await optionsOf(id);
    expect(rows.map((r) => r.name)).toEqual(["Dulce de leche", "Chocolate", "Crema"]);
    expect(rows.map((r) => Number(r.price_delta))).toEqual([300, 0, 150.5]);
  });

  it("guarda la regla del grupo y el estado de cada opción", async () => {
    const id = await mustSave({
      name: "Sabores", min: 1, max: 3, repeat: true, active: false,
      options: [{ name: "Frutilla", sold_out: true, active: false }, { name: "Limón" }],
    });

    const g = await db.query(
      `select min_select, max_select, allow_repeat, active from option_groups where id = '${id}'`,
    );
    expect(g.rows[0]).toEqual({ min_select: 1, max_select: 3, allow_repeat: true, active: false });

    const o = await db.query(`select active, sold_out from options where group_id = '${id}' order by sort_order`);
    expect(o.rows).toEqual([{ active: false, sold_out: true }, { active: true, sold_out: false }]);
  });

  it("al editar conserva las opciones con id, borra las que faltan y toma el orden nuevo", async () => {
    const id = await mustSave({ options: [{ name: "A" }, { name: "B" }, { name: "C" }] });
    const [a, b] = await optionsOf(id);

    await mustSave({
      id,
      name: "Renombrado",
      options: [{ id: b.id, name: "B2", price_delta: 50 }, { name: "D" }, { id: a.id, name: "A" }],
    });

    const rows = await optionsOf(id);
    expect(rows.map((r) => r.name)).toEqual(["B2", "D", "A"]);
    expect(rows[0].id).toBe(b.id);
    expect(rows[2].id).toBe(a.id);
    expect(await count("options", `group_id = '${id}'`)).toBe(3);

    const g = await db.query(`select name from option_groups where id = '${id}'`);
    expect(g.rows[0].name).toBe("Renombrado");
  });

  it("es atómico: una opción inválida no deja un grupo a medias", async () => {
    const antes = await count("option_groups");
    const r = await saveGroup(ANA, {
      name: "Roto",
      options: [{ name: "Ok" }, { name: "Mal", price_delta: -5 }],
    });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23514");
    expect(await count("option_groups")).toBe(antes);
    expect(await count("options", "name = 'Ok'")).toBe(0);
  });

  it("una edición inválida deja el grupo como estaba", async () => {
    const id = await mustSave({ name: "Estable", options: [{ name: "X" }, { name: "Y" }] });

    const r = await saveGroup(ANA, { id, name: "Cambiado", options: [{ name: "Z", price_delta: -1 }] });

    expect(r.ok).toBe(false);
    expect((await optionsOf(id)).map((o) => o.name)).toEqual(["X", "Y"]);
    expect((await db.query(`select name from option_groups where id = '${id}'`)).rows[0].name).toBe("Estable");
  });

  it.each([
    ["mínimo negativo", { min: -1 }],
    ["máximo 0", { min: 0, max: 0 }],
    ["máximo menor que el mínimo", { min: 3, max: 2, repeat: true }],
    ["nombre vacío", { name: "  " }],
  ])("rechaza %s", async (_caso, extra) => {
    const r = await saveGroup(ANA, extra);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23514");
  });

  it("rechaza un precio extra negativo en una opción pero acepta 0", async () => {
    const mal = await saveGroup(ANA, { options: [{ name: "Neg", price_delta: -0.01 }] });
    expect(mal.ok).toBe(false);
    expect(!mal.ok && mal.code).toBe("23514");

    expect((await saveGroup(ANA, { options: [{ name: "Cero", price_delta: 0 }] })).ok).toBe(true);
  });

  it("exige al menos una opción", async () => {
    const r = await saveGroup(ANA, { options: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/al menos una opción/i);
  });

  // Sin repetir, un mínimo mayor que las opciones no se puede cumplir nunca.
  it("sin repetir, rechaza un mínimo mayor que la cantidad de opciones", async () => {
    const r = await saveGroup(ANA, { min: 4, max: 4, options: opts(3) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/mínimo/i);

    expect((await saveGroup(ANA, { min: 4, max: 4, repeat: true, options: opts(3) })).ok).toBe(true);
  });

  it("no deja editar un grupo que no existe", async () => {
    const r = await saveGroup(ANA, { id: "99999999-0000-0000-0000-000000000009" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0002");
  });

  it("no deja tocar una opción de otro grupo pasando su id", async () => {
    const otro = await mustSave({ options: [{ name: "Ajena" }] });
    const [ajena] = await optionsOf(otro);

    const id = await mustSave({ options: [{ name: "Propia" }] });
    await saveGroup(ANA, { id, options: [{ id: ajena.id, name: "Robada" }] });

    expect((await optionsOf(otro)).map((o) => o.name)).toEqual(["Ajena"]);
  });
});

describe("límites — ADMIN-OPCIONES-4 y 6", () => {
  it("acepta 30 opciones y rechaza 31", async () => {
    expect((await saveGroup(ANA, { options: opts(30) })).ok).toBe(true);

    const antes = await count("option_groups");
    const r = await saveGroup(ANA, { options: opts(31) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0015");
    expect(await count("option_groups")).toBe(antes);
  });

  it("un producto acepta 6 grupos y rechaza un séptimo", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await mustSave({ name: `Grupo límite ${i}` }));

    expect((await setGroups(ANA, P2, ids.slice(0, 6))).ok).toBe(true);
    expect(await groupsOf(P2)).toEqual(ids.slice(0, 6));

    const r = await setGroups(ANA, P2, ids);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0015");
    // La asociación anterior queda como estaba.
    expect(await groupsOf(P2)).toEqual(ids.slice(0, 6));

    await setGroups(ANA, P2, []);
  });
});

describe("asociar grupos a productos — ADMIN-OPCIONES-6", () => {
  it("guarda el orden elegido y reemplaza lo anterior", async () => {
    const a = await mustSave({ name: "Asoc A" });
    const b = await mustSave({ name: "Asoc B" });
    const c = await mustSave({ name: "Asoc C" });

    expect((await setGroups(ANA, P1, [c, a, b])).ok).toBe(true);
    expect(await groupsOf(P1)).toEqual([c, a, b]);

    expect((await setGroups(ANA, P1, [b])).ok).toBe(true);
    expect(await groupsOf(P1)).toEqual([b]);

    expect((await setGroups(ANA, P1, [])).ok).toBe(true);
    expect(await groupsOf(P1)).toEqual([]);
  });

  it("un mismo grupo sirve a varios productos", async () => {
    const g = await mustSave({ name: "Compartido" });
    await setGroups(ANA, P1, [g]);
    await setGroups(ANA, P2, [g]);

    expect(await groupsOf(P1)).toEqual([g]);
    expect(await groupsOf(P2)).toEqual([g]);

    await setGroups(ANA, P1, []);
    await setGroups(ANA, P2, []);
  });

  it("rechaza el mismo grupo dos veces en un producto", async () => {
    const g = await mustSave({ name: "Doble" });
    const r = await setGroups(ANA, P1, [g, g]);
    expect(r.ok).toBe(false);
  });
});

describe("aislamiento entre negocios — ADMIN-OPCIONES-7", () => {
  it("cada negocio ve solo sus grupos y opciones", async () => {
    await mustSave({ name: "Solo de Ana", options: [{ name: "Secreta" }] });

    const beto = await asUser(db, BETO, "select id from option_groups");
    expect(beto.ok && beto.rows).toEqual([]);

    const betoOpts = await asUser(db, BETO, "select id from options");
    expect(betoOpts.ok && betoOpts.rows).toEqual([]);

    const anon = await asUser(db, null, "select id from option_groups");
    expect(anon.ok && anon.rows).toEqual([]);
  });

  it("no puede crear grupos en otro negocio", async () => {
    const r = await saveGroup(BETO, { business: NEG_ANA, name: "Intruso" });
    expect(r.ok).toBe(false);
    expect(await count("option_groups", "name = 'Intruso'")).toBe(0);
  });

  it("no puede editar ni borrar grupos ni opciones ajenos", async () => {
    const id = await mustSave({ name: "De Ana", options: [{ name: "Una" }] });

    const edit = await saveGroup(BETO, { id, business: NEG_ANA, name: "Hackeado" });
    expect(edit.ok).toBe(false);

    const upd = await asUser(db, BETO, `update option_groups set name = 'X' where id = '${id}'`);
    expect(upd.ok && upd.affected).toBe(0);
    const updOpt = await asUser(db, BETO, `update options set name = 'X' where group_id = '${id}'`);
    expect(updOpt.ok && updOpt.affected).toBe(0);
    const del = await asUser(db, BETO, `delete from option_groups where id = '${id}'`);
    expect(del.ok && del.affected).toBe(0);

    expect((await db.query(`select name from option_groups where id = '${id}'`)).rows[0].name).toBe("De Ana");
  });

  it("no puede asociar un grupo ajeno a un producto propio, ni un producto ajeno", async () => {
    const delAna = await mustSave({ name: "Para Ana" });

    const grupoAjeno = await setGroups(BETO, PB, [delAna], NEG_BETO);
    expect(grupoAjeno.ok).toBe(false);

    const productoAjeno = await setGroups(BETO, P1, [delAna], NEG_ANA);
    expect(productoAjeno.ok).toBe(false);

    // Tampoco con un INSERT directo: la clave compuesta (id, business_id) lo impide.
    const directo = await asUser(
      db, BETO,
      `insert into product_option_groups (product_id, group_id, business_id)
       values ('${PB}', '${delAna}', '${NEG_BETO}')`,
    );
    expect(directo.ok).toBe(false);
    expect(!directo.ok && directo.code).toBe("23503");

    expect(await count("product_option_groups", `group_id = '${delAna}'`)).toBe(0);
  });

  it("una opción no puede apuntar a un grupo de otro negocio", async () => {
    const delAna = await mustSave({ name: "Ajeno 2" });
    const r = await asUser(
      db, BETO,
      `insert into options (group_id, business_id, name) values ('${delAna}', '${NEG_BETO}', 'Colada')`,
    );
    expect(r.ok).toBe(false);
  });

  it("anon no puede llamar a las funciones", async () => {
    const r = await saveGroup(null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501");
  });
});

describe("borrados — ADMIN-OPCIONES-8", () => {
  it("borrar un grupo borra sus opciones y sus asociaciones, pero no los productos", async () => {
    const id = await mustSave({ name: "Efímero", options: [{ name: "a" }, { name: "b" }] });
    await setGroups(ANA, P1, [id]);

    const r = await asUser(db, ANA, `delete from option_groups where id = '${id}'`);
    expect(r.ok && r.affected).toBe(1);

    expect(await count("options", `group_id = '${id}'`)).toBe(0);
    expect(await count("product_option_groups", `group_id = '${id}'`)).toBe(0);
    expect(await count("products", `id = '${P1}'`)).toBe(1);
  });

  it("borrar una opción no toca el grupo ni las otras opciones", async () => {
    const id = await mustSave({ options: [{ name: "a" }, { name: "b" }] });
    const [a] = await optionsOf(id);

    const r = await asUser(db, ANA, `delete from options where id = '${a.id}'`);
    expect(r.ok && r.affected).toBe(1);

    expect((await optionsOf(id)).map((o) => o.name)).toEqual(["b"]);
  });

  it("borrar un producto saca sus asociaciones pero deja el grupo", async () => {
    const id = await mustSave({ name: "Sobreviviente" });
    const prod = "d1d1d1d1-0000-0000-0000-0000000000f1";
    await db.exec(
      `insert into products (id, business_id, category_id, name, price)
       values ('${prod}', '${NEG_ANA}', '${CAT_ANA}', 'Efímero', 1)`,
    );
    await setGroups(ANA, prod, [id]);

    await asUser(db, ANA, `delete from products where id = '${prod}'`);

    expect(await count("product_option_groups", `product_id = '${prod}'`)).toBe(0);
    expect(await count("option_groups", `id = '${id}'`)).toBe(1);
  });
});

describe("reordenar grupos — ADMIN-OPCIONES-9", () => {
  it("guarda la posición de cada grupo propio y no toca los ajenos", async () => {
    const a = await mustSave({ name: "Orden A" });
    const b = await mustSave({ name: "Orden B" });

    for (const [i, id] of [b, a].entries()) {
      const r = await asUser(
        db, ANA,
        `update option_groups set sort_order = ${i}, updated_at = now()
         where business_id = '${NEG_ANA}' and id = '${id}'`,
      );
      expect(r.ok && r.affected).toBe(1);
    }

    const rows = await db.query<{ id: string }>(
      `select id from option_groups where id in ('${a}', '${b}') order by sort_order`,
    );
    expect(rows.rows.map((r) => r.id)).toEqual([b, a]);

    const ajeno = await asUser(db, BETO, `update option_groups set sort_order = 0 where id = '${a}'`);
    expect(ajeno.ok && ajeno.affected).toBe(0);
  });
});

describe("grupos obligatorios y promociones — ADMIN-OPCIONES-10", () => {
  const PROMO = "e1000000-0000-0000-0000-000000000001";
  const PRO_P = "d1d1d1d1-0000-0000-0000-0000000000a1";
  const FREE_P = "d1d1d1d1-0000-0000-0000-0000000000a2";

  beforeAll(async () => {
    await db.exec(`
      insert into products (id, business_id, category_id, name, price) values
        ('${PRO_P}', '${NEG_ANA}', '${CAT_ANA}', 'En promo', 100),
        ('${FREE_P}', '${NEG_ANA}', '${CAT_ANA}', 'Libre', 100);
      insert into promotions (id, business_id, name, type, discount_percent)
        values ('${PROMO}', '${NEG_ANA}', 'Oferta', 'percent', 10);
      insert into promotion_items (promotion_id, product_id, business_id)
        values ('${PROMO}', '${PRO_P}', '${NEG_ANA}');
    `);
  });

  function savePromo(products: string[]) {
    const ids = `ARRAY[${products.map((id) => `'${id}'`).join(",")}]::uuid[]`;
    return asUser(
      db, ANA,
      `select public.save_promotion('${PROMO}'::uuid, '${NEG_ANA}'::uuid, 'Oferta', '', 'percent', 10, null, true, ${ids})`,
    );
  }

  it("no asocia un grupo obligatorio a un producto que está en una promoción", async () => {
    const g = await mustSave({ name: "Oblig 1", min: 1, max: 1 });
    const r = await setGroups(ANA, PRO_P, [g]);

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0014");
    expect(!r.ok && r.error).toMatch(/promoci/i);
    expect(await groupsOf(PRO_P)).toEqual([]);
  });

  it("sí asocia un grupo opcional a un producto en una promoción", async () => {
    const g = await mustSave({ name: "Opcional 1", min: 0, max: 2 });
    expect((await setGroups(ANA, PRO_P, [g])).ok).toBe(true);
    await setGroups(ANA, PRO_P, []);
  });

  it("sí asocia un grupo obligatorio a un producto que no está en promociones", async () => {
    const g = await mustSave({ name: "Oblig 2", min: 1, max: 1 });
    expect((await setGroups(ANA, FREE_P, [g])).ok).toBe(true);
  });

  it("no agrega a una promoción un producto con grupo obligatorio (save_promotion)", async () => {
    const r = await savePromo([PRO_P, FREE_P]);

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0014");
    expect(!r.ok && r.error).toMatch(/Libre/);
    // Atómico: la promoción sigue con su producto de antes.
    expect(await count("promotion_items", `promotion_id = '${PROMO}'`)).toBe(1);
  });

  it("no agrega con un INSERT directo a promotion_items", async () => {
    const r = await asUser(
      db, ANA,
      `insert into promotion_items (promotion_id, product_id, business_id)
       values ('${PROMO}', '${FREE_P}', '${NEG_ANA}')`,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0014");
  });

  it("agrega a la promoción un producto cuyo grupo es opcional", async () => {
    await setGroups(ANA, FREE_P, []);
    const g = await mustSave({ name: "Opcional 2", min: 0, max: 3 });
    await setGroups(ANA, FREE_P, [g]);

    expect((await savePromo([PRO_P, FREE_P])).ok).toBe(true);
    await savePromo([PRO_P]);
    await setGroups(ANA, FREE_P, []);
  });

  it("no vuelve obligatorio un grupo asociado a un producto que está en una promoción", async () => {
    const g = await mustSave({ name: "Por endurecer", min: 0, max: 2 });
    await setGroups(ANA, PRO_P, [g]);

    const r = await saveGroup(ANA, { id: g, name: "Por endurecer", min: 1, max: 2 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0014");
    expect((await db.query(`select min_select from option_groups where id = '${g}'`)).rows[0].min_select).toBe(0);

    await setGroups(ANA, PRO_P, []);
  });

  it("vuelve obligatorio un grupo asociado solo a productos fuera de promociones", async () => {
    const g = await mustSave({ name: "Endurecible", min: 0, max: 2 });
    await setGroups(ANA, FREE_P, [g]);

    expect((await saveGroup(ANA, { id: g, name: "Endurecible", min: 1, max: 2 })).ok).toBe(true);
    await setGroups(ANA, FREE_P, []);
  });
});

describe("negocio suspendido — ADMIN-OPCIONES-11", () => {
  async function suspend(active: boolean) {
    const r = await asUser(db, SUPER, `update businesses set active = ${active} where id = '${NEG_ANA}'`);
    expect(r.ok).toBe(true);
  }

  it("no crea ni edita grupos, opciones ni asociaciones, y al reactivar vuelve a poder", async () => {
    const id = await mustSave({ name: "Antes de suspender", options: [{ name: "a" }] });

    await suspend(false);

    const crear = await saveGroup(ANA, { name: "Nuevo suspendido" });
    expect(crear.ok).toBe(false);
    expect(!crear.ok && crear.code).toBe("P0010");

    const editar = await saveGroup(ANA, { id, name: "Cambio suspendido" });
    expect(editar.ok).toBe(false);
    expect(!editar.ok && editar.code).toBe("P0010");

    const asociar = await setGroups(ANA, P1, [id]);
    expect(asociar.ok).toBe(false);
    expect(!asociar.ok && asociar.code).toBe("P0010");

    const opcion = await asUser(db, ANA, `update options set name = 'x' where group_id = '${id}'`);
    expect(opcion.ok).toBe(false);
    expect(!opcion.ok && opcion.code).toBe("P0010");

    const orden = await asUser(db, ANA, `update option_groups set sort_order = 9 where id = '${id}'`);
    expect(orden.ok).toBe(false);

    await suspend(true);
    expect((await saveGroup(ANA, { id, name: "De vuelta" })).ok).toBe(true);
  });
});
