// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-PROMO-1 a 12 contra Postgres real: imagen, vigencia y stock de las promociones.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const CAT = "c1000000-0000-0000-0000-000000000001";
const CAT_BETO = "c2000000-0000-0000-0000-000000000001";

const CON_FOTO = "d1000000-0000-0000-0000-000000000001";
const SIN_FOTO = "d1000000-0000-0000-0000-000000000002"; // "Hamburguesa completa": tiene predeterminada
const OTRA_FOTO = "d1000000-0000-0000-0000-000000000003";
const SIN_NADA = "d1000000-0000-0000-0000-000000000004"; // ni foto ni predeterminada
const DE_BETO = "d2000000-0000-0000-0000-000000000001";

const FOTO = "https://ejemplo.com/pizza.jpg";
const FOTO_OTRA = "https://ejemplo.com/otra.jpg";
const FOTO_PROPIA = "https://ejemplo.com/promo.jpg";

let db: TestDb;

const sqlText = (value: string | null) => (value === null ? "null" : "'" + value.replace(/'/g, "''") + "'");

type Promo = {
  id?: string | null;
  business?: string;
  name?: string;
  products?: string[];
  imageUrl?: string | null;
  imageProduct?: string | null;
  validUntil?: string | null; // expresión SQL: "now() + interval '1 hour'"
  stock?: number | null;
};

function save(user: string | null, p: Promo = {}) {
  const products = p.products ?? [CON_FOTO, SIN_FOTO];
  return asUser(
    db,
    user,
    `select public.save_promotion(
       ${p.id ? `'${p.id}'` : "null"}::uuid,
       '${p.business ?? NEG_ANA}'::uuid,
       ${sqlText(p.name ?? "Promo")}, 'desc', 'percent', 20::numeric, null::numeric, true,
       ARRAY[${products.map((id) => `'${id}'`).join(",")}]::uuid[],
       ${sqlText(p.imageUrl ?? null)},
       ${p.imageProduct ? `'${p.imageProduct}'::uuid` : "null::uuid"},
       (${p.validUntil ?? "null"})::timestamptz,
       ${p.stock ?? "null"}::integer) as id`,
  );
}

async function create(p: Promo = {}) {
  const r = await save(ANA, p);
  if (!r.ok) throw new Error(`no se pudo guardar la promoción: ${r.error}`);
  return r.rows[0].id as string;
}

type MenuItem = {
  id: string;
  nombre: string;
  esPromo?: boolean;
  imagen?: string;
  imagenIlustrativa?: boolean;
  validaHasta?: string;
  quedan?: number;
};

async function promos(slug = "ana") {
  const r = await asUser(db, null, `select public.public_menu('${slug}') as m`);
  if (!r.ok) throw new Error(r.error);
  const menu = r.rows[0].m as { menu: { categorias: { tipo?: string; items: MenuItem[] }[] } };
  return menu.menu.categorias.filter((c) => c.tipo === "ofertas").flatMap((c) => c.items);
}

async function promoItem(id: string) {
  return (await promos()).find((p) => p.id === id);
}

let counter = 0;

// Un pedido del menú con `quantity` unidades de la promoción.
function order(promoId: string, quantity = 1, slug = "ana") {
  counter += 1;
  return asUser(
    db,
    null,
    `select public.create_public_order('${slug}', 'Cliente ${counter}', 'retiro', 'efectivo', null,
       '[{"id":"${promoId}","kind":"promo","quantity":${quantity}}]'::jsonb,
       p_customer_phone => '3515551234') as result`,
  );
}

async function orderId(r: Awaited<ReturnType<typeof order>>) {
  if (!r.ok) throw new Error(r.error);
  const code = (r.rows[0].result as { code: string }).code;
  return (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0].id;
}

async function remaining(id: string) {
  const r = await db.query<{ n: number | null }>("select public.promotion_remaining($1) as n", [id]);
  return r.rows[0].n;
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, plan_completo) values
      ('${NEG_ANA}', 'Ana', 'ana', true), ('${NEG_BETO}', 'Beto', 'beto', true);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published) values ('${NEG_ANA}', true), ('${NEG_BETO}', true);
    insert into categories (id, business_id, name) values
      ('${CAT}', '${NEG_ANA}', 'Comidas'), ('${CAT_BETO}', '${NEG_BETO}', 'Varios');
    insert into products (id, business_id, category_id, name, price, image_url) values
      ('${CON_FOTO}', '${NEG_ANA}', '${CAT}', 'Pizza con foto', 1000, '${FOTO}'),
      ('${SIN_FOTO}', '${NEG_ANA}', '${CAT}', 'Hamburguesa completa', 2000, null),
      ('${OTRA_FOTO}', '${NEG_ANA}', '${CAT}', 'Otra con foto', 1500, '${FOTO_OTRA}'),
      ('${SIN_NADA}', '${NEG_ANA}', '${CAT}', 'Plato misterioso', 500, null),
      ('${DE_BETO}', '${NEG_BETO}', '${CAT_BETO}', 'Fernet', 2500, null);
  `);
}, 60_000);

// El freno de 20 pedidos por minuto del menú.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

afterAll(async () => {
  await db.close();
});

describe("imagen de la promoción — ADMIN-PROMO-1 a 3", () => {
  it("la imagen propia gana y no es ilustrativa", async () => {
    const id = await create({ imageUrl: FOTO_PROPIA });
    const item = await promoItem(id);

    expect(item).toMatchObject({ imagen: FOTO_PROPIA });
    expect(item?.imagenIlustrativa).toBeUndefined();
  });

  it("con un producto elegido usa su imagen", async () => {
    const id = await create({ imageProduct: CON_FOTO });
    const item = await promoItem(id);

    expect(item?.imagen).toBe(FOTO);
    expect(item?.imagenIlustrativa).toBeUndefined();
  });

  it("el producto elegido sin foto usa la predeterminada, marcada como ilustrativa", async () => {
    const id = await create({ imageProduct: SIN_FOTO });
    const item = await promoItem(id);

    expect(item?.imagen).toBeTruthy();
    expect(item?.imagen).not.toBe(FOTO);
    expect(item?.imagenIlustrativa).toBe(true);
  });

  it("sin nada elegido usa la del primer producto que tenga imagen", async () => {
    const id = await create({ products: [SIN_FOTO, OTRA_FOTO] });
    const item = await promoItem(id);

    // La foto del negocio gana a la ilustrativa aunque el producto sin foto vaya primero.
    expect(item?.imagen).toBe(FOTO_OTRA);
    expect(item?.imagenIlustrativa).toBeUndefined();
  });

  it("si ningún producto tiene imagen ni predeterminada, no hay imagen", async () => {
    const id = await create({ products: [SIN_NADA] });
    const item = await promoItem(id);

    expect(item).toBeTruthy();
    expect(item?.imagen).toBeUndefined();
  });

  it("la imagen del producto es una referencia: si el producto cambia de foto, la promo la sigue", async () => {
    const id = await create({ imageProduct: CON_FOTO });
    await db.exec(`update products set image_url = 'https://ejemplo.com/nueva.jpg' where id = '${CON_FOTO}'`);

    expect((await promoItem(id))?.imagen).toBe("https://ejemplo.com/nueva.jpg");

    await db.exec(`update products set image_url = '${FOTO}' where id = '${CON_FOTO}'`);
  });

  it("si se borra el producto elegido, la promoción queda sin referencia y se resuelve por el primero", async () => {
    const borrable = "d1000000-0000-0000-0000-0000000000aa";
    await db.exec(
      `insert into products (id, business_id, category_id, name, price, image_url)
       values ('${borrable}', '${NEG_ANA}', '${CAT}', 'Borrable', 100, 'https://ejemplo.com/borrable.jpg')`,
    );
    const id = await create({ products: [borrable, CON_FOTO], imageProduct: borrable });
    expect((await promoItem(id))?.imagen).toBe("https://ejemplo.com/borrable.jpg");

    await db.exec(`delete from products where id = '${borrable}'`);

    const row = await db.query<{ image_product_id: string | null; business_id: string }>(
      "select image_product_id, business_id from promotions where id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({ image_product_id: null, business_id: NEG_ANA });
  });

  it("imagen propia e imagen de un producto son excluyentes (22023 y check de la tabla)", async () => {
    const r = await save(ANA, { imageUrl: FOTO_PROPIA, imageProduct: CON_FOTO });
    expect(!r.ok && r.code).toBe("22023");

    const id = await create();
    const directo = await db
      .query(
        `update promotions set image_url = 'x', image_product_id = '${CON_FOTO}' where id = '${id}'`,
      )
      .then(() => "ok", (e) => (e as { code?: string }).code);
    expect(directo).toBe("23514");
  });

  it("la imagen elegida tiene que ser de un producto de la promoción", async () => {
    const r = await save(ANA, { products: [CON_FOTO], imageProduct: OTRA_FOTO });
    expect(!r.ok && r.code).toBe("22023");
  });

  it("no se puede usar la imagen de un producto de otro negocio", async () => {
    const r = await save(ANA, { products: [CON_FOTO, DE_BETO], imageProduct: DE_BETO });
    expect(r.ok).toBe(false);
  });
});

describe("vigencia — ADMIN-PROMO-6", () => {
  it("una promo vigente se entrega con su fecha de fin en UTC", async () => {
    const id = await create({ validUntil: "now() + interval '2 hours'" });
    const item = await promoItem(id);

    expect(item?.validaHasta).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect((await order(id)).ok).toBe(true);
  });

  it("al pasar la hora de fin no se entrega y el pedido se rechaza (P0001)", async () => {
    const id = await create({ validUntil: "now() + interval '1 hour'" });
    await db.exec(`update promotions set valid_until = now() - interval '1 second' where id = '${id}'`);

    expect(await promoItem(id)).toBeUndefined();

    const r = await order(id);
    expect(!r.ok && r.code).toBe("P0001");
  });

  it("en el borde: vence cuando la hora pasó, no antes", async () => {
    const id = await create({ validUntil: "now() + interval '1 hour'" });

    await db.exec(`update promotions set valid_until = now() + interval '1 second' where id = '${id}'`);
    expect(await promoItem(id)).toBeTruthy();

    await db.exec(`update promotions set valid_until = now() - interval '1 millisecond' where id = '${id}'`);
    expect(await promoItem(id)).toBeUndefined();
  });

  it("el fin se compara en un instante absoluto: 23:59 de Argentina es 02:59 UTC del día siguiente", async () => {
    const id = await create({ validUntil: "'2099-10-20 23:59:00-03'" });
    const item = await promoItem(id);

    expect(item?.validaHasta).toBe("2099-10-21T02:59:00Z");
  });

  it("cargar una fecha de fin pasada se rechaza, pero guardar otra cosa de una vencida no la toca", async () => {
    const pasada = await save(ANA, { validUntil: "now() - interval '1 day'" });
    expect(!pasada.ok && pasada.code).toBe("22023");

    const id = await create({ validUntil: "now() + interval '1 hour'" });
    await db.exec(`update promotions set valid_until = now() - interval '1 hour' where id = '${id}'`);
    const vencida = (
      await db.query<{ v: string }>("select valid_until::text as v from promotions where id = $1", [id])
    ).rows[0].v;

    const r = await save(ANA, { id, name: "Renombrada", validUntil: `'${vencida}'` });
    expect(r.ok).toBe(true);
  });

  it("una promo sin vigencia ni stock no cambia: sin validaHasta ni quedan", async () => {
    const id = await create();
    const item = await promoItem(id);

    expect(item).toBeTruthy();
    expect(item?.validaHasta).toBeUndefined();
    expect(item?.quedan).toBeUndefined();
    expect(await remaining(id)).toBeNull();
    expect((await order(id, 20)).ok).toBe(true);
  });
});

describe("stock — ADMIN-PROMO-7 a 9", () => {
  it("lo que queda es el stock menos lo pedido, y 'quedan' solo aparece con 5 o menos", async () => {
    const id = await create({ stock: 8 });
    expect((await promoItem(id))?.quedan).toBeUndefined();

    expect((await order(id, 3)).ok).toBe(true);
    expect(await remaining(id)).toBe(5);
    expect((await promoItem(id))?.quedan).toBe(5);

    expect((await order(id, 4)).ok).toBe(true);
    expect((await promoItem(id))?.quedan).toBe(1);
  });

  it("al agotarse no se entrega y el pedido se rechaza (P0001)", async () => {
    const id = await create({ stock: 2 });
    expect((await order(id, 2)).ok).toBe(true);

    expect(await remaining(id)).toBe(0);
    expect(await promoItem(id)).toBeUndefined();

    const r = await order(id, 1);
    expect(!r.ok && r.code).toBe("P0001");
  });

  it("un pedido que pide más de lo que queda se rechaza entero y no deja nada", async () => {
    const id = await create({ stock: 3 });
    const antes = (await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n;

    const r = await order(id, 4);

    expect(!r.ok && r.code).toBe("P0001");
    expect((await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n).toBe(antes);
    expect(await remaining(id)).toBe(3);
  });

  it("dos pedidos que juntos se pasan del stock: el segundo se rechaza", async () => {
    const id = await create({ stock: 3 });

    expect((await order(id, 2)).ok).toBe(true);
    const segundo = await order(id, 2);

    expect(!segundo.ok && segundo.code).toBe("P0001");
    expect(await remaining(id)).toBe(1);
  });

  it("cuenta las unidades de las líneas del mismo pedido (dos líneas de la misma promo)", async () => {
    const id = await create({ stock: 3 });

    const r = await asUser(
      db,
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null,
         '[{"id":"${id}","kind":"promo","quantity":2,"note":"a"},{"id":"${id}","kind":"promo","quantity":2,"note":"b"}]'::jsonb,
         p_customer_phone => '3515551234')`,
    );

    expect(!r.ok && r.code).toBe("P0001");
  });

  it("un pedido cancelado libera la unidad solo, sin tocar set_order_status", async () => {
    const id = await create({ stock: 2 });
    const first = await orderId(await order(id, 2));
    expect(await remaining(id)).toBe(0);
    expect((await order(id, 1)).ok).toBe(false);

    const cancelado = await asUser(db, ANA, `select public.set_order_status('${first}', 'cancelled')`);
    expect(cancelado.ok).toBe(true);

    expect(await remaining(id)).toBe(2);
    expect((await order(id, 2)).ok).toBe(true);
  });

  it("cambiar el stock reinicia el conteo desde ese momento", async () => {
    const id = await create({ stock: 5 });
    expect((await order(id, 4)).ok).toBe(true);
    expect(await remaining(id)).toBe(1);

    // Se carga stock nuevo: lo vendido antes ya no cuenta.
    expect((await save(ANA, { id, stock: 6 })).ok).toBe(true);

    expect(await remaining(id)).toBe(6);
    expect((await promoItem(id))?.quedan).toBeUndefined();
  });

  it("guardar con el mismo stock no reinicia el conteo", async () => {
    const id = await create({ stock: 5 });
    expect((await order(id, 2)).ok).toBe(true);

    expect((await save(ANA, { id, name: "Otro nombre", stock: 5 })).ok).toBe(true);

    expect(await remaining(id)).toBe(3);
  });

  it("sacar el stock deja la promo sin tope", async () => {
    const id = await create({ stock: 1 });
    expect((await order(id, 1)).ok).toBe(true);
    expect(await promoItem(id)).toBeUndefined();

    expect((await save(ANA, { id, stock: null })).ok).toBe(true);

    expect(await remaining(id)).toBeNull();
    expect(await promoItem(id)).toBeTruthy();
  });

  it("el stock tiene que ser 1 o más", async () => {
    const r = await save(ANA, { stock: 0 });
    expect(!r.ok && r.code).toBe("22023");
  });

  it("promotion_stock_stats entrega vendidas y restantes del negocio", async () => {
    const id = await create({ stock: 10 });
    expect((await order(id, 4)).ok).toBe(true);

    const r = await asUser(db, ANA, `select * from public.promotion_stock_stats('${NEG_ANA}')`);
    expect(r.ok).toBe(true);
    const row = r.ok ? r.rows.find((x) => x.promotion_id === id) : null;
    expect(row).toMatchObject({ sold: 4, remaining: 6 });
  });
});

