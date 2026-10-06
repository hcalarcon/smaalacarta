// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// PUBLICO-39 a 43 y SEGUIMIENTO-22 contra Postgres real: opciones y extras en el menú público,
// en el pedido y en el seguimiento.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const CAT = "c1000000-0000-0000-0000-000000000001";

const HAMB = "d1000000-0000-0000-0000-000000000001"; // $1000: Extras (opcional) + Punto (obligatorio)
const HELADO = "d1000000-0000-0000-0000-000000000002"; // $3000: Sabores (1-3, repetible) + Toppings
const SIMPLE = "d1000000-0000-0000-0000-000000000003"; // $500, sin grupos
const FERNET = "d2000000-0000-0000-0000-000000000001"; // de Beto
const EN_PROMO = "d1000000-0000-0000-0000-000000000004"; // $2000, con un grupo opcional, en una promoción
const PROMO = "e1000000-0000-0000-0000-000000000001";

const G_EXTRAS = "9a000000-0000-0000-0000-000000000001";
const G_PUNTO = "9a000000-0000-0000-0000-000000000002";
const G_SABORES = "9a000000-0000-0000-0000-000000000003";
const G_TOPPINGS = "9a000000-0000-0000-0000-000000000004";
const G_INACTIVO = "9a000000-0000-0000-0000-000000000005";
const G_VACIO = "9a000000-0000-0000-0000-000000000006"; // obligatorio, pero sin opciones activas
const G_PROMO = "9a000000-0000-0000-0000-000000000007";
const G_BETO = "9b000000-0000-0000-0000-000000000001";

const QUESO = "0a000000-0000-0000-0000-000000000001"; // +500
const PANCETA = "0a000000-0000-0000-0000-000000000002"; // +800
const HUEVO = "0a000000-0000-0000-0000-000000000003"; // +0
const VIEJA = "0a000000-0000-0000-0000-000000000004"; // inactiva
const JUGOSO = "0a000000-0000-0000-0000-000000000005";
const COCIDO = "0a000000-0000-0000-0000-000000000006";
const FRUTILLA = "0a000000-0000-0000-0000-000000000007";
const LIMON = "0a000000-0000-0000-0000-000000000008";
const MENTA = "0a000000-0000-0000-0000-000000000009"; // agotada
const CHOCOLATE = "0a000000-0000-0000-0000-00000000000a"; // +300
const CREMA = "0a000000-0000-0000-0000-00000000000b"; // +200
const DE_GRUPO_INACTIVO = "0a000000-0000-0000-0000-00000000000c";
const DE_BETO = "0b000000-0000-0000-0000-000000000001";
const DE_PROMO = "0a000000-0000-0000-0000-00000000000d";
const FANTASMA = "0a000000-0000-0000-0000-0000000000ff"; // no existe

let db: TestDb;

type Opt = { id: string; quantity: number };
type Line = { id: string; kind?: "product" | "promo"; quantity?: number; options?: unknown };

const one = (id: string, quantity = 1): Opt => ({ id, quantity });

function order(lines: Line[], slug = "ana") {
  const payload = JSON.stringify(
    lines.map((l) => ({
      id: l.id,
      kind: l.kind ?? "product",
      quantity: l.quantity ?? 1,
      ...(l.options !== undefined ? { options: l.options } : {}),
    })),
  );

  return asUser(
    db,
    null,
    `select public.create_public_order('${slug}', 'Cliente', 'retiro', 'efectivo', null, '${payload}'::jsonb) as result`,
  );
}

type Created = { code: string; number: number; total: number };
const created = (r: Awaited<ReturnType<typeof order>>) => (r.ok ? (r.rows[0].result as Created) : null);

function failure(r: Awaited<ReturnType<typeof order>>) {
  return r.ok ? "ok" : (r.code ?? r.error);
}

