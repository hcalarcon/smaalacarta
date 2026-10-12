// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// PUBLICO-62 a 66, ADMIN-CONFIG-48, ADMIN-PEDIDOS-23 y SEGUIMIENTO-36 contra Postgres real: nota por producto del
// pedido.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002"; // tiene las notas apagadas
const CAT_ANA = "c1000000-0000-0000-0000-000000000001";
const CAT_BETO = "c2000000-0000-0000-0000-000000000001";
const HAMB = "d1000000-0000-0000-0000-000000000001";
const FERNET = "d2000000-0000-0000-0000-000000000001";

let db: TestDb;

type Line = { id: string; quantity?: number; note?: unknown };

function order(lines: Line[], slug = "ana") {
  const payload = JSON.stringify(
    lines.map((l) => ({
      id: l.id,
      kind: "product",
      quantity: l.quantity ?? 1,
      ...(l.note !== undefined ? { note: l.note } : {}),
    })),
  ).replace(/'/g, "''");

  return asUser(
    db,
    null,
    `select public.create_public_order('${slug}', 'Cliente', 'retiro', 'efectivo', null, '${payload}'::jsonb,
       p_customer_phone => '3515551234') as result`,
  );
}

async function notesOf(code: string) {
  const r = await db.query<{ name: string; note: string | null }>(
    `select i.name, i.note from order_items i join orders o on o.id = i.order_id
     where o.code = '${code}' order by i.sort_order`,
  );
  return r.rows.map((row) => row.note);
}

async function placed(lines: Line[], slug = "ana") {
  const r = await order(lines, slug);
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0].result as { code: string }).code;
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published, allow_item_notes) values
      ('${NEG_ANA}', true, true), ('${NEG_BETO}', true, false);
    insert into categories (id, business_id, name) values
      ('${CAT_ANA}', '${NEG_ANA}', 'Comidas'), ('${CAT_BETO}', '${NEG_BETO}', 'Tragos');
    insert into products (id, business_id, category_id, name, price) values
      ('${HAMB}', '${NEG_ANA}', '${CAT_ANA}', 'Hamburguesa', 1000),
      ('${FERNET}', '${NEG_BETO}', '${CAT_BETO}', 'Fernet', 2500);
  `);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("la nota se guarda en el ítem — PUBLICO-62", () => {
  it("guarda la nota del cliente tal cual, y nulo si no hay", async () => {
    const code = await placed([
      { id: HAMB, note: "Sin cheddar y con mostaza" },
    ]);
    expect(await notesOf(code)).toEqual(["Sin cheddar y con mostaza"]);

    const sin = await placed([{ id: HAMB }]);
    expect(await notesOf(sin)).toEqual([null]);
  });

  it("la limpia: saltos de línea y espacios de más pasan a un espacio, y una nota vacía queda nula", async () => {
    const code = await placed([{ id: HAMB, note: "  sin\ncheddar\r\n\t con   mostaza\u0007  " }]);
    expect(await notesOf(code)).toEqual(["sin cheddar con mostaza"]);

    const vacia = await placed([{ id: HAMB, note: " \n\t " }]);
    expect(await notesOf(vacia)).toEqual([null]);
  });

  it("la recorta a 140 caracteres", async () => {
    const code = await placed([{ id: HAMB, note: "x".repeat(300) }]);
    const [note] = await notesOf(code);
    expect(note).toHaveLength(140);
  });

  it("un valor que no es texto se ignora", async () => {
    const code = await placed([{ id: HAMB, note: 42 }]);
    expect(await notesOf(code)).toEqual([null]);
  });

  it("el mismo producto con distinta nota son líneas distintas; con la misma nota, repetido", async () => {
    const code = await placed([
      { id: HAMB, note: "sin cheddar" },
      { id: HAMB, note: "con mostaza" },
    ]);
    expect(await notesOf(code)).toEqual(["sin cheddar", "con mostaza"]);

    const repetido = await order([
      { id: HAMB, note: "sin cheddar" },
      { id: HAMB, note: "sin  cheddar" },
    ]);
    expect(repetido.ok).toBe(false);
  });

  it("no cambia el total: la nota no tiene precio", async () => {
    const r = await order([{ id: HAMB, quantity: 2, note: "bien cocida" }]);
    expect(r.ok && (r.rows[0].result as { total: number }).total).toBe(2000);
  });
});

describe("con el interruptor apagado se ignora sin error — PUBLICO-64", () => {
  it("el pedido entra y la nota no se guarda", async () => {
    const code = await placed([{ id: FERNET, note: "con hielo" }], "beto");
    expect(await notesOf(code)).toEqual([null]);
  });

  it("dos líneas que solo difieren en la nota no se vuelven distintas", async () => {
    const r = await order(
      [
        { id: FERNET, note: "con hielo" },
        { id: FERNET, note: "sin hielo" },
      ],
      "beto",
    );
    expect(r.ok).toBe(false);
  });
});

describe("el menú público dice si hay notas — PUBLICO-64", () => {
  it("config.notasPorItem sigue al interruptor", async () => {
    const menu = async (slug: string) => {
      const r = await asUser(db, null, `select public.public_menu('${slug}') as m`);
      if (!r.ok) throw new Error(r.error);
      return (r.rows[0].m as { config: { notasPorItem: boolean } }).config.notasPorItem;
    };

    expect(await menu("ana")).toBe(true);
    expect(await menu("beto")).toBe(false);
  });

  it("las notas están permitidas por defecto en un negocio nuevo", async () => {
    await db.exec(`
      insert into businesses (id, name, slug, whatsapp, plan_completo)
        values ('e1e1e1e1-0000-0000-0000-000000000009', 'Nuevo', 'nuevo', '5493510000009', true);
      insert into business_settings (business_id, published) values ('e1e1e1e1-0000-0000-0000-000000000009', true);
    `);
    const r = await db.query<{ n: boolean }>(
      "select allow_item_notes as n from business_settings where business_id = 'e1e1e1e1-0000-0000-0000-000000000009'",
    );
    expect(r.rows[0].n).toBe(true);
  });
});

describe("save_business_settings guarda el interruptor — ADMIN-CONFIG-48", () => {
  it("el parámetro nuevo escribe allow_item_notes", async () => {
    const call = (flag: boolean) =>
      asUser(
        db,
        ANA,
        `select public.save_business_settings('${NEG_ANA}', true, 'moderno', null, '#112233', '#445566', null,
          '{}'::jsonb, null, null, null, null, false, null, null, null, null, 'claro',
          array['retiro'], array['efectivo'], null, null, false, 60, false, '{}'::jsonb, 50, 50, true, ${flag})`,
      );

    const off = await call(false);
    expect(off.ok ? "ok" : off.error).toBe("ok");
    const a = await db.query<{ n: boolean }>(
      `select allow_item_notes as n from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(a.rows[0].n).toBe(false);

    expect((await call(true)).ok).toBe(true);
    const b = await db.query<{ n: boolean }>(
      `select allow_item_notes as n from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(b.rows[0].n).toBe(true);
  });
});

describe("el seguimiento devuelve la nota — SEGUIMIENTO-36", () => {
  it("cada ítem trae su nota, y sin nota no trae la clave", async () => {
    const code = await placed([{ id: HAMB, note: "sin cheddar" }]);
    const code2 = await placed([{ id: HAMB }]);

    const get = async (c: string) => {
      const r = await asUser(db, null, `select public.public_order_tracking('${c}') as t`);
      if (!r.ok) throw new Error(r.error);
      return (r.rows[0].t as { items: Record<string, unknown>[] }).items[0];
    };

    expect((await get(code)).nota).toBe("sin cheddar");
    expect(await get(code2)).not.toHaveProperty("nota");
  });
});

describe("pedido manual — ADMIN-PEDIDOS-23", () => {
  const manual = (user: string, business: string, items: unknown[]) =>
    asUser(
      db,
      user,
      `select public.create_manual_order('${business}', 'Mostrador', 'retiro', 'efectivo', null,
        '${JSON.stringify(items)}'::jsonb) as r`,
    );

  it("guarda la nota limpia y recortada, aunque el negocio tenga las notas apagadas", async () => {
    const r = await manual(BETO, NEG_BETO, [
      { name: "Fernet", unit_price: 2500, quantity: 1, note: " con\nhielo " },
      { name: "Maní", unit_price: 500, quantity: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const id = (r.rows[0].r as { id: string }).id;
    const rows = await db.query<{ note: string | null }>(
      `select note from order_items where order_id = '${id}' order by sort_order`,
    );
    expect(rows.rows.map((x) => x.note)).toEqual(["con hielo", null]);
  });
});

describe("panel del repartidor — ADMIN-PEDIDOS-22", () => {
  it("courier_orders trae la nota de cada ítem del pedido que lleva", async () => {
    const REPA = "cccccccc-0000-0000-0000-000000000003";
    const TOQUE = "7a0c0e00-0000-4000-8000-000000000001";
    await createUser(db, { id: REPA, email: "repa@x.com" });
    await db.exec(`insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${REPA}')`);

    const code = await placed([{ id: HAMB, note: "sin cheddar" }]);
    await db.exec(
      `update orders set courier_id = '${TOQUE}', courier_status = 'accepted' where code = '${code}'`,
    );

    const r = await asUser(db, REPA, "select public.courier_orders() as l");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const list = r.rows[0].l as { items: { nombre: string; nota?: string }[] }[];
    expect(list.flatMap((o) => o.items.map((i) => i.nota))).toContain("sin cheddar");
  });
});

describe("restricciones y RLS — ADMIN-PEDIDOS-23", () => {
  it("la base rechaza una nota de más de 140 caracteres", async () => {
    const o = await placed([{ id: HAMB }]);
    await expect(
      db.exec(
        `update order_items set note = '${"y".repeat(141)}' where order_id = (select id from orders where code = '${o}')`,
      ),
    ).rejects.toThrow();
  });

  it("un local lee las notas de sus pedidos y no las de otro", async () => {
    const code = await placed([{ id: HAMB, note: "sin cheddar" }]);

    const propias = await asUser(
      db,
      ANA,
      `select i.note from order_items i join orders o on o.id = i.order_id where o.code = '${code}'`,
    );
    expect(propias.ok && propias.rows.map((r) => r.note)).toEqual(["sin cheddar"]);

    const ajenas = await asUser(
      db,
      BETO,
      `select i.note from order_items i join orders o on o.id = i.order_id where o.code = '${code}'`,
    );
    expect(ajenas.ok && ajenas.rows).toEqual([]);
  });
});
