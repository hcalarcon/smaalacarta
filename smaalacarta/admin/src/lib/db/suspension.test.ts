// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// Un negocio suspendido (`active = false`) no puede editarse desde el panel,
// en ninguna de las tablas que toca (además de desaparecer de lo público, ya
// probado en public-menu.test.ts y settings.test.ts).
const SUPER = "5a5a5a5a-0000-0000-0000-000000000001";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const CAT_ANA = "c1000000-0000-0000-0000-000000000001";
const PROD_ANA = "d1000000-0000-0000-0000-000000000001";
const PROMO_ANA = "e1000000-0000-0000-0000-000000000001";

let db: TestDb;

async function suspend(active: boolean) {
  const r = await asUser(
    db, SUPER, `update businesses set active = ${active} where id = '${NEG_ANA}'`,
  );
  expect(r.ok).toBe(true);
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: SUPER, email: "super@sma.com" });
  await createUser(db, { id: ANA, email: "ana@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, plan_completo) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into categories (id, business_id, name) values ('${CAT_ANA}', '${NEG_ANA}', 'Bebidas');
    insert into products (id, business_id, category_id, name, price) values
      ('${PROD_ANA}', '${NEG_ANA}', '${CAT_ANA}', 'Café', 1000);
    insert into promotions (id, business_id, name, type, discount_percent, active) values
      ('${PROMO_ANA}', '${NEG_ANA}', 'Desayuno', 'percent', 20, true);
    insert into promotion_items (promotion_id, product_id, business_id) values
      ('${PROMO_ANA}', '${PROD_ANA}', '${NEG_ANA}');
    insert into business_settings (business_id, template) values ('${NEG_ANA}', 'moderno');
  `);
}, 60_000);

describe("bloqueo por suspensión — ADMIN-SUSPENSION-1", () => {
  it("activo: un miembro edita categorías, productos, promociones, configuración y pedidos", async () => {
    await suspend(true);

    expect(
      (await asUser(db, ANA, `update categories set name = 'Bebidas' where id = '${CAT_ANA}'`)).ok,
    ).toBe(true);
    expect(
      (await asUser(db, ANA, `update products set price = 1100 where id = '${PROD_ANA}'`)).ok,
    ).toBe(true);
    expect(
      (await asUser(db, ANA, `update promotions set discount_percent = 25 where id = '${PROMO_ANA}'`))
        .ok,
    ).toBe(true);
    expect(
      (await asUser(db, ANA, `update business_settings set tagline = 'Hola' where business_id = '${NEG_ANA}'`))
        .ok,
    ).toBe(true);
    expect(
      (await asUser(db, ANA, `insert into orders (business_id, order_number) values ('${NEG_ANA}', '1')`))
        .ok,
    ).toBe(true);
  });

  it("suspendido: nada de eso se puede crear ni editar", async () => {
    await suspend(false);

    const categoria = await asUser(
      db, ANA, `update categories set name = 'Cambiada' where id = '${CAT_ANA}'`,
    );
    const producto = await asUser(
      db, ANA, `update products set price = 2000 where id = '${PROD_ANA}'`,
    );
    const promocion = await asUser(
      db, ANA, `update promotions set discount_percent = 30 where id = '${PROMO_ANA}'`,
    );
    const configuracion = await asUser(
      db, ANA, `update business_settings set tagline = 'Chau' where business_id = '${NEG_ANA}'`,
    );
    const pedido = await asUser(
      db, ANA, `insert into orders (business_id, order_number) values ('${NEG_ANA}', '2')`,
    );
    const categoriaNueva = await asUser(
      db, ANA, `insert into categories (business_id, name) values ('${NEG_ANA}', 'Nueva')`,
    );

    for (const r of [categoria, producto, promocion, configuracion, pedido, categoriaNueva]) {
      expect(r.ok).toBe(false);
      expect(!r.ok && r.code).toBe("P0010");
    }

    await suspend(true);
  });

  it("suspendido: el borrado no se bloquea (solo alta y edición)", async () => {
    await suspend(false);
    const r = await asUser(
      db, ANA, `delete from promotion_items where promotion_id = '${PROMO_ANA}' and product_id = '${PROD_ANA}'`,
    );
    expect(r.ok && r.affected).toBe(1);

    // Se reinserta para no afectar otros tests si el archivo se corre de nuevo.
    await suspend(true);
    await db.exec(
      `insert into promotion_items (promotion_id, product_id, business_id) values ('${PROMO_ANA}', '${PROD_ANA}', '${NEG_ANA}')`,
    );
  });
});
