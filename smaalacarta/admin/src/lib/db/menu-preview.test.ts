// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-CONFIG-43 contra Postgres real: `menu_preview` entrega al panel el menú de un
// negocio con el formato de `public_menu`, aunque no esté publicado ni tenga el plan del servicio.
// Que `public_menu` no cambió al separar su cuerpo lo cubren `public-menu.test.ts` y compañía.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const SUPER = "cccccccc-0000-0000-0000-000000000003";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";

type Menu = {
  config: Record<string, unknown>;
  menu: {
    categorias: {
      nombre: string;
      items: {
        nombre: string;
        agotado?: boolean;
        imagen?: string;
        imagenIlustrativa?: boolean;
        opciones?: { nombre: string; opciones: { nombre: string; precio: number }[] }[];
      }[];
    }[];
  };
};

let db: TestDb;

async function preview(user: string | null, business: string) {
  return asUser(db, user, `select public.menu_preview('${business}'::uuid) as m`);
}

async function publicMenu(slug: string) {
  const r = await asUser(db, null, `select public.public_menu('${slug}') as m`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].m as Menu | null;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: SUPER, email: "super@x.com" });
  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');

    -- Ana: sin publicar y sin plan_completo, a propósito.
    insert into businesses (id, name, slug, whatsapp) values
      ('${NEG_ANA}', 'Ana', 'ana', '5493510000000'),
      ('${NEG_BETO}', 'Beto', 'beto', '5493510000001');
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published, template, theme, primary_color, secondary_color) values
      ('${NEG_ANA}', false, 'clasico', 'oscuro', '#ff0000', '#0000ff'),
      ('${NEG_BETO}', false, 'moderno', 'claro', '#00ff00', '#00ffff');

    insert into categories (id, business_id, name, sort_order) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Postres', 1),
      ('c1000000-0000-0000-0000-000000000002', '${NEG_ANA}', 'Vacía', 2);
    insert into products (id, business_id, category_id, name, price, sold_out, sort_order) values
      ('d1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Waffle', 5000, false, 1),
      ('d1000000-0000-0000-0000-000000000002', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Flan', 3000, true, 2);
    insert into products (id, business_id, category_id, name, price, active, sort_order) values
      ('d1000000-0000-0000-0000-000000000003', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Oculto', 100, false, 3);

    -- 'Waffle' tiene una imagen predeterminada en el seed de las migraciones.
    insert into option_groups (id, business_id, name, min_select, max_select) values
      ('e1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Salsa', 0, 1);
    insert into options (id, group_id, business_id, name, price_delta, sort_order) values
      ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Chocolate', 200, 1);
    insert into product_option_groups (product_id, group_id, business_id, sort_order) values
      ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 1);
  `);
}, 60_000);

describe("menu_preview — ADMIN-CONFIG-43", () => {
  it("un miembro del negocio lo ve aunque no esté publicado ni tenga el plan", async () => {
    // El menú público de ese mismo negocio no existe todavía...
    expect(await publicMenu("ana")).toBeNull();

    // ...pero la vista previa sí lo arma.
    const r = await preview(ANA, NEG_ANA);
    expect(r.ok).toBe(true);
    const menu = (r.ok && r.rows[0].m) as Menu;
    expect(menu.config).toMatchObject({
      nombre: "Ana",
      template: "clasico",
      tema: "oscuro",
      colores: { primary: "#ff0000", secondary: "#0000ff" },
    });
  });

  it("devuelve productos activos, agotados, opciones e imagen predeterminada", async () => {
    const r = await preview(ANA, NEG_ANA);
    const menu = (r.ok && r.rows[0].m) as Menu;

    // La categoría sin productos activos no se entrega.
    expect(menu.menu.categorias.map((c) => c.nombre)).toEqual(["Postres"]);

    const items = menu.menu.categorias[0].items;
    expect(items.map((i) => i.nombre)).toEqual(["Waffle", "Flan"]);
    expect(items[1].agotado).toBe(true);

    expect(items[0].imagen).toMatch(/^https:\/\//);
    expect(items[0].imagenIlustrativa).toBe(true);
    expect(items[0].opciones?.[0]).toMatchObject({
      nombre: "Salsa",
      opciones: [{ nombre: "Chocolate", precio: 200 }],
    });
  });

  it("el superadmin también lo ve", async () => {
    const r = await preview(SUPER, NEG_ANA);
    expect(r.ok).toBe(true);
  });

  it("quien no es miembro de ese negocio no lo ve", async () => {
    const r = await preview(BETO, NEG_ANA);
    expect(r.ok).toBe(false);
  });

  it("sin sesión no se puede llamar", async () => {
    const r = await preview(null, NEG_ANA);
    expect(r.ok).toBe(false);
  });

  it("un negocio que no existe da error, no un menú vacío", async () => {
    const r = await preview(ANA, "99999999-0000-0000-0000-000000000009");
    expect(r.ok).toBe(false);
  });
});

describe("build_public_menu — interna", () => {
  it("no se puede llamar desde la app", async () => {
    for (const user of [null, ANA]) {
      const r = await asUser(db, user, `select public.build_public_menu('${NEG_ANA}'::uuid)`);
      expect(r.ok).toBe(false);
    }
  });
});
