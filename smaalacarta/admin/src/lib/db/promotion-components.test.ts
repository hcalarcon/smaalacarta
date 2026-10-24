// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { promotionItems } from "@/test/promotion-items";

// ADMIN-PROMOS-1, 4, 7, 8 y 9, PUBLICO-3 y ADMIN-PEDIDOS-40 contra Postgres real: promociones con cantidad por
// producto y con productos que tienen opciones.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG = "a1a1a1a1-0000-0000-0000-000000000001";
const CAT = "c1000000-0000-0000-0000-000000000001";

const EMPANADA = "d1000000-0000-0000-0000-000000000001"; // $1000, Gusto obligatorio (1 de 1)
const GASEOSA = "d1000000-0000-0000-0000-000000000002"; // $500, Sabor obligatorio (1 de 1)
const PAPAS = "d1000000-0000-0000-0000-000000000003"; // $800, sin grupos
const OTRO = "d1000000-0000-0000-0000-000000000004"; // $100, sin grupos

const G_GUSTO = "9a000000-0000-0000-0000-000000000001";
const G_SABOR = "9a000000-0000-0000-0000-000000000002";

const CARNE = "0a000000-0000-0000-0000-000000000001"; // +0
const POLLO = "0a000000-0000-0000-0000-000000000002"; // +0
const JYQ = "0a000000-0000-0000-0000-000000000003"; // +200
const COCA = "0a000000-0000-0000-0000-000000000004"; // +0
const SPRITE = "0a000000-0000-0000-0000-000000000005"; // +50
const FANTA = "0a000000-0000-0000-0000-000000000006"; // agotada

let db: TestDb;
// Las crea `beforeAll` con `save_promotion`: 3 empanadas + 1 gaseosa a $3000 fijo, lo mismo con 10 % (suma 3500) y
// una de siempre (papas + otro, sin cantidades).
let COMBO = "";
let PCT = "";
let VIEJA = "";

type Comp = { product_id: string; options?: { id: string; quantity: number }[] };

const opt = (id: string, quantity = 1) => ({ id, quantity });
const emp = (...ids: string[]): Comp[] => ids.map((id) => ({ product_id: EMPANADA, options: [opt(id)] }));
const gas = (id: string): Comp => ({ product_id: GASEOSA, options: [opt(id)] });

// Las 3 empanadas y la gaseosa del combo.
const menu3 = (...gustos: string[]) => [...emp(...gustos), gas(COCA)];

type Line = { id: string; kind?: "product" | "promo"; quantity?: number; options?: unknown; components?: unknown };

function payload(lines: Line[]) {
  return JSON.stringify(
    lines.map((l) => ({
      id: l.id,
      kind: l.kind ?? "promo",
      quantity: l.quantity ?? 1,
      ...(l.options !== undefined ? { options: l.options } : {}),
      ...(l.components !== undefined ? { components: l.components } : {}),
    })),
  );
}

function order(lines: Line[]) {
  return asUser(
    db,
    null,
    `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null, '${payload(lines)}'::jsonb,
       p_customer_phone => '3515551234') as result`,
  );
}

function manual(lines: Line[]) {
  return asUser(
    db,
    ANA,
    `select public.create_manual_order('${NEG}', 'Manual', 'retiro', 'efectivo', null, '${payload(lines)}'::jsonb) as result`,
  );
}

type Created = { code: string; id?: string; total: number };
const created = (r: Awaited<ReturnType<typeof order>>) => (r.ok ? (r.rows[0].result as Created) : null);
const failure = (r: Awaited<ReturnType<typeof order>>) => (r.ok ? "ok" : (r.code ?? r.error));

async function itemsOf(code: string) {
  const r = await db.query<{ name: string; unit_price: string; quantity: number; options: unknown }>(
    `select i.name, i.unit_price, i.quantity, i.options
     from order_items i join orders o on o.id = i.order_id
     where o.code = '${code}' order by i.sort_order`,
  );
  return r.rows;
}

