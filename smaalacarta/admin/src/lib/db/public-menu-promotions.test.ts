// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// Regresión del 500 (57014) de `public_menu` tras la migración de promociones con imagen y stock:
// el menú que lee `anon` con promociones (con y sin stock, con y sin imagen) y pedidos de por medio.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG = "a1a1a1a1-0000-0000-0000-000000000001";
const CAT = "c1000000-0000-0000-0000-000000000001";
const CON_FOTO = "d1000000-0000-0000-0000-000000000001";
const SIN_FOTO = "d1000000-0000-0000-0000-000000000002"; // "Hamburguesa completa": tiene predeterminada
const SIN_NADA = "d1000000-0000-0000-0000-000000000004";
const FOTO = "https://ejemplo.com/pizza.jpg";
const FOTO_PROMO = "https://ejemplo.com/promo.jpg";

let db: TestDb;

type Item = { id: string; nombre: string; imagen?: string; imagenIlustrativa?: boolean; quedan?: number };

async function offers(): Promise<Item[]> {
  const r = await asUser(db, null, "select public.public_menu('ana', false, false) as m");
  if (!r.ok) throw new Error(r.error);
  const m = r.rows[0].m as { menu: { categorias: { tipo?: string; items: Item[] }[] } };
  return m.menu.categorias.filter((c) => c.tipo === "ofertas").flatMap((c) => c.items);
}

async function promo(name: string, products: string[], opts: { image?: string; stock?: number } = {}) {
  const r = await asUser(
    db,
    ANA,
    `select public.save_promotion(null::uuid, '${NEG}'::uuid, '${name}', 'd', 'percent', 10::numeric, null::numeric,
       true, ARRAY[${products.map((p) => `'${p}'`).join(",")}]::uuid[],
       ${opts.image ? `'${opts.image}'` : "null"}, null::uuid, null::timestamptz,
       ${opts.stock ?? "null"}::integer) as id`,
  );
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].id as string;
}

let n = 0;
async function order(promoId: string, quantity: number) {
  n += 1;
  const r = await asUser(
    db,
    null,
    `select public.create_public_order('ana', 'Cliente ${n}', 'retiro', 'efectivo', null,
       '[{"id":"${promoId}","kind":"promo","quantity":${quantity}}]'::jsonb,
       p_customer_phone => '3515551234') as result`,
  );
  if (!r.ok) throw new Error(r.error);
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await db.exec(`
    insert into businesses (id, name, slug, plan_completo) values ('${NEG}', 'Ana', 'ana', true);
    insert into business_users (business_id, user_id) values ('${NEG}', '${ANA}');
    insert into business_settings (business_id, published) values ('${NEG}', true);
    insert into categories (id, business_id, name) values ('${CAT}', '${NEG}', 'Comidas');
    insert into products (id, business_id, category_id, name, price, image_url) values
      ('${CON_FOTO}', '${NEG}', '${CAT}', 'Pizza con foto', 1000, '${FOTO}'),
      ('${SIN_FOTO}', '${NEG}', '${CAT}', 'Hamburguesa completa', 2000, null),
      ('${SIN_NADA}', '${NEG}', '${CAT}', 'Plato misterioso', 500, null);
  `);
}, 60_000);

beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

afterAll(async () => {
  await db.close();
});

describe("public_menu como anon con promociones", () => {
  it("entrega promociones con y sin stock, con y sin imagen, y cuenta lo vendido sin permisos del que llama", async () => {
    const propia = await promo("Con imagen propia", [SIN_NADA], { image: FOTO_PROMO });
    const delProducto = await promo("Imagen de producto", [SIN_NADA, CON_FOTO]);
    const ilustrativa = await promo("Ilustrativa", [SIN_FOTO]);
    const sinImagen = await promo("Sin imagen", [SIN_NADA]);
    const conStock = await promo("Con stock", [CON_FOTO], { stock: 4 });
    const agotada = await promo("Agotada", [CON_FOTO], { stock: 1 });

    await order(conStock, 1);
    await order(conStock, 1);
    await order(agotada, 1);

    const items = await offers();
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));

    expect(byId[propia].imagen).toBe(FOTO_PROMO);
    expect(byId[propia].imagenIlustrativa).toBeUndefined();
    expect(byId[delProducto].imagen).toBe(FOTO);
    expect(byId[ilustrativa].imagen).toMatch(/^https:\/\//);
    expect(byId[ilustrativa].imagenIlustrativa).toBe(true);
    expect(byId[sinImagen].imagen).toBeUndefined();
    expect(byId[conStock].quedan).toBe(2);
    expect(byId[agotada]).toBeUndefined(); // sin unidades no se ofrece
    expect(items).toHaveLength(5);
  });
});