describe("el pedido manual respeta la vigencia — ADMIN-PROMO-8", () => {
  it("rechaza una promoción vencida o agotada", async () => {
    const vencida = await create({ validUntil: "now() + interval '1 hour'" });
    await db.exec(`update promotions set valid_until = now() - interval '1 minute' where id = '${vencida}'`);
    const agotada = await create({ stock: 1 });
    expect((await order(agotada, 1)).ok).toBe(true);

    for (const id of [vencida, agotada]) {
      const r = await asUser(
        db,
        ANA,
        `select public.create_manual_order('${NEG_ANA}', 'Mostrador', 'retiro', 'efectivo', null,
           '[{"id":"${id}","kind":"promo","quantity":1}]'::jsonb)`,
      );
      expect(!r.ok && r.code).toBe("P0001");
    }
  });
});

describe("RLS y suspensión — ADMIN-PROMO-12", () => {
  it("un miembro no puede guardar una promoción en otro negocio", async () => {
    const r = await save(BETO, { business: NEG_ANA, imageUrl: FOTO_PROPIA });
    expect(r.ok).toBe(false);
  });

  it("las columnas nuevas de una promoción de otro negocio no se leen", async () => {
    await create({ stock: 3, imageUrl: FOTO_PROPIA });

    const r = await asUser(db, BETO, "select image_url, valid_until, stock from promotions");
    expect(r.ok && r.rows.length).toBe(0);
  });

  it("un miembro de otro negocio no ve cuántas quedan", async () => {
    const id = await create({ stock: 3 });

    const r = await asUser(db, BETO, `select public.promotion_remaining('${id}') as n`);
    expect(r.ok && r.rows[0].n).toBeNull();
  });

  it("un negocio suspendido no puede cambiar la imagen, la vigencia ni el stock (P0010)", async () => {
    const id = await create({ stock: 3 });
    await db.exec(`update businesses set active = false where id = '${NEG_ANA}'`);

    const r = await save(ANA, { id, stock: 10, imageUrl: FOTO_PROPIA });
    expect(!r.ok && r.code).toBe("P0010");

    await db.exec(`update businesses set active = true where id = '${NEG_ANA}'`);
  });
});
