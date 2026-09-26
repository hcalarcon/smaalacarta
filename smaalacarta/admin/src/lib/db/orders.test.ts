// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-PEDIDOS-1 a 5 y SEGUIMIENTO-1 a 6 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";

const CAFE = "d1000000-0000-0000-0000-000000000001";
const TE = "d1000000-0000-0000-0000-000000000002";
const JUGO = "d1000000-0000-0000-0000-000000000003"; // inactivo
const MILANESA = "d1000000-0000-0000-0000-000000000004";
const FANTASMA = "d1000000-0000-0000-0000-000000000005"; // categoría oculta
const FERNET = "d2000000-0000-0000-0000-000000000001"; // de Beto
const DESAYUNO = "e1000000-0000-0000-0000-000000000001"; // 20 % sobre Té + Café
const COMBO = "e1000000-0000-0000-0000-000000000002"; // $1500 por Café + Milanesa
const CON_OCULTO = "e1000000-0000-0000-0000-000000000003"; // lleva un producto inactivo
const APAGADA = "e1000000-0000-0000-0000-000000000004";

let db: TestDb;

type Line = { id: string; kind?: "product" | "promo"; quantity?: number };

const items = (lines: Line[]) =>
  JSON.stringify(lines.map((l) => ({ id: l.id, kind: l.kind ?? "product", quantity: l.quantity ?? 1 })));