async function itemsOf(code: string) {
  const r = await db.query<{ name: string; unit_price: string; quantity: number; options: unknown }>(
    `select i.name, i.unit_price, i.quantity, i.options
     from order_items i join orders o on o.id = i.order_id
     where o.code = '${code}' order by i.sort_order`,
  );
  return r.rows;
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, plan_web) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true, false);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published) values
      ('${NEG_ANA}', true), ('${NEG_BETO}', true);

    insert into categories (id, business_id, name) values
      ('${CAT}', '${NEG_ANA}', 'Comidas'),
      ('c2000000-0000-0000-0000-000000000001', '${NEG_BETO}', 'Tragos');
    insert into products (id, business_id, category_id, name, price) values
      ('${HAMB}', '${NEG_ANA}', '${CAT}', 'Hamburguesa', 1000),
      ('${HELADO}', '${NEG_ANA}', '${CAT}', 'Helado', 3000),
      ('${SIMPLE}', '${NEG_ANA}', '${CAT}', 'Gaseosa', 500),
      ('${EN_PROMO}', '${NEG_ANA}', '${CAT}', 'Papas', 2000),
      ('${FERNET}', '${NEG_BETO}', 'c2000000-0000-0000-0000-000000000001', 'Fernet', 2500);

    insert into option_groups (id, business_id, name, min_select, max_select, allow_repeat, active, sort_order) values
      ('${G_EXTRAS}', '${NEG_ANA}', 'Extras', 0, 2, false, true, 1),
      ('${G_PUNTO}', '${NEG_ANA}', 'Punto', 1, 1, false, true, 0),
      ('${G_SABORES}', '${NEG_ANA}', 'Sabores', 1, 3, true, true, 0),
      ('${G_TOPPINGS}', '${NEG_ANA}', 'Toppings', 0, 2, false, true, 1),
      ('${G_INACTIVO}', '${NEG_ANA}', 'Inactivo', 1, 1, false, false, 2),
      ('${G_VACIO}', '${NEG_ANA}', 'Vacío', 1, 1, false, true, 3),
      ('${G_PROMO}', '${NEG_ANA}', 'Salsas', 0, 1, false, true, 0),
      ('${G_BETO}', '${NEG_BETO}', 'De Beto', 0, 1, false, true, 0);

    insert into options (id, group_id, business_id, name, price_delta, active, sold_out, sort_order) values
      ('${QUESO}', '${G_EXTRAS}', '${NEG_ANA}', 'Queso', 500, true, false, 0),
      ('${PANCETA}', '${G_EXTRAS}', '${NEG_ANA}', 'Panceta', 800, true, false, 1),
      ('${HUEVO}', '${G_EXTRAS}', '${NEG_ANA}', 'Huevo', 0, true, false, 2),
      ('${VIEJA}', '${G_EXTRAS}', '${NEG_ANA}', 'Vieja', 100, false, false, 3),
      ('${JUGOSO}', '${G_PUNTO}', '${NEG_ANA}', 'Jugoso', 0, true, false, 0),
      ('${COCIDO}', '${G_PUNTO}', '${NEG_ANA}', 'Cocido', 0, true, false, 1),
      ('${FRUTILLA}', '${G_SABORES}', '${NEG_ANA}', 'Frutilla', 0, true, false, 0),
      ('${LIMON}', '${G_SABORES}', '${NEG_ANA}', 'Limón', 0, true, false, 1),
      ('${MENTA}', '${G_SABORES}', '${NEG_ANA}', 'Menta', 0, true, true, 2),
      ('${CHOCOLATE}', '${G_TOPPINGS}', '${NEG_ANA}', 'Chocolate', 300, true, false, 0),
      ('${CREMA}', '${G_TOPPINGS}', '${NEG_ANA}', 'Crema', 200, true, false, 1),
      ('${DE_GRUPO_INACTIVO}', '${G_INACTIVO}', '${NEG_ANA}', 'Algo', 0, true, false, 0),
      ('${DE_BETO}', '${G_BETO}', '${NEG_BETO}', 'Hielo', 0, true, false, 0),
      ('${DE_PROMO}', '${G_PROMO}', '${NEG_ANA}', 'Mayonesa', 50, true, false, 0),
      ('0a000000-0000-0000-0000-0000000000a1', '${G_VACIO}', '${NEG_ANA}', 'Apagada', 0, false, false, 0);

    insert into product_option_groups (product_id, group_id, business_id, sort_order) values
      ('${HAMB}', '${G_PUNTO}', '${NEG_ANA}', 0),
      ('${HAMB}', '${G_EXTRAS}', '${NEG_ANA}', 1),
      ('${HAMB}', '${G_INACTIVO}', '${NEG_ANA}', 2),
      ('${HAMB}', '${G_VACIO}', '${NEG_ANA}', 3),
      ('${HELADO}', '${G_SABORES}', '${NEG_ANA}', 0),
      ('${HELADO}', '${G_TOPPINGS}', '${NEG_ANA}', 1),
      ('${EN_PROMO}', '${G_PROMO}', '${NEG_ANA}', 0),
      ('${FERNET}', '${G_BETO}', '${NEG_BETO}', 0);

    insert into promotions (id, business_id, name, type, discount_percent, active)
      values ('${PROMO}', '${NEG_ANA}', 'Oferta', 'percent', 10, true);
    insert into promotion_items (promotion_id, product_id, business_id)
      values ('${PROMO}', '${EN_PROMO}', '${NEG_ANA}');
  `);
}, 60_000);

// El freno de 20 pedidos por minuto: los pedidos anteriores se "envejecen" y no cuentan.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

type MenuItem = {
  id: string;
  nombre: string;
  precio: number;
  opciones?: {
    id: string;
    nombre: string;
    min: number;
    max: number;
    repetir: boolean;
    opciones: { id: string; nombre: string; precio: number; agotado: boolean }[];
  }[];
};

async function menuItems(isStatic = false) {
  const r = await asUser(db, null, `select public.public_menu('ana', false, ${isStatic}) as menu`);
  if (!r.ok) throw new Error(r.error);
  const menu = r.rows[0].menu as { menu: { categorias: { nombre: string; items: MenuItem[] }[] } };
  return menu.menu.categorias.flatMap((c) => c.items);
}

describe("public_menu entrega las opciones — PUBLICO-39", () => {
  it("cada producto lleva sus grupos activos, en el orden del panel, con sus opciones activas", async () => {
    const items = await menuItems();
    const hamb = items.find((i) => i.id === HAMB)!;

    expect(hamb.opciones!.map((g) => g.nombre)).toEqual(["Punto", "Extras"]);
    expect(hamb.opciones![0]).toMatchObject({ id: G_PUNTO, min: 1, max: 1, repetir: false });
    expect(hamb.opciones![1]).toMatchObject({ id: G_EXTRAS, min: 0, max: 2, repetir: false });
    expect(hamb.opciones![1].opciones.map((o) => [o.nombre, Number(o.precio), o.agotado])).toEqual([
      ["Queso", 500, false],
      ["Panceta", 800, false],
      ["Huevo", 0, false],
    ]);
  });

  it("trae el estado agotado de cada opción", async () => {
    const helado = (await menuItems()).find((i) => i.id === HELADO)!;
    const sabores = helado.opciones!.find((g) => g.id === G_SABORES)!;

    expect(sabores).toMatchObject({ min: 1, max: 3, repetir: true });
    expect(sabores.opciones.find((o) => o.id === MENTA)!.agotado).toBe(true);
    expect(sabores.opciones.find((o) => o.id === FRUTILLA)!.agotado).toBe(false);
  });

  it("no entrega grupos inactivos ni grupos sin opciones activas", async () => {
    const hamb = (await menuItems()).find((i) => i.id === HAMB)!;
    const ids = hamb.opciones!.map((g) => g.id);

    expect(ids).not.toContain(G_INACTIVO);
    expect(ids).not.toContain(G_VACIO);
  });

  it("un producto sin grupos no lleva la clave, y las promociones tampoco", async () => {
    const items = await menuItems();

    expect(items.find((i) => i.id === SIMPLE)).not.toHaveProperty("opciones");

    const oferta = items.find((i) => i.id === PROMO)!;
    expect(oferta).toBeDefined();
    expect(oferta).not.toHaveProperty("opciones");
  });

  it("el menú estático también las trae", async () => {
    const hamb = (await menuItems(true)).find((i) => i.id === HAMB)!;
    expect(hamb.opciones).toHaveLength(2);
  });
});

describe("el servidor calcula el precio con extras — PUBLICO-42", () => {
  it("unit_price = precio + suma de (extra × cantidad), el total lo incluye y se guarda la foto", async () => {
    const c = created(
      await order([
        { id: HAMB, quantity: 2, options: [one(JUGOSO), one(QUESO), one(PANCETA)] },
        { id: SIMPLE },
      ]),
    )!;

    expect(c.total).toBe(2 * (1000 + 500 + 800) + 500);

    const [hamb, simple] = await itemsOf(c.code);
    expect(Number(hamb.unit_price)).toBe(2300);
    expect(hamb.options).toEqual([
      { grupo: "Punto", nombre: "Jugoso", cantidad: 1, precio: 0 },
      { grupo: "Extras", nombre: "Queso", cantidad: 1, precio: 500 },
      { grupo: "Extras", nombre: "Panceta", cantidad: 1, precio: 800 },
    ]);
    // Un ítem sin opciones queda con NULL, no con un arreglo vacío.
    expect(Number(simple.unit_price)).toBe(500);
    expect(simple.options).toBeNull();
  });

  it("el extra se multiplica por la cantidad de veces que se eligió", async () => {
    const c = created(
      await order([
        {
          id: HELADO,
          options: [one(FRUTILLA, 2), one(LIMON), one(CHOCOLATE), one(CREMA)],
        },
      ]),
    )!;

    expect(c.total).toBe(3000 + 300 + 200);
    expect((await itemsOf(c.code))[0].options).toEqual([
      { grupo: "Sabores", nombre: "Frutilla", cantidad: 2, precio: 0 },
      { grupo: "Sabores", nombre: "Limón", cantidad: 1, precio: 0 },
      { grupo: "Toppings", nombre: "Chocolate", cantidad: 1, precio: 300 },
      { grupo: "Toppings", nombre: "Crema", cantidad: 1, precio: 200 },
    ]);
  });

  it("un extra con precio 0 se guarda igual", async () => {
    const c = created(await order([{ id: HAMB, options: [one(COCIDO), one(HUEVO)] }]))!;
    expect(c.total).toBe(1000);
    expect((await itemsOf(c.code))[0].options).toHaveLength(2);
  });

  it("toma el precio vigente al pedir, no el que tenía el carrito", async () => {
    const antes = created(await order([{ id: HAMB, options: [one(JUGOSO), one(QUESO)] }]))!;
    expect(antes.total).toBe(1500);

    await db.exec(`
      update options set price_delta = 650 where id = '${QUESO}';
      update products set price = 1200 where id = '${HAMB}';
    `);

    const despues = created(await order([{ id: HAMB, options: [one(JUGOSO), one(QUESO)] }]))!;
    expect(despues.total).toBe(1200 + 650);

    // El pedido hecho conserva su foto aunque cambien el precio y el nombre.
    await db.exec(`
      update options set name = 'Muzzarella', price_delta = 999 where id = '${QUESO}';
      update products set price = 1000 where id = '${HAMB}';
    `);
    const [linea] = await itemsOf(antes.code);
    expect(Number(linea.unit_price)).toBe(1500);
    expect(linea.options).toContainEqual({ grupo: "Extras", nombre: "Queso", cantidad: 1, precio: 500 });

    await db.exec(`update options set name = 'Queso', price_delta = 500 where id = '${QUESO}'`);
  });

  it("el navegador no puede mandar precios: un precio en la opción se ignora", async () => {
    const c = created(
      await order([{ id: HAMB, options: [{ id: JUGOSO, quantity: 1 }, { id: QUESO, quantity: 1, price: 1 }] }]),
    )!;
    expect(c.total).toBe(1500);
  });
});

describe("reglas de la elección — PUBLICO-40", () => {
  it.each([
    ["un producto con grupo obligatorio sin opciones", [{ id: HAMB }]],
    ["un obligatorio con la clave en null", [{ id: HAMB, options: null }]],
    ["un obligatorio con una lista vacía", [{ id: HAMB, options: [] }]],
    ["solo los extras, sin el grupo obligatorio", [{ id: HAMB, options: [one(QUESO)] }]],
    ["dos opciones de un grupo de máximo 1", [{ id: HAMB, options: [one(JUGOSO), one(COCIDO)] }]],
    ["más del máximo en un grupo opcional", [{ id: HAMB, options: [one(JUGOSO), one(QUESO), one(PANCETA), one(HUEVO)] }]],
    ["menos del mínimo en Sabores", [{ id: HELADO, options: [one(CHOCOLATE)] }]],
    ["más del máximo en Sabores repetible", [{ id: HELADO, options: [one(FRUTILLA, 2), one(LIMON, 2)] }]],
    ["una opción repetida en un grupo que no lo permite", [{ id: HAMB, options: [one(JUGOSO), one(QUESO, 2)] }]],
  ])("rechaza %s con invalid_options (P0014)", async (_caso, lines) => {
    const antes = await db.query<{ n: string }>("select count(*) as n from orders");
    expect(failure(await order(lines))).toBe("P0014");
    expect((await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n).toBe(antes.rows[0].n);
  });

  it.each([
    ["una opción de otro producto", [{ id: HAMB, options: [one(JUGOSO), one(CHOCOLATE)] }]],
    ["una opción de otro negocio", [{ id: HAMB, options: [one(JUGOSO), one(DE_BETO)] }]],
    ["una opción inactiva", [{ id: HAMB, options: [one(JUGOSO), one(VIEJA)] }]],
    ["una opción de un grupo inactivo", [{ id: HAMB, options: [one(JUGOSO), one(DE_GRUPO_INACTIVO)] }]],
    ["una opción que no existe", [{ id: HAMB, options: [one(JUGOSO), one(FANTASMA)] }]],
    ["una opción en un producto sin grupos", [{ id: SIMPLE, options: [one(QUESO)] }]],
    ["la misma opción dos veces en la lista", [{ id: HAMB, options: [one(JUGOSO), one(QUESO), one(QUESO)] }]],
    ["opciones que no son una lista", [{ id: HAMB, options: { id: JUGOSO } }]],
    ["una opción sin id", [{ id: HAMB, options: [one(JUGOSO), { quantity: 1 }] }]],
    ["una opción con id que no es un uuid", [{ id: HAMB, options: [one(JUGOSO), { id: "queso", quantity: 1 }] }]],
    ["cantidad 0", [{ id: HAMB, options: [one(JUGOSO), one(QUESO, 0)] }]],
    ["cantidad en texto", [{ id: HAMB, options: [one(JUGOSO), { id: QUESO, quantity: "1" }] }]],
    ["cantidad decimal", [{ id: HAMB, options: [one(JUGOSO), { id: QUESO, quantity: 1.5 }] }]],
    ["cantidad enorme", [{ id: HAMB, options: [one(JUGOSO), one(QUESO, 21)] }]],
  ])("rechaza %s con invalid_options (P0014)", async (_caso, lines) => {
    expect(failure(await order(lines))).toBe("P0014");
  });

  it("una promoción no lleva opciones (ni en una lista ni de otra forma)", async () => {
    expect(failure(await order([{ id: PROMO, kind: "promo", options: [one(DE_PROMO)] }]))).toBe("P0014");
    expect(failure(await order([{ id: PROMO, kind: "promo", options: { id: DE_PROMO } }]))).toBe("P0014");
  });

  it("una promoción sin opciones se pide como siempre", async () => {
    expect(created(await order([{ id: PROMO, kind: "promo" }]))).not.toBeNull();
    expect(created(await order([{ id: PROMO, kind: "promo", options: [] }]))).not.toBeNull();
    expect(created(await order([{ id: PROMO, kind: "promo", options: null }]))).not.toBeNull();
  });

  it("un grupo sin opciones activas no se exige", async () => {
    // HAMB tiene el grupo obligatorio 'Vacío' (sin opciones activas) y el inactivo: no bloquean el pedido.
    expect(created(await order([{ id: HAMB, options: [one(JUGOSO)] }]))).not.toBeNull();
  });

  it("acepta los límites exactos: máximo de un grupo y repetición", async () => {
    expect(created(await order([{ id: HAMB, options: [one(COCIDO), one(QUESO), one(PANCETA)] }]))).not.toBeNull();
    expect(created(await order([{ id: HELADO, options: [one(FRUTILLA, 3)] }]))).not.toBeNull();
    expect(created(await order([{ id: HELADO, options: [one(FRUTILLA), one(LIMON), one(FRUTILLA, 1)] }])))
      .toBeNull();
  });

  it("un producto sin grupos acepta la clave vacía o en null", async () => {
    expect(created(await order([{ id: SIMPLE, options: [] }]))).not.toBeNull();
    expect(created(await order([{ id: SIMPLE, options: null }]))).not.toBeNull();
  });

  it("un producto con solo grupos opcionales se pide sin elegir nada", async () => {
    await db.exec(`delete from product_option_groups where product_id = '${SIMPLE}'`);
    await db.exec(
      `insert into product_option_groups (product_id, group_id, business_id, sort_order)
       values ('${SIMPLE}', '${G_TOPPINGS}', '${NEG_ANA}', 0)`,
    );

    expect(created(await order([{ id: SIMPLE }]))).not.toBeNull();
    expect(created(await order([{ id: SIMPLE, options: [one(CHOCOLATE)] }]))!.total).toBe(800);

    await db.exec(`delete from product_option_groups where product_id = '${SIMPLE}'`);
  });
});

describe("opción agotada — PUBLICO-41", () => {
  it("rechaza con out_of_stock (P0009)", async () => {
    expect(failure(await order([{ id: HELADO, options: [one(MENTA)] }]))).toBe("P0009");
  });

  it("al volver a haber stock se puede pedir", async () => {
    await db.exec(`update options set sold_out = false where id = '${MENTA}'`);
    expect(created(await order([{ id: HELADO, options: [one(MENTA)] }]))).not.toBeNull();
    await db.exec(`update options set sold_out = true where id = '${MENTA}'`);
  });
});

describe("líneas del mismo producto — PUBLICO-43", () => {
  it("acepta dos líneas con distinta elección y suma cada una con sus extras", async () => {
    const c = created(
      await order([
        { id: HAMB, options: [one(JUGOSO)] },
        { id: HAMB, quantity: 2, options: [one(COCIDO), one(QUESO)] },
      ]),
    )!;

    expect(c.total).toBe(1000 + 2 * 1500);
    expect((await itemsOf(c.code)).map((i) => Number(i.unit_price))).toEqual([1000, 1500]);
  });

  it("el orden de las opciones en la lista no cambia la firma: es la misma línea repetida", async () => {
    const r = await order([
      { id: HAMB, options: [one(JUGOSO), one(QUESO)] },
      { id: HAMB, options: [one(QUESO), one(JUGOSO)] },
    ]);
    expect(failure(r)).toBe("22023");
  });

  it("el mismo producto sin opciones dos veces sigue siendo un ítem repetido", async () => {
    expect(failure(await order([{ id: SIMPLE }, { id: SIMPLE }]))).toBe("22023");
  });
});

describe("seguimiento — SEGUIMIENTO-22", () => {
  async function track(code: string) {
    const r = await asUser(db, null, `select public.public_order_tracking('${code}') as t`);
    if (!r.ok) throw new Error(r.error);
    return r.rows[0].t as { items: Record<string, unknown>[] };
  }

  it("devuelve las opciones de cada ítem sin ids, y nada en los que no tienen", async () => {
    const c = created(
      await order([{ id: HAMB, options: [one(JUGOSO), one(QUESO)] }, { id: SIMPLE }]),
    )!;

    const { items } = await track(c.code);

    expect(items[0].opciones).toEqual([
      { grupo: "Punto", nombre: "Jugoso", cantidad: 1, precio: 0 },
      { grupo: "Extras", nombre: "Queso", cantidad: 1, precio: 500 },
    ]);
    expect(Number(items[0].precio)).toBe(1500);
    expect(JSON.stringify(items[0])).not.toContain(QUESO);
    expect(items[1]).not.toHaveProperty("opciones");
  });
});

describe("pedido manual — ADMIN-PEDIDOS-21", () => {
  it("no exige opciones: un producto con grupo obligatorio entra igual", async () => {
    const r = await asUser(
      db,
      ANA,
      `select public.create_manual_order('${NEG_ANA}', 'Manual', 'retiro', 'efectivo', null,
         '[{"name":"Hamburguesa","unit_price":1000,"quantity":1}]'::jsonb) as result`,
    );
    expect(r.ok).toBe(true);
  });
});
