// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-CONFIG-25, PUBLICO-50 y SEGUIMIENTO-24 contra Postgres real: la posición de la imagen de cabecera.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const CODE = "0123456789abcdef0123";

let db: TestDb;

// Llama a `save_business_settings` con lo mínimo y la posición que se pide.
function save(x: number, y: number, header: string | null = "https://ejemplo.com/cabecera.jpg") {
  return asUser(
    db,
    ANA,
    `select public.save_business_settings(
       '${NEG_ANA}'::uuid, true, 'moderno', '', '#463AE5', '#9A6CE0',
       ${header === null ? "null" : `'${header}'`}, '{}'::jsonb, '5493510000000', '', '', '',
       false, '', null::date, null, null, 'claro',
       array['delivery', 'retiro']::text[], array['efectivo']::text[], null, null,
       true, 30, false, '{}'::jsonb, ${x}, ${y})`,
  );
}

async function menuHeader() {
  const r = await asUser(db, null, "select public.public_menu('ana') as m");
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0].m as { config: { header?: { imagen: string; posicion: { x: number; y: number } } } })
    .config.header;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await db.exec(`
    insert into businesses (id, name, slug, plan_completo) values ('${NEG_ANA}', 'Ana', 'ana', true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into orders (business_id, order_number, code) values ('${NEG_ANA}', '1', '${CODE}');
  `);
}, 60_000);

describe("posición de la imagen de cabecera — ADMIN-CONFIG-25", () => {
  it("por defecto es el centro (50, 50)", async () => {
    await db.exec(`insert into business_settings (business_id) values ('${NEG_ANA}')`);
    const s = await db.query<{ header_image_x: number; header_image_y: number }>(
      `select header_image_x, header_image_y from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(s.rows[0]).toEqual({ header_image_x: 50, header_image_y: 50 });
  });

  it("save_business_settings guarda la posición", async () => {
    const r = await save(20, 80);
    expect(r.ok).toBe(true);

    const s = await db.query<{ header_image_x: number; header_image_y: number }>(
      `select header_image_x, header_image_y from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(s.rows[0]).toEqual({ header_image_x: 20, header_image_y: 80 });
  });

  it.each([
    [-1, 50],
    [101, 50],
    [50, -1],
    [50, 101],
  ])("la base rechaza una posición fuera de rango (%i, %i)", async (x, y) => {
    const r = await save(x, y);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23514");
  });
});

describe("posición en el menú público — PUBLICO-50", () => {
  it("public_menu entrega header.posicion junto a la imagen", async () => {
    await save(10, 90);
    expect(await menuHeader()).toEqual({
      imagen: "https://ejemplo.com/cabecera.jpg",
      posicion: { x: 10, y: 90 },
    });
  });

  it("sin imagen no hay cabecera, y por lo tanto tampoco posición", async () => {
    await save(10, 90, null);
    expect(await menuHeader()).toBeUndefined();
  });
});

describe("posición en el seguimiento — SEGUIMIENTO-24", () => {
  it("public_order_tracking entrega negocio.posicion", async () => {
    await save(30, 70);
    const r = await asUser(db, null, `select public.public_order_tracking('${CODE}') as t`);
    if (!r.ok) throw new Error(r.error);
    const negocio = (r.rows[0].t as { negocio: { imagen: string; posicion: { x: number; y: number } } }).negocio;
    expect(negocio.posicion).toEqual({ x: 30, y: 70 });
  });
});
