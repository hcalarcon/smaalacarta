// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// PUBLICO-1 a 5 contra Postgres real: la función `public_menu`.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const NEG_PRIVADO = "c3c3c3c3-0000-0000-0000-000000000003";

let db: TestDb;

type Item = {
  nombre: string;
  descripcion?: string;
  precio: number;
  precioAnterior?: number;
  promo?: string;
  imagen?: string;
  destacado?: boolean;
};
type Menu = {
  config: Record<string, unknown> & {
    colores?: { primary: string; secondary: string };
    header?: { imagen: string };
    horarios?: Record<string, string[]>;
  };
  menu: { categorias: { nombre: string; tipo?: string; descripcion?: string; items: Item[] }[] };
};

async function publicMenu(slug: string, user: string | null = null) {
  const r = await asUser(db, user, `select public.public_menu('${slug}') as menu`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].menu as Menu | null;
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001'),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002'),
      ('${NEG_PRIVADO}', 'Privado', 'privado', '5493510000003');
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');

    insert into business_settings
      (business_id, published, template, tagline, primary_color, secondary_color, header_image_url, schedule)
    values
      ('${NEG_ANA}', true, 'clasico', 'Cocina casera', '#112233', '#445566',
       'https://ejemplo.com/cabecera.jpg', '{"lunes":["12:00-15:00"],"domingo":[]}'),
      ('${NEG_BETO}', true, 'moderno', null, '#5a4a3a', '#d97706', null, '{}'),
      ('${NEG_PRIVADO}', false, 'moderno', null, '#5a4a3a', '#d97706', null, '{}');

    -- Ana: "Comidas" va antes que "Bebidas" por su orden; "Vacía" y "Oculta" no salen.
    insert into categories (id, business_id, name, description, active, sort_order, created_at) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', 'Frías y calientes', true, 1, '2026-01-01'),
      ('c1000000-0000-0000-0000-000000000002', '${NEG_ANA}', 'Comidas', null, true, 0, '2026-01-02'),
      ('c1000000-0000-0000-0000-000000000003', '${NEG_ANA}', 'Vacía', null, true, 2, '2026-01-03'),
      ('c1000000-0000-0000-0000-000000000004', '${NEG_ANA}', 'Oculta', null, false, 3, '2026-01-04');

    insert into products (id, business_id, category_id, name, description, price, active, featured, image_url, sort_order, created_at) values
      ('d1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 'Doble', 1000, true, true, 'https://ejemplo.com/cafe.jpg', 0, '2026-01-01'),
      ('d1000000-0000-0000-0000-000000000002', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Té', null, 800, true, false, null, 1, '2026-01-02'),
      ('d1000000-0000-0000-0000-000000000003', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Jugo', null, 1200, false, false, null, 2, '2026-01-03'),
      ('d1000000-0000-0000-0000-000000000004', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000002', 'Milanesa', 'Con papas', 5000, true, false, null, 0, '2026-01-04'),
      ('d1000000-0000-0000-0000-000000000005', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000004', 'De la oculta', null, 100, true, false, null, 0, '2026-01-05');
    insert into products (id, business_id, name, price, active) values
      ('d1000000-0000-0000-0000-000000000006', '${NEG_ANA}', 'Sin categoría', 100, true);

    -- Beto: una categoría con un producto, para comprobar que no se mezcla con Ana.
    insert into categories (id, business_id, name) values
      ('c2000000-0000-0000-0000-000000000001', '${NEG_BETO}', 'Tragos');
    insert into products (id, business_id, category_id, name, price) values
      ('d2000000-0000-0000-0000-000000000001', '${NEG_BETO}', 'c2000000-0000-0000-0000-000000000001', 'Fernet', 2500);

    -- Promociones de Ana.
    insert into promotions (id, business_id, name, description, type, discount_percent, price, active, created_at) values
      ('e1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Desayuno', null, 'percent', 20, null, true, '2026-02-01'),
      ('e1000000-0000-0000-0000-000000000002', '${NEG_ANA}', 'Combo', 'Para dos', 'combo', 0, 1500, true, '2026-02-02'),
      ('e1000000-0000-0000-0000-000000000003', '${NEG_ANA}', 'Con oculto', null, 'percent', 10, null, true, '2026-02-03'),
      ('e1000000-0000-0000-0000-000000000004', '${NEG_ANA}', 'Apagada', null, 'percent', 10, null, false, '2026-02-04'),
      ('e1000000-0000-0000-0000-000000000005', '${NEG_ANA}', 'Combo caro', null, 'combo', 0, 5000, true, '2026-02-05');
    insert into promotion_items (promotion_id, product_id, business_id, sort_order) values
      ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', '${NEG_ANA}', 0),
      ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 1),
      ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 0),
      ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', '${NEG_ANA}', 1),
      ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', '${NEG_ANA}', 0),
      ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 0),
      ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 0);
  `);
}, 60_000);

describe("qué negocios se publican — PUBLICO-1", () => {
  it("un slug que no existe no devuelve nada", async () => {
    expect(await publicMenu("no-existe")).toBeNull();
  });

  it("un negocio sin publicar no devuelve nada", async () => {
    expect(await publicMenu("privado")).toBeNull();
  });

  it("un negocio sin configuración no devuelve nada", async () => {
    await db.exec(`insert into businesses (id, name, slug) values ('c4c4c4c4-0000-0000-0000-000000000004', 'Sin config', 'sin-config')`);
    expect(await publicMenu("sin-config")).toBeNull();
  });

  it("uno publicado devuelve su menú", async () => {
    expect(await publicMenu("ana")).not.toBeNull();
  });
});

describe("categorías y productos — PUBLICO-2", () => {
  it("solo trae lo activo, en el orden del negocio y sin categorías vacías", async () => {
    const menu = await publicMenu("ana");
    const nombres = menu!.menu.categorias.map((c) => c.nombre);

    // "Ofertas" va primero; después Comidas (orden 0) y Bebidas (orden 1).
    expect(nombres).toEqual(["Ofertas", "Comidas", "Bebidas"]);
  });

  it("los productos salen en su orden y sin los inactivos", async () => {
    const menu = await publicMenu("ana");
    const bebidas = menu!.menu.categorias.find((c) => c.nombre === "Bebidas")!;

    expect(bebidas.items.map((i) => i.nombre)).toEqual(["Café", "Té"]);
  });

  it("el producto lleva descripción, precio, imagen y destacado", async () => {
    const menu = await publicMenu("ana");
    const cafe = menu!.menu.categorias.find((c) => c.nombre === "Bebidas")!.items[0];

    expect(cafe).toEqual({
      nombre: "Café",
      descripcion: "Doble",
      precio: 1000,
      imagen: "https://ejemplo.com/cafe.jpg",
      destacado: true,
    });
  });

  it("lo que no se cargó no aparece, y destacado es false por defecto", async () => {
    const menu = await publicMenu("ana");
    const te = menu!.menu.categorias.find((c) => c.nombre === "Bebidas")!.items[1];

    expect(te).toEqual({ nombre: "Té", precio: 800, destacado: false });
  });

  it("la categoría lleva su descripción", async () => {
    const menu = await publicMenu("ana");
    expect(menu!.menu.categorias.find((c) => c.nombre === "Bebidas")!.descripcion).toBe(
      "Frías y calientes",
    );
  });

  it("no incluye productos sin categoría ni de categorías ocultas", async () => {
    const menu = await publicMenu("ana");
    const todos = menu!.menu.categorias.flatMap((c) => c.items.map((i) => i.nombre));

    expect(todos).not.toContain("Sin categoría");
    expect(todos).not.toContain("De la oculta");
    expect(todos).not.toContain("Jugo");
  });

  it("no mezcla datos de otros negocios", async () => {
    const ana = await publicMenu("ana");
    const beto = await publicMenu("beto");

    const deAna = ana!.menu.categorias.flatMap((c) => c.items.map((i) => i.nombre));
    expect(deAna).not.toContain("Fernet");
    expect(beto!.menu.categorias.map((c) => c.nombre)).toEqual(["Tragos"]);
    expect(beto!.menu.categorias[0].items.map((i) => i.nombre)).toEqual(["Fernet"]);
  });
});

describe("promociones — PUBLICO-3", () => {
  it("van en una categoría 'Ofertas' al principio, marcada como tal", async () => {
    const menu = await publicMenu("ana");
    const ofertas = menu!.menu.categorias[0];

    expect(ofertas.nombre).toBe("Ofertas");
    expect(ofertas.tipo).toBe("ofertas");
  });

  it("un descuento calcula el precio final y muestra el anterior", async () => {
    const menu = await publicMenu("ana");
    const desayuno = menu!.menu.categorias[0].items.find((i) => i.nombre === "Desayuno")!;

    expect(desayuno).toEqual({
      nombre: "Desayuno",
      descripcion: "Incluye: Té, Café",
      precio: 1440,
      precioAnterior: 1800,
      promo: "20% OFF",
    });
  });

  it("un combo usa su precio fijo, con su descripción", async () => {
    const menu = await publicMenu("ana");
    const combo = menu!.menu.categorias[0].items.find((i) => i.nombre === "Combo")!;

    expect(combo).toEqual({
      nombre: "Combo",
      descripcion: "Para dos · Incluye: Café, Milanesa",
      precio: 1500,
      precioAnterior: 6000,
      promo: "Combo",
    });
  });

  it("sin ahorro no muestra precio anterior", async () => {
    const menu = await publicMenu("ana");
    const caro = menu!.menu.categorias[0].items.find((i) => i.nombre === "Combo caro")!;

    expect(caro.precio).toBe(5000);
    expect(caro).not.toHaveProperty("precioAnterior");
  });

  it("no incluye promociones apagadas ni con productos ocultos", async () => {
    const menu = await publicMenu("ana");
    const nombres = menu!.menu.categorias[0].items.map((i) => i.nombre);

    expect(nombres).toEqual(["Desayuno", "Combo", "Combo caro"]);
  });

  it("sin promociones no hay categoría 'Ofertas'", async () => {
    const menu = await publicMenu("beto");
    expect(menu!.menu.categorias.map((c) => c.nombre)).not.toContain("Ofertas");
  });
});

describe("configuración — PUBLICO-4", () => {
  it("llega con el formato del menú actual", async () => {
    const menu = await publicMenu("ana");

    expect(menu!.config).toEqual({
      nombre: "Ana Resto",
      descripcion: "Cocina casera",
      template: "clasico",
      tipo: "cliente",
      telefono: "5493510000001",
      colores: { primary: "#112233", secondary: "#445566" },
      header: { imagen: "https://ejemplo.com/cabecera.jpg" },
      horarios: { lunes: ["12:00-15:00"], domingo: [] },
    });
  });

  it("sin horarios ni cabecera ni descripción, esas claves no aparecen", async () => {
    const menu = await publicMenu("beto");

    expect(menu!.config).not.toHaveProperty("horarios");
    expect(menu!.config).not.toHaveProperty("header");
    expect(menu!.config).not.toHaveProperty("descripcion");
    expect(menu!.config.template).toBe("moderno");
  });
});

describe("permisos — PUBLICO-5", () => {
  it("sin sesión se puede pedir el menú", async () => {
    expect(await publicMenu("ana", null)).not.toBeNull();
  });

  it("también con sesión de otro negocio", async () => {
    expect(await publicMenu("ana", BETO)).not.toBeNull();
  });

  it.each(["businesses", "categories", "products", "promotions", "promotion_items", "business_settings", "business_users", "profiles"])(
    "sin sesión no se lee la tabla %s",
    async (tabla) => {
      const r = await asUser(db, null, `select * from ${tabla}`);
      expect(r.ok && r.rows).toHaveLength(0);
    },
  );

  it("la función no filtra un negocio sin publicar aunque se conozca su id", async () => {
    const r = await asUser(db, null, `select public.public_menu('${NEG_PRIVADO}') as menu`);
    expect(r.ok && r.rows[0].menu).toBeNull();
  });
});