const sqlText = (value: string | null) => (value === null ? "null" : "'" + value.replace(/'/g, "''") + "'");

function order(
  slug: string,
  lines: Line[] | string,
  extra: { name?: string | null; delivery?: string; payment?: string; notes?: string | null } = {},
  user: string | null = null,
) {
  const payload = typeof lines === "string" ? lines : items(lines);
  return asUser(
    db,
    user,
    `select public.create_public_order(
       '${slug}',
       ${sqlText(extra.name === undefined ? "Cliente Prueba" : extra.name)},
       ${sqlText(extra.delivery ?? "retiro")},
       ${sqlText(extra.payment ?? "efectivo")},
       ${sqlText(extra.notes === undefined ? "Sin cebolla" : extra.notes)},
       '${payload}'::jsonb) as result`,
  );
}

type Created = { code: string; number: number; total: number };
const created = (r: Awaited<ReturnType<typeof order>>) => (r.ok ? (r.rows[0].result as Created) : null);

async function count(sql: string) {
  const r = await db.query<{ n: string }>(sql);
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001'),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002'),
      ('c3c3c3c3-0000-0000-0000-000000000003', 'Privado', 'privado', null);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published) values
      ('${NEG_ANA}', true), ('${NEG_BETO}', true),
      ('c3c3c3c3-0000-0000-0000-000000000003', false);

    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true),
      ('c1000000-0000-0000-0000-000000000002', '${NEG_ANA}', 'Comidas', true),
      ('c1000000-0000-0000-0000-000000000004', '${NEG_ANA}', 'Oculta', false),
      ('c2000000-0000-0000-0000-000000000001', '${NEG_BETO}', 'Tragos', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true),
      ('${TE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Té', 800, true),
      ('${JUGO}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Jugo', 1200, false),
      ('${MILANESA}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000002', 'Milanesa', 5000, true),
      ('${FANTASMA}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000004', 'Fantasma', 100, true),
      ('${FERNET}', '${NEG_BETO}', 'c2000000-0000-0000-0000-000000000001', 'Fernet', 2500, true);

    insert into promotions (id, business_id, name, type, discount_percent, price, active) values
      ('${DESAYUNO}', '${NEG_ANA}', 'Desayuno', 'percent', 20, null, true),
      ('${COMBO}', '${NEG_ANA}', 'Combo', 'combo', 0, 1500, true),
      ('${CON_OCULTO}', '${NEG_ANA}', 'Con oculto', 'percent', 10, null, true),
      ('${APAGADA}', '${NEG_ANA}', 'Apagada', 'percent', 10, null, false);
    insert into promotion_items (promotion_id, product_id, business_id, sort_order) values
      ('${DESAYUNO}', '${TE}', '${NEG_ANA}', 0), ('${DESAYUNO}', '${CAFE}', '${NEG_ANA}', 1),
      ('${COMBO}', '${CAFE}', '${NEG_ANA}', 0), ('${COMBO}', '${MILANESA}', '${NEG_ANA}', 1),
      ('${CON_OCULTO}', '${JUGO}', '${NEG_ANA}', 0),
      ('${APAGADA}', '${CAFE}', '${NEG_ANA}', 0);
  `);
}, 60_000);

// El freno de 20 pedidos por minuto se probaría solo con los pedidos de ese test:
// para los demás, los pedidos anteriores se "envejecen" y no cuentan.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

describe("crear un pedido — SEGUIMIENTO-1 y 2", () => {
  it("un visitante sin sesión crea un pedido en un negocio publicado", async () => {
    const r = await order("ana", [{ id: CAFE, quantity: 2 }, { id: MILANESA }]);

    expect(r.ok).toBe(true);
    const c = created(r)!;
    expect(c.number).toBe(1);
    expect(c.total).toBe(7000);
    expect(c.code).toMatch(/^[0-9a-f]{20}$/);
  });

  it("el total sale de los precios del menú (el navegador no manda precios)", async () => {
    const r = await order("ana", [{ id: TE, quantity: 3 }]);
    expect(created(r)!.total).toBe(2400);
  });

  it("una promoción de porcentaje se cobra con su descuento", async () => {
    const r = await order("ana", [{ id: DESAYUNO, kind: "promo" }]);
    expect(created(r)!.total).toBe(1440);
  });

  it("un combo se cobra a su precio fijo", async () => {
    const r = await order("ana", [{ id: COMBO, kind: "promo", quantity: 2 }]);
    expect(created(r)!.total).toBe(3000);
  });

  it("el precio de una promoción coincide con el que muestra el menú público", async () => {
    await db.exec(`insert into business_settings (business_id, published) values ('${NEG_ANA}', true) on conflict (business_id) do update set published = true`);
    const menu = await asUser(db, null, "select public.public_menu('ana') as menu");
    const ofertas = (menu.ok && (menu.rows[0].menu as { menu: { categorias: { tipo?: string; items: { nombre: string; precio: number }[] }[] } }).menu.categorias.find((c) => c.tipo === "ofertas")!.items) || [];

    const desayuno = created(await order("ana", [{ id: DESAYUNO, kind: "promo" }]))!.total;
    const combo = created(await order("ana", [{ id: COMBO, kind: "promo" }]))!.total;

    expect(ofertas.find((o) => o.nombre === "Desayuno")!.precio).toBe(desayuno);
    expect(ofertas.find((o) => o.nombre === "Combo")!.precio).toBe(combo);
  });

  it("guarda el nombre, el precio y la cantidad de cada ítem en el momento del pedido — ADMIN-PEDIDOS-5", async () => {
    const c = created(await order("ana", [{ id: CAFE, quantity: 2 }, { id: DESAYUNO, kind: "promo" }]))!;

    const rows = await db.query<{ name: string; unit_price: string; quantity: number }>(
      `select i.name, i.unit_price, i.quantity from order_items i join orders o on o.id = i.order_id
       where o.code = '${c.code}' order by i.sort_order`,
    );
    expect(rows.rows.map((r) => [r.name, Number(r.unit_price), r.quantity])).toEqual([
      ["Café", 1000, 2],
      ["Desayuno", 1440, 1],
    ]);
  });

  it("queda 'pendiente', con su primer evento en la línea de tiempo", async () => {
    const c = created(await order("ana", [{ id: CAFE }]))!;

    const o = await db.query<{ status: string; source: string; customer_name: string; notes: string }>(
      `select status, source, customer_name, notes from orders where code = '${c.code}'`,
    );
    const e = await db.query<{ status: string }>(
      `select e.status from order_events e join orders o on o.id = e.order_id where o.code = '${c.code}'`,
    );
    expect(o.rows[0]).toEqual({ status: "pending", source: "web", customer_name: "Cliente Prueba", notes: "Sin cebolla" });
    expect(e.rows.map((r) => r.status)).toEqual(["pending"]);
  });

  it("el código de cada pedido es distinto", async () => {
    const a = created(await order("ana", [{ id: CAFE }]))!.code;
    const b = created(await order("ana", [{ id: CAFE }]))!.code;
    expect(a).not.toBe(b);
  });
});

describe("qué se puede pedir — SEGUIMIENTO-1 y 3", () => {
  it.each([
    ["un negocio que no existe", "no-existe", [{ id: CAFE }], "P0002"],
    ["un negocio sin publicar", "privado", [{ id: CAFE }], "P0002"],
  ])("rechaza %s", async (_caso, slug, lines, code) => {
    const r = await order(slug, lines);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe(code);
  });

  it.each([
    ["un producto inactivo", [{ id: JUGO }]],
    ["un producto de una categoría oculta", [{ id: FANTASMA }]],
    ["un producto de otro negocio", [{ id: FERNET }]],
    ["un producto que no existe", [{ id: "99999999-0000-0000-0000-000000000009" }]],
    ["una promoción apagada", [{ id: APAGADA, kind: "promo" as const }]],
    ["una promoción con un producto inactivo", [{ id: CON_OCULTO, kind: "promo" as const }]],
    ["una promoción que no existe", [{ id: "99999999-0000-0000-0000-000000000009", kind: "promo" as const }]],
    ["un producto pedido como promoción", [{ id: CAFE, kind: "promo" as const }]],
    ["una promoción pedida como producto", [{ id: DESAYUNO, kind: "product" as const }]],
  ])("rechaza %s, y no crea nada", async (_caso, lines) => {
    const antes = await count("select count(*) as n from orders");

    const r = await order("ana", lines);

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0001");
    expect(await count("select count(*) as n from orders")).toBe(antes);
  });

  it("si un solo ítem es inválido no se crea ninguno (atómico)", async () => {
    const antes = await count("select count(*) as n from orders");
    const itemsAntes = await count("select count(*) as n from order_items");

    const r = await order("ana", [{ id: CAFE }, { id: TE }, { id: JUGO }]);

    expect(r.ok).toBe(false);
    expect(await count("select count(*) as n from orders")).toBe(antes);
    expect(await count("select count(*) as n from order_items")).toBe(itemsAntes);
  });

  it("no se puede pedir en Ana con productos de Beto aunque el negocio de Beto exista", async () => {
    expect((await order("beto", [{ id: FERNET }])).ok).toBe(true);
    expect((await order("beto", [{ id: CAFE }])).ok).toBe(false);
  });
});

describe("cierre temporal — SEGUIMIENTO-1", () => {
  const TODAY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date";

  it("cerrado temporalmente no recibe pedidos", async () => {
    await db.exec(`update business_settings set temporarily_closed = true, reopens_on = ${TODAY} + 3 where business_id = '${NEG_BETO}'`);
    const r = await order("beto", [{ id: FERNET }]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0005");
  });

  it("cerrado sin fecha tampoco", async () => {
    await db.exec(`update business_settings set temporarily_closed = true, reopens_on = null where business_id = '${NEG_BETO}'`);
    expect((await order("beto", [{ id: FERNET }])).ok).toBe(false);
  });

  it("con la fecha de reapertura vencida vuelve a recibir pedidos", async () => {
    await db.exec(`update business_settings set temporarily_closed = true, reopens_on = ${TODAY} where business_id = '${NEG_BETO}'`);
    expect((await order("beto", [{ id: FERNET }])).ok).toBe(true);
    await db.exec(`update business_settings set temporarily_closed = false, reopens_on = null where business_id = '${NEG_BETO}'`);
  });
});

describe("límites — SEGUIMIENTO-4", () => {
  it.each([
    ["sin ítems", "[]"],
    ["ítems que no son una lista", '{"id":"x"}'],
    ["cantidad 0", items([{ id: CAFE, quantity: 0 }])],
    ["cantidad de 21 unidades", items([{ id: CAFE, quantity: 21 }])],
    ["cantidad negativa", items([{ id: CAFE, quantity: -1 }])],
    ["cantidad decimal", '[{"id":"' + CAFE + '","kind":"product","quantity":1.5}]'],
    ["cantidad que no es un número", '[{"id":"' + CAFE + '","kind":"product","quantity":"2"}]'],
    ["un id que no es un UUID", '[{"id":"no-es-uuid","kind":"product","quantity":1}]'],
    ["un tipo desconocido", '[{"id":"' + CAFE + '","kind":"servicio","quantity":1}]'],
    ["el mismo producto dos veces", items([{ id: CAFE }, { id: CAFE }])],
  ])("rechaza %s", async (_caso, payload) => {
    const r = await order("ana", payload);
    expect(r.ok).toBe(false);
    expect(!r.ok && ["22023", "P0001"]).toContain(!r.ok ? r.code : "");
  });

  it("rechaza más de 40 ítems distintos", async () => {
    const muchos = Array.from({ length: 41 }, (_, i) => ({
      id: `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`,
      kind: "product",
      quantity: 1,
    }));
    const r = await order("ana", JSON.stringify(muchos));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("22023");
  });

  it("acepta 20 unidades de un producto", async () => {
    expect((await order("ana", [{ id: CAFE, quantity: 20 }])).ok).toBe(true);
  });

  it.each([
    ["sin nombre", { name: null }],
    ["con el nombre vacío", { name: "   " }],
    ["con un nombre de más de 80 caracteres", { name: "a".repeat(81) }],
    ["con una entrega de más de 30 caracteres", { delivery: "a".repeat(31) }],
    ["con un pago de más de 30 caracteres", { payment: "a".repeat(31) }],
    ["con notas de más de 500 caracteres", { notes: "a".repeat(501) }],
  ])("rechaza un pedido %s", async (_caso, extra) => {
    const r = await order("ana", [{ id: CAFE }], extra);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("22023");
  });

  it("acepta notas vacías y el nombre en el límite", async () => {
    expect((await order("ana", [{ id: CAFE }], { notes: null, name: "a".repeat(80) })).ok).toBe(true);
  });

  it("un negocio no recibe más de 20 pedidos por minuto desde el menú", async () => {
    await db.exec(`delete from orders where business_id = '${NEG_BETO}'`);

    for (let i = 0; i < 20; i++) {
      expect((await order("beto", [{ id: FERNET }])).ok).toBe(true);
    }
    const r = await order("beto", [{ id: FERNET }]);

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0003");
    // Otro negocio no se ve afectado.
    expect((await order("ana", [{ id: CAFE }])).ok).toBe(true);
  });

  it("los pedidos cargados a mano no cuentan para ese límite", async () => {
    await db.exec(`delete from orders where business_id = '${NEG_BETO}'`);
    const r = await asUser(
      db, BETO,
      `select public.create_manual_order('${NEG_BETO}', 'Cliente', 'retiro', 'efectivo', null,
         '[{"name":"Fernet","unit_price":2500,"quantity":1}]'::jsonb)`,
    );
    expect(r.ok).toBe(true);
    expect((await order("beto", [{ id: FERNET }])).ok).toBe(true);
  });
});

describe("numeración — ADMIN-PEDIDOS-4", () => {
  it("cada negocio numera sus pedidos 1, 2, 3… sin saltos", async () => {
    await db.exec(`delete from orders where business_id = '${NEG_ANA}'; delete from order_counters where business_id = '${NEG_ANA}'`);

    const numeros: number[] = [];
    for (let i = 0; i < 5; i++) numeros.push(created(await order("ana", [{ id: CAFE }]))!.number);

    expect(numeros).toEqual([1, 2, 3, 4, 5]);
  });

  it("los pedidos rechazados no gastan número", async () => {
    await order("ana", [{ id: JUGO }]);
    expect(created(await order("ana", [{ id: CAFE }]))!.number).toBe(6);
  });

  it("los cargados a mano siguen la misma secuencia", async () => {
    const r = await asUser(
      db, ANA,
      `select public.create_manual_order('${NEG_ANA}', 'Manual', 'retiro', 'efectivo', null,
         '[{"name":"Café","unit_price":1000,"quantity":1}]'::jsonb) as result`,
    );
    expect(r.ok && (r.rows[0].result as { number: number }).number).toBe(7);
    expect(created(await order("ana", [{ id: CAFE }]))!.number).toBe(8);
  });

  it("no puede haber dos pedidos con el mismo número en un negocio", async () => {
    const r = await db.query(
      `insert into orders (business_id, order_number, code) values ('${NEG_ANA}', '1', 'duplicado00000000000')`,
    ).then(() => "ok", (e) => (e as { code?: string }).code);
    expect(r).toBe("23505");
  });

  it("el negocio de Beto tiene su propia numeración", async () => {
    await db.exec(`delete from orders where business_id = '${NEG_BETO}'; delete from order_counters where business_id = '${NEG_BETO}'`);
    expect(created(await order("beto", [{ id: FERNET }]))!.number).toBe(1);
  });
});

describe("seguimiento por código — SEGUIMIENTO-5", () => {
  async function track(code: string, user: string | null = null) {
    const r = await asUser(db, user, `select public.public_order_tracking('${code}') as t`);
    if (!r.ok) throw new Error(r.error);
    return r.rows[0].t as null | {
      negocio: { nombre: string; telefono: string; slug: string };
      pedido: Record<string, unknown>;
      items: { nombre: string; cantidad: number; precio: number }[];
      eventos: { estado: string; fecha: string }[];
    };
  }

  it("con el código se ve el estado, el detalle y la línea de tiempo", async () => {
    const c = created(await order("ana", [{ id: CAFE, quantity: 2 }, { id: DESAYUNO, kind: "promo" }]))!;

    const t = await track(c.code);

    expect(t!.negocio).toEqual({ nombre: "Ana Resto", telefono: "5493510000001", slug: "ana" });
    expect(t!.pedido).toMatchObject({ numero: String(c.number), estado: "pending", total: 3440 });
    expect(t!.items).toEqual([
      { nombre: "Café", cantidad: 2, precio: 1000 },
      { nombre: "Desayuno", cantidad: 1, precio: 1440 },
    ]);
    expect(t!.eventos.map((e) => e.estado)).toEqual(["pending"]);
  });

  it("no incluye el nombre del cliente, las notas ni datos internos", async () => {
    const c = created(await order("ana", [{ id: CAFE }], { name: "Juan Secreto", notes: "Timbre roto", delivery: "delivery" }))!;

    const raw = JSON.stringify(await track(c.code));

    expect(raw).not.toContain("Juan");
    expect(raw).not.toContain("Secreto");
    expect(raw).not.toContain("Timbre");
    expect(raw).not.toContain("business_id");
    expect(raw).not.toContain(NEG_ANA);
  });

  it("la línea de tiempo crece con cada cambio de estado", async () => {
    const c = created(await order("ana", [{ id: CAFE }]))!;
    const id = (await db.query<{ id: string }>(`select id from orders where code = '${c.code}'`)).rows[0].id;

    await asUser(db, ANA, `select public.set_order_status('${id}', 'confirmed')`);
    await asUser(db, ANA, `select public.set_order_status('${id}', 'ready')`);

    const t = await track(c.code);
    expect(t!.pedido.estado).toBe("ready");
    expect(t!.eventos.map((e) => e.estado)).toEqual(["pending", "confirmed", "ready"]);
  });

  it.each(["", "abc", "0".repeat(19), "0".repeat(21), "ZZZZZZZZZZZZZZZZZZZZ", "'; drop table orders; --", "00000000000000000000"])(
    "un código inválido o inexistente (%j) no devuelve nada",
    async (code) => {
      expect(await track(code.replace(/'/g, "''"))).toBeNull();
    },
  );

  it("un visitante ve el mismo pedido que un usuario con sesión: no hay datos extra para nadie", async () => {
    const c = created(await order("ana", [{ id: CAFE }]))!;
    expect(await track(c.code, null)).toEqual(await track(c.code, BETO));
  });
});

describe("aislamiento y permisos — SEGUIMIENTO-6 y ADMIN-PEDIDOS-2", () => {
  it.each(["orders", "order_items", "order_events", "order_counters"])(
    "sin sesión no se lee la tabla %s",
    async (tabla) => {
      const r = await asUser(db, null, `select * from ${tabla}`);
      expect(r.ok && r.rows).toHaveLength(0);
    },
  );

  it("sin sesión no se puede crear ni cambiar pedidos directamente", async () => {
    const insertar = await asUser(db, null, `insert into orders (business_id, order_number) values ('${NEG_ANA}', '999')`);
    const cambiar = await asUser(db, null, `update orders set status = 'delivered'`);
    expect(insertar.ok).toBe(false);
    expect(cambiar.ok && cambiar.affected).toBe(0);
  });

  it("sin sesión no se pueden usar las funciones del negocio", async () => {
    const id = (await db.query<{ id: string }>(`select id from orders limit 1`)).rows[0].id;
    const estado = await asUser(db, null, `select public.set_order_status('${id}', 'confirmed')`);
    const manual = await asUser(db, null, `select public.create_manual_order('${NEG_ANA}', 'x', 'r', 'e', null, '[{"name":"a","unit_price":1,"quantity":1}]'::jsonb)`);
    expect(estado.ok).toBe(false);
    expect(manual.ok).toBe(false);
  });

  it("un miembro ve solo los pedidos, ítems y eventos de su negocio", async () => {
    const pedidos = await asUser(db, ANA, "select business_id from orders");
    const lineas = await asUser(db, ANA, "select business_id from order_items");
    const eventos = await asUser(db, ANA, "select business_id from order_events");

    for (const r of [pedidos, lineas, eventos]) {
      expect(r.ok && r.rows.length).toBeGreaterThan(0);
      expect(r.ok && r.rows.every((x) => x.business_id === NEG_ANA)).toBe(true);
    }
  });

  it("un miembro no puede cambiar el estado de un pedido de otro negocio", async () => {
    const ajeno = (await db.query<{ id: string }>(`select id from orders where business_id = '${NEG_ANA}' limit 1`)).rows[0].id;

    const r = await asUser(db, BETO, `select public.set_order_status('${ajeno}', 'cancelled')`);

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0002");
    const o = await db.query<{ status: string }>(`select status from orders where id = '${ajeno}'`);
    expect(o.rows[0].status).not.toBe("cancelled");
  });

  it("no se puede crear un pedido manual en un negocio ajeno", async () => {
    const r = await asUser(
      db, ANA,
      `select public.create_manual_order('${NEG_BETO}', 'x', 'r', 'e', null, '[{"name":"a","unit_price":1,"quantity":1}]'::jsonb)`,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501");
  });

  it("un miembro no puede tocar el contador de numeración", async () => {
    const r = await asUser(db, ANA, `update order_counters set last_number = 0`);
    expect(r.ok && r.affected).toBe(0);
  });
});

describe("estados — ADMIN-PEDIDOS-1", () => {
  async function fresh() {
    const c = created(await order("ana", [{ id: CAFE }]))!;
    const id = (await db.query<{ id: string }>(`select id from orders where code = '${c.code}'`)).rows[0].id;
    return id;
  }
  const set = (id: string, status: string, user = ANA) =>
    asUser(db, user, `select public.set_order_status('${id}', '${status}')`);
  const status = async (id: string) =>
    (await db.query<{ status: string }>(`select status from orders where id = '${id}'`)).rows[0].status;

  it("recorre el camino completo", async () => {
    const id = await fresh();
    for (const next of ["confirmed", "preparing", "ready", "delivered"]) {
      expect((await set(id, next)).ok).toBe(true);
      expect(await status(id)).toBe(next);
    }
  });

  it("puede saltear estados hacia adelante", async () => {
    const id = await fresh();
    expect((await set(id, "ready")).ok).toBe(true);
  });

  it.each(["pending", "confirmed", "preparing", "ready"])("se puede cancelar desde %s", async (desde) => {
    const id = await fresh();
    if (desde !== "pending") await set(id, desde);
    expect((await set(id, "cancelled")).ok).toBe(true);
    expect(await status(id)).toBe("cancelled");
  });

  it("no se puede volver atrás ni repetir el estado", async () => {
    const id = await fresh();
    await set(id, "preparing");

    for (const invalid of ["pending", "confirmed", "preparing"]) {
      const r = await set(id, invalid);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.code).toBe("P0004");
    }
    expect(await status(id)).toBe("preparing");
  });

  it.each(["delivered", "cancelled"])("%s no cambia más", async (final) => {
    const id = await fresh();
    await set(id, final);

    for (const next of ["pending", "confirmed", "ready", "delivered", "cancelled"]) {
      expect((await set(id, next)).ok).toBe(false);
    }
    expect(await status(id)).toBe(final);
  });

  it("rechaza un estado desconocido", async () => {
    const id = await fresh();
    const r = await set(id, "volando");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("22023");
  });

  it("un cambio rechazado no deja rastro en la línea de tiempo", async () => {
    const id = await fresh();
    await set(id, "confirmed");
    await set(id, "pending");

    const e = await db.query<{ status: string }>(`select status from order_events where order_id = '${id}' order by created_at, id`);
    expect(e.rows.map((r) => r.status)).toEqual(["pending", "confirmed"]);
  });

  it("cada cambio registra quién lo hizo", async () => {
    const id = await fresh();
    await set(id, "confirmed");

    const e = await db.query<{ changed_by: string | null }>(
      `select changed_by from order_events where order_id = '${id}' and status = 'confirmed'`,
    );
    expect(e.rows[0].changed_by).toBe(ANA);
  });

  it("un estado inválido no puede escribirse a mano en la tabla", async () => {
    const r = await db.query(`update orders set status = 'volando'`).then(() => "ok", (e) => (e as { code?: string }).code);
    expect(r).toBe("23514");
  });
});

describe("pedidos manuales — ADMIN-PEDIDOS-3", () => {
  const manual = (lines: string, extra = "'Cliente Manual', 'retiro', 'efectivo', 'Sin sal'") =>
    asUser(db, ANA, `select public.create_manual_order('${NEG_ANA}', ${extra}, '${lines}'::jsonb) as result`);

  it("un miembro carga un pedido con ítems escritos a mano", async () => {
    const r = await manual('[{"name":"Milanesa napolitana","unit_price":6500.5,"quantity":2},{"name":"Gaseosa","unit_price":900,"quantity":1}]');

    expect(r.ok).toBe(true);
    const c = r.ok ? (r.rows[0].result as { id: string; code: string; number: number }) : null;
    expect(c!.code).toMatch(/^[0-9a-f]{20}$/);

    const o = await db.query<{ total: string; source: string; status: string; customer_name: string }>(
      `select total, source, status, customer_name from orders where id = '${c!.id}'`,
    );
    expect(o.rows[0]).toEqual({ total: "13901.00", source: "manual", status: "pending", customer_name: "Cliente Manual" });
  });

  it("también tiene su línea de tiempo y se puede seguir por código", async () => {
    const r = await manual('[{"name":"Café","unit_price":1000,"quantity":1}]');
    const c = r.ok ? (r.rows[0].result as { code: string }) : null;

    const t = await asUser(db, null, `select public.public_order_tracking('${c!.code}') as t`);
    expect(t.ok && (t.rows[0].t as { eventos: unknown[] }).eventos).toHaveLength(1);
  });

  it.each([
    ["sin ítems", "[]"],
    ["con un nombre vacío", '[{"name":"","unit_price":1,"quantity":1}]'],
    ["con un nombre de más de 100 caracteres", `[{"name":"${"a".repeat(101)}","unit_price":1,"quantity":1}]`],
    ["con un precio negativo", '[{"name":"a","unit_price":-1,"quantity":1}]'],
    ["con un precio absurdo", '[{"name":"a","unit_price":100000000,"quantity":1}]'],
    ["con cantidad 0", '[{"name":"a","unit_price":1,"quantity":0}]'],
    ["con cantidad de más de 99", '[{"name":"a","unit_price":1,"quantity":100}]'],
    ["con un precio que no es número", '[{"name":"a","unit_price":"gratis","quantity":1}]'],
  ])("rechaza un pedido %s", async (_caso, lines) => {
    const antes = await count("select count(*) as n from orders");
    const r = await manual(lines);

    expect(r.ok).toBe(false);
    expect(await count("select count(*) as n from orders")).toBe(antes);
  });

  it("acepta un precio de cero (un obsequio)", async () => {
    expect((await manual('[{"name":"Regalo","unit_price":0,"quantity":1}]')).ok).toBe(true);
  });
});

describe("historial — ADMIN-PEDIDOS-5", () => {
  it("borrar o editar un producto no cambia los pedidos ya hechos", async () => {
    const extra = "d1000000-0000-0000-0000-0000000000ee";
    await db.exec(
      `insert into products (id, business_id, category_id, name, price, active)
       values ('${extra}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Efímero', 700, true)`,
    );
    const c = created(await order("ana", [{ id: extra, quantity: 3 }]))!;

    await db.exec(`update products set name = 'Renombrado', price = 9999 where id = '${extra}'`);
    let items = await db.query<{ name: string; unit_price: string }>(
      `select i.name, i.unit_price from order_items i join orders o on o.id = i.order_id where o.code = '${c.code}'`,
    );
    expect(items.rows[0]).toEqual({ name: "Efímero", unit_price: "700.00" });

    await db.exec(`delete from products where id = '${extra}'`);
    items = await db.query(
      `select i.name, i.unit_price, i.product_id from order_items i join orders o on o.id = i.order_id where o.code = '${c.code}'`,
    );
    expect(items.rows[0]).toMatchObject({ name: "Efímero", unit_price: "700.00", product_id: null });
  });

  it("borrar una promoción no borra el pedido", async () => {
    const c = created(await order("ana", [{ id: COMBO, kind: "promo" }]))!;
    await db.exec(`delete from promotions where id = '${COMBO}'`);

    const o = await db.query(`select id from orders where code = '${c.code}'`);
    expect(o.rows).toHaveLength(1);
  });

  it("borrar el negocio borra sus pedidos, ítems, eventos y contador", async () => {
    const otro = "c9c9c9c9-0000-0000-0000-000000000009";
    await db.exec(`
      insert into businesses (id, name, slug) values ('${otro}', 'Efímero', 'efimero');
      insert into business_settings (business_id, published) values ('${otro}', true);
      insert into categories (id, business_id, name) values ('c9000000-0000-0000-0000-000000000001', '${otro}', 'C');
      insert into products (id, business_id, category_id, name, price) values ('d9000000-0000-0000-0000-000000000001', '${otro}', 'c9000000-0000-0000-0000-000000000001', 'P', 10);
    `);
    await order("efimero", [{ id: "d9000000-0000-0000-0000-000000000001" }]);

    await db.exec(`delete from businesses where id = '${otro}'`);

    for (const t of ["orders", "order_items", "order_events", "order_counters"]) {
      expect(await count(`select count(*) as n from ${t} where business_id = '${otro}'`)).toBe(0);
    }
  });
});