async function savePromo(items: string, type: "combo" | "percent" = "combo", name = "Nueva") {
  return asUser(
    db,
    ANA,
    `select public.save_promotion(null::uuid, '${NEG}'::uuid, '${name}', '', '${type}',
       ${type === "percent" ? 10 : 0}, ${type === "combo" ? 3000 : "null"}, true, ${items}) as id`,
  );
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, plan_web) values
      ('${NEG}', 'Ana Resto', 'ana', '5493510000001', true, true);
    insert into business_users (business_id, user_id) values ('${NEG}', '${ANA}');
    insert into business_settings (business_id, published) values ('${NEG}', true);

    insert into categories (id, business_id, name) values ('${CAT}', '${NEG}', 'Comidas');
    insert into products (id, business_id, category_id, name, price) values
      ('${EMPANADA}', '${NEG}', '${CAT}', 'Empanada clásica', 1000),
      ('${GASEOSA}', '${NEG}', '${CAT}', 'Gaseosas', 500),
      ('${PAPAS}', '${NEG}', '${CAT}', 'Papas', 800),
      ('${OTRO}', '${NEG}', '${CAT}', 'Otro', 100);

    insert into option_groups (id, business_id, name, min_select, max_select, allow_repeat, active, sort_order) values
      ('${G_GUSTO}', '${NEG}', 'Gusto', 1, 1, false, true, 0),
      ('${G_SABOR}', '${NEG}', 'Sabor', 1, 1, false, true, 0);
    insert into options (id, group_id, business_id, name, price_delta, active, sold_out, sort_order) values
      ('${CARNE}', '${G_GUSTO}', '${NEG}', 'Carne', 0, true, false, 0),
      ('${POLLO}', '${G_GUSTO}', '${NEG}', 'Pollo', 0, true, false, 1),
      ('${JYQ}', '${G_GUSTO}', '${NEG}', 'Jamón y queso', 200, true, false, 2),
      ('${COCA}', '${G_SABOR}', '${NEG}', 'Coca', 0, true, false, 0),
      ('${SPRITE}', '${G_SABOR}', '${NEG}', 'Sprite', 50, true, false, 1),
      ('${FANTA}', '${G_SABOR}', '${NEG}', 'Fanta', 0, true, true, 2);
    insert into product_option_groups (product_id, group_id, business_id, sort_order) values
      ('${EMPANADA}', '${G_GUSTO}', '${NEG}', 0),
      ('${GASEOSA}', '${G_SABOR}', '${NEG}', 0);
  `);

  const idOf = (r: Awaited<ReturnType<typeof savePromo>>) => {
    if (!r.ok) throw new Error(r.error);
    return r.rows[0].id as string;
  };

  COMBO = idOf(await savePromo(promotionItems([EMPANADA, GASEOSA], { [EMPANADA]: 3 })));
  PCT = idOf(await savePromo(promotionItems([EMPANADA, GASEOSA], { [EMPANADA]: 3 }), "percent", "Con 10"));
  VIEJA = idOf(await savePromo(promotionItems([PAPAS, OTRO]), "percent", "Papas y otro"));
}, 60_000);

// El freno de 20 pedidos por minuto: los pedidos anteriores se "envejecen" y no cuentan.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

describe("guardar con cantidad — ADMIN-PROMOS-1", () => {
  it("guarda la cantidad de cada producto y las promos sin cantidad quedan en 1", async () => {
    const r = await db.query<{ product_id: string; quantity: number }>(
      `select product_id, quantity from promotion_items where promotion_id = '${COMBO}' order by sort_order`,
    );
    expect(r.rows).toEqual([
      { product_id: EMPANADA, quantity: 3 },
      { product_id: GASEOSA, quantity: 1 },
    ]);

    const vieja = await db.query<{ quantity: number }>(
      `select quantity from promotion_items where promotion_id = '${VIEJA}'`,
    );
    expect(vieja.rows.map((x) => x.quantity)).toEqual([1, 1]);
  });

  it.each([
    ["cantidad 0", `'[{"product_id":"${EMPANADA}","quantity":0}]'::jsonb`],
    ["cantidad 21", `'[{"product_id":"${EMPANADA}","quantity":21}]'::jsonb`],
    ["cantidad decimal", `'[{"product_id":"${EMPANADA}","quantity":1.5}]'::jsonb`],
    ["sin cantidad", `'[{"product_id":"${EMPANADA}"}]'::jsonb`],
    ["un producto repetido", `'[{"product_id":"${EMPANADA}","quantity":1},{"product_id":"${EMPANADA}","quantity":2}]'::jsonb`],
    ["una lista vacía", `'[]'::jsonb`],
    ["algo que no es una lista", `'{"product_id":"${EMPANADA}","quantity":1}'::jsonb`],
  ])("rechaza %s (22023)", async (_caso, items) => {
    const r = await savePromo(items);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("22023");
  });

  it("acepta los límites 1 y 20", async () => {
    expect((await savePromo(promotionItems([EMPANADA], { [EMPANADA]: 20 }))).ok).toBe(true);
    expect((await savePromo(promotionItems([EMPANADA], { [EMPANADA]: 1 }))).ok).toBe(true);
  });

  it("la constraint de la tabla también la exige", async () => {
    const r = await db.query(`update promotion_items set quantity = 0 where promotion_id = '${COMBO}'`).then(
      () => "ok",
      (e: { code?: string }) => e.code,
    );
    expect(r).toBe("23514");
  });

  it("una promo sigue guardándose con productos de opciones obligatorias (ADMIN-PROMOS-7)", async () => {
    expect((await savePromo(promotionItems([EMPANADA, GASEOSA]))).ok).toBe(true);
  });
});

describe("menú público — PUBLICO-3", () => {
  type Offer = {
    id: string;
    descripcion: string;
    precio: number;
    precioAnterior?: number;
    componentes?: {
      id: string;
      nombre: string;
      cantidad: number;
      opciones?: { nombre: string; opciones: { id: string; nombre: string; precio: number }[] }[];
    }[];
    opciones?: unknown;
  };

  async function offers() {
    const r = await asUser(db, null, `select public.public_menu('ana', false, false) as menu`);
    if (!r.ok) throw new Error(r.error);
    const menu = r.rows[0].menu as { menu: { categorias: { tipo?: string; items: Offer[] }[] } };
    return menu.menu.categorias.filter((c) => c.tipo === "ofertas").flatMap((c) => c.items);
  }

  it("el combo: precio fijo, anterior = precio × cantidad e 'Incluye' con cantidades", async () => {
    const combo = (await offers()).find((o) => o.id === COMBO)!;

    expect(combo.precio).toBe(3000);
    expect(combo.precioAnterior).toBe(3500);
    expect(combo.descripcion).toContain("Incluye: 3× Empanada clásica, 1× Gaseosas");
  });

  it("el porcentaje se aplica sobre precio × cantidad", async () => {
    const pct = (await offers()).find((o) => o.id === PCT)!;

    expect(pct.precio).toBe(3150);
    expect(pct.precioAnterior).toBe(3500);
  });

  it("trae los componentes con su cantidad y los grupos de cada producto", async () => {
    const combo = (await offers()).find((o) => o.id === COMBO)!;

    expect(combo.componentes?.map((c) => [c.nombre, c.cantidad])).toEqual([
      ["Empanada clásica", 3],
      ["Gaseosas", 1],
    ]);
    const gusto = combo.componentes![0].opciones![0];
    expect(gusto.nombre).toBe("Gusto");
    expect(gusto.opciones.map((o) => [o.nombre, o.precio])).toEqual([
      ["Carne", 0],
      ["Pollo", 0],
      ["Jamón y queso", 200],
    ]);
    // La promoción en sí no lleva `opciones`: van en cada componente.
    expect(combo).not.toHaveProperty("opciones");
  });

  it("una promo de siempre se ve igual: sin cantidades en 'Incluye'", async () => {
    const vieja = (await offers()).find((o) => o.id === VIEJA)!;

    expect(vieja.descripcion).toContain("Incluye: Papas, Otro");
    expect(vieja.componentes?.every((c) => c.cantidad === 1)).toBe(true);
    expect(vieja.componentes?.every((c) => c.opciones === undefined)).toBe(true);
  });
});

describe("pedir una promoción con opciones — ADMIN-PROMOS-8 y 9", () => {
  it("combo: precio fijo, un componente por unidad y el detalle guardado", async () => {
    const c = created(await order([{ id: COMBO, components: menu3(CARNE, CARNE, POLLO) }]))!;

    expect(c.total).toBe(3000);
    const [item] = await itemsOf(c.code);
    expect(item.name).toBe("Nueva");
    expect(Number(item.unit_price)).toBe(3000);
    expect(item.options).toEqual([
      { producto: "Empanada clásica", opciones: [{ grupo: "Gusto", nombre: "Carne", cantidad: 1, precio: 0 }] },
      { producto: "Empanada clásica", opciones: [{ grupo: "Gusto", nombre: "Carne", cantidad: 1, precio: 0 }] },
      { producto: "Empanada clásica", opciones: [{ grupo: "Gusto", nombre: "Pollo", cantidad: 1, precio: 0 }] },
      { producto: "Gaseosas", opciones: [{ grupo: "Sabor", nombre: "Coca", cantidad: 1, precio: 0 }] },
    ]);
  });

  it("los extras con recargo se suman al precio de la línea (decisión 1)", async () => {
    const c = created(await order([{ id: COMBO, components: [...emp(JYQ, JYQ, CARNE), gas(SPRITE)] }]))!;

    // 3000 + 200 + 200 + 50
    expect(c.total).toBe(3450);
    expect(Number((await itemsOf(c.code))[0].unit_price)).toBe(3450);
  });

  it("en un porcentaje el descuento no alcanza a los extras (decisión 2)", async () => {
    const c = created(await order([{ id: PCT, components: [...emp(JYQ, CARNE, CARNE), gas(COCA)] }]))!;

    // 10 % sobre 3500 = 3150, más 200 de extra entero.
    expect(c.total).toBe(3350);
  });

  it("la cantidad de la línea multiplica la promo con sus extras", async () => {
    const c = created(await order([{ id: COMBO, quantity: 2, components: [...emp(JYQ, CARNE, CARNE), gas(COCA)] }]))!;

    expect(c.total).toBe(2 * 3200);
  });

  it("el navegador no puede mandar precios dentro de los componentes", async () => {
    const comps = menu3(CARNE, CARNE, CARNE).map((c) => ({ ...c, price: 1, unit_price: 1 }));
    expect(created(await order([{ id: COMBO, components: comps }]))!.total).toBe(3000);
  });

  it("dos líneas de la misma promo con distinta elección son líneas distintas", async () => {
    const r = await order([
      { id: COMBO, components: menu3(CARNE, CARNE, CARNE) },
      { id: COMBO, components: menu3(POLLO, POLLO, POLLO) },
    ]);
    expect(created(r)!.total).toBe(6000);
  });

  it("la misma elección en otro orden es una línea repetida (22023)", async () => {
    const r = await order([
      { id: COMBO, components: menu3(CARNE, POLLO, CARNE) },
      { id: COMBO, components: [gas(COCA), ...emp(CARNE, CARNE, POLLO)] },
    ]);
    expect(failure(r)).toBe("22023");
  });

  it.each([
    ["tres empanadas sin la gaseosa", () => emp(CARNE, CARNE, CARNE)],
    ["cuatro empanadas y una gaseosa", () => [...emp(CARNE, CARNE, CARNE, CARNE), gas(COCA)]],
    ["dos empanadas y una gaseosa", () => [...emp(CARNE, CARNE), gas(COCA)]],
    ["dos gaseosas", () => [...emp(CARNE, CARNE, CARNE), gas(COCA), gas(SPRITE)]],
    ["un producto que la promo no lleva", () => [...emp(CARNE, CARNE), { product_id: OTRO, options: [] }, gas(COCA)]],
    ["un componente sin gusto", () => [...emp(CARNE, CARNE), { product_id: EMPANADA, options: [] }, gas(COCA)]],
    ["un gusto que no es del producto", () => [...emp(CARNE, CARNE, COCA), gas(COCA)]],
    ["dos gustos en un grupo de máximo 1", () => [...emp(CARNE, CARNE), { product_id: EMPANADA, options: [opt(CARNE), opt(POLLO)] }, gas(COCA)]],
    ["un product_id que no es un uuid", () => [...emp(CARNE, CARNE, CARNE), { product_id: "x", options: [] }]],
    ["componentes que no son una lista", () => ({ product_id: EMPANADA }) as unknown as Comp[]],
  ])("rechaza %s con P0014", async (_caso, build) => {
    const antes = await db.query<{ n: string }>("select count(*) as n from orders");
    expect(failure(await order([{ id: COMBO, components: build() }]))).toBe("P0014");
    expect((await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n).toBe(antes.rows[0].n);
  });

  it("sin componentes, una promo que exige elegir se rechaza (P0014)", async () => {
    expect(failure(await order([{ id: COMBO }]))).toBe("P0014");
    expect(failure(await order([{ id: COMBO, components: [] }]))).toBe("P0014");
  });

  it("las opciones sueltas de la línea siguen rechazadas (P0014)", async () => {
    expect(failure(await order([{ id: COMBO, options: [opt(CARNE)], components: menu3(CARNE, CARNE, CARNE) }]))).toBe(
      "P0014",
    );
  });

  it("componentes en un producto suelto se rechazan (P0014)", async () => {
    expect(failure(await order([{ id: PAPAS, kind: "product", components: [{ product_id: PAPAS }] }]))).toBe("P0014");
  });

  it("una opción agotada rechaza el pedido con P0009", async () => {
    expect(failure(await order([{ id: COMBO, components: [...emp(CARNE, CARNE, CARNE), gas(FANTA)] }]))).toBe("P0009");
  });

  it("una promo de siempre se sigue pidiendo sin componentes, con precio por cantidad 1", async () => {
    const c = created(await order([{ id: VIEJA }]))!;

    // (800 + 100) con 10 %.
    expect(c.total).toBe(810);
    expect((await itemsOf(c.code))[0].options).toBeNull();
  });
});

describe("pedido manual — ADMIN-PEDIDOS-40", () => {
  it("valida los componentes igual que el menú y suma los extras", async () => {
    const r = await manual([{ id: COMBO, components: [...emp(JYQ, CARNE, POLLO), gas(SPRITE)] }]);
    const c = r.ok ? (r.rows[0].result as Created) : null;

    expect(c).not.toBeNull();
    expect(c!.total).toBe(3250);
  });

  it("rechaza lo mismo que el menú (P0014)", async () => {
    expect(failure(await manual([{ id: COMBO, components: emp(CARNE, CARNE, CARNE) }]))).toBe("P0014");
    expect(failure(await manual([{ id: COMBO }]))).toBe("P0014");
  });
});
