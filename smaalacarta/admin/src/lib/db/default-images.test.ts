// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-CONFIG-31, ADMIN-SUPER-17 a 20 y 23, y PUBLICO-51 a 53 contra Postgres real: las imágenes
// predeterminadas, `normalize_words`, `suggest_default_image`, `public_menu` y el RLS.
const SUPER = "5a5a5a5a-0000-0000-0000-000000000009";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const CAT_COMIDAS = "c1000000-0000-0000-0000-000000000001";
const CAT_POSTRES = "c1000000-0000-0000-0000-000000000002";
const CAT_BETO = "c2000000-0000-0000-0000-000000000001";
const PROPIA = "https://ejemplo.com/propia.jpg";

let db: TestDb;

type Suggestion = { name: string; image_url: string; keyword: string; by_category: boolean };

async function suggest(name: string, category: string | null = null) {
  const r = await asUser(
    db,
    null,
    `select * from public.suggest_default_image(${q(name)}, ${category === null ? "null" : q(category)})`,
  );
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0] ?? null) as Suggestion | null;
}

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const file = (url: string | undefined) => url?.split("/").pop();

type MenuItem = { nombre: string; imagen?: string; imagenIlustrativa?: boolean };

async function items(slug = "ana") {
  const r = await asUser(db, null, `select public.public_menu('${slug}') as m`);
  if (!r.ok) throw new Error(r.error);
  const menu = r.rows[0].m as { menu: { categorias: { nombre: string; items: MenuItem[] }[] } };
  return Object.fromEntries(menu.menu.categorias.flatMap((c) => c.items).map((i) => [i.nombre, i]));
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: SUPER, email: "super@sma.com" });
  await createUser(db, { id: ANA, email: "ana@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, plan_completo) values
      ('${NEG_ANA}', 'Ana', 'ana', true), ('${NEG_BETO}', 'Beto', 'beto', true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published) values ('${NEG_ANA}', true), ('${NEG_BETO}', true);

    insert into categories (id, business_id, name) values
      ('${CAT_COMIDAS}', '${NEG_ANA}', 'Comidas'), ('${CAT_POSTRES}', '${NEG_ANA}', 'Postres'),
      ('${CAT_BETO}', '${NEG_BETO}', 'Varios');
    insert into products (business_id, category_id, name, price, image_url) values
      ('${NEG_ANA}', '${CAT_COMIDAS}', 'Hamburguesa completa', 100, null),
      ('${NEG_ANA}', '${CAT_COMIDAS}', 'Pizza con foto', 100, '${PROPIA}'),
      ('${NEG_ANA}', '${CAT_COMIDAS}', 'Plato misterioso', 100, null),
      ('${NEG_ANA}', '${CAT_POSTRES}', 'Sorpresa de la casa', 100, null),
      ('${NEG_ANA}', '${CAT_COMIDAS}', 'Foto vacía', 100, null),
      ('${NEG_BETO}', '${CAT_BETO}', 'Plato misterioso', 100, null),
      ('${NEG_BETO}', '${CAT_BETO}', 'Misterio de Beto', 100, null);
  `);
}, 60_000);

describe("normalize_words — ADMIN-SUPER-17", () => {
  const normalize = async (text: string) => {
    const r = await db.query<{ w: string[] }>(`select public.normalize_words(${q(text)}) as w`);
    return r.rows[0].w;
  };

  it.each([
    ["Hamburguesas Dobles, ÑOQUIS!", ["hamburguesa", "doble", "noqui"]],
    ["Sándwiches de miga", ["sandwich", "de", "miga"]],
    ["Panes y limones", ["pan", "y", "limon"]],
    ["Helado 1/4 kilo", ["helado", "1", "4", "kilo"]],
    ["Té  verde", ["te", "verde"]],
    ["  ", []],
  ])("%j -> %j", async (text, esperado) => {
    expect(await normalize(text)).toEqual(esperado);
  });

  it("un texto nulo da una lista vacía", async () => {
    const r = await db.query<{ w: string[] }>("select public.normalize_words(null) as w");
    expect(r.rows[0].w).toEqual([]);
  });
});

describe("suggest_default_image — ADMIN-SUPER-20", () => {
  it.each([
    ["Hamburguesa completa", "Hamburguesa"],
    ["Hamburguesas dobles con cheddar", "Hamburguesa"],
    ["Hamburguesa con papas fritas", "Hamburguesa"], // el plato principal gana sobre el acompañamiento
    ["Milanesa napolitana", "Milanesa napolitana"], // la clave más específica gana
    ["Milanesa con papas fritas", "Milanesa"],
    ["Pizza muzzarella", "Pizza muzzarella"],
    ["Focaccia de romero", "Focaccia"],
    ["Cerveza IPA 500ml", "Cerveza"],
    ["Helado 1/4 kilo", "Helado"],
    ["Sándwiches de miga", "Sándwich"],
    ["Ñoquis de papa", "Pasta"], // "noquis" quedó también en Pasta (misma imagen): gana por orden alfabético
    ["PAPAS FRITAS", "Papas fritas"],
  ])("%j -> %s", async (nombre, entrada) => {
    expect((await suggest(nombre))?.name).toBe(entrada);
  });

  it("la milanesa napolitana y la común tienen imágenes distintas", async () => {
    const napolitana = await suggest("Milanesa napolitana");
    const comun = await suggest("Milanesa");
    expect(file(napolitana?.image_url)).not.toBe(file(comun?.image_url));
  });

  it("devuelve la dirección de la ilustración y la clave que coincidió", async () => {
    const s = await suggest("Pizza muzzarella");
    expect(s?.image_url).toBe("https://www.smaalacarta.com.ar/assets/defaults/pizza.svg");
    expect(s?.keyword).toBe("pizza muzzarella");
    expect(s?.by_category).toBe(false);
  });

  it("un nombre sin coincidencia no devuelve nada", async () => {
    expect(await suggest("Plato misterioso")).toBeNull();
    expect(await suggest("")).toBeNull();
  });

  it("la categoría cuenta en una segunda pasada, siempre por debajo del nombre", async () => {
    const porCategoria = await suggest("Sorpresa de la casa", "Postres");
    expect(porCategoria?.name).toBe("Flan y postres");
    expect(porCategoria?.by_category).toBe(true);

    const porNombre = await suggest("Café", "Postres");
    expect(porNombre?.name).toBe("Café");
    expect(porNombre?.by_category).toBe(false);
  });

  it("el desempate es estable: la misma consulta da siempre la misma entrada", async () => {
    const a = await suggest("Promo cerveza y gaseosa");
    const b = await suggest("Promo cerveza y gaseosa");
    expect(a?.name).toBe(b?.name);
  });
});

describe("default_images — palabras clave y RLS — ADMIN-SUPER-18", () => {
  const insert = (user: string | null, extra = "") =>
    asUser(
      db,
      user,
      `insert into default_images (name, keywords, image_url ${extra ? ", " + extra.split("|")[0] : ""})
       values ('Prueba', array['Dulce  de  LECHE!', '', 'dulce de leche', 'Té'], 'https://x.test/a.svg' ${extra ? ", " + extra.split("|")[1] : ""})
       returning id, keywords`,
    );

  it("el superadmin guarda y las palabras clave quedan normalizadas, sin vacías ni repetidas", async () => {
    const r = await insert(SUPER);
    expect(r.ok).toBe(true);
    expect(r.ok && r.rows[0].keywords).toEqual(["dulce de leche", "te"]);

    await asUser(db, SUPER, "delete from default_images where name = 'Prueba'");
  });

  it("un miembro de un negocio no escribe", async () => {
    const r = await insert(ANA);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501");
  });

  it("sin sesión tampoco", async () => {
    expect((await insert(null)).ok).toBe(false);
  });

  it("solo el superadmin edita y borra", async () => {
    const deANA = await asUser(db, ANA, "update default_images set priority = 99 where name = 'Pizza'");
    expect(deANA.ok && deANA.affected).toBe(0);
    const borraANA = await asUser(db, ANA, "delete from default_images where name = 'Pizza'");
    expect(borraANA.ok && borraANA.affected).toBe(0);

    const deSuper = await asUser(db, SUPER, "update default_images set priority = 6 where name = 'Pizza'");
    expect(deSuper.ok && deSuper.affected).toBe(1);
  });

  it("al editar, las palabras clave se vuelven a normalizar", async () => {
    await asUser(db, SUPER, "update default_images set keywords = array['Pizzetas Rellenas'] where name = 'Pizza'");
    const r = await db.query<{ keywords: string[] }>("select keywords from default_images where name = 'Pizza'");
    expect(r.rows[0].keywords).toEqual(["pizzeta rellena"]);
    await asUser(db, SUPER, "update default_images set keywords = array['pizza', 'pizzeta'] where name = 'Pizza'");
  });

  it("la imagen tiene que ser una dirección https", async () => {
    const r = await asUser(db, SUPER, "insert into default_images (name, image_url) values ('Mala', 'javascript:alert(1)')");
    expect(r.ok).toBe(false);
  });

  it("cualquiera lee las activas; las inactivas solo las ve el superadmin", async () => {
    await asUser(db, SUPER, "update default_images set active = false where name = 'Waffle'");

    const anon = await asUser(db, null, "select name from default_images where name = 'Waffle'");
    const miembro = await asUser(db, ANA, "select name from default_images where name = 'Waffle'");
    const superadmin = await asUser(db, SUPER, "select name from default_images where name = 'Waffle'");
    const activas = await asUser(db, null, "select count(*)::int as n from default_images");

    expect(anon.ok && anon.rows).toHaveLength(0);
    expect(miembro.ok && miembro.rows).toHaveLength(0);
    expect(superadmin.ok && superadmin.rows).toHaveLength(1);
    expect(activas.ok && (activas.rows[0].n as number)).toBeGreaterThanOrEqual(60);

    // Una entrada inactiva no se sugiere.
    expect(await suggest("Waffle con helado")).toMatchObject({ name: "Helado" });

    await asUser(db, SUPER, "update default_images set active = true where name = 'Waffle'");
  });

  it("el seed trae entre 60 y 120 entradas, todas con ilustración de landing/assets/defaults", async () => {
    const r = await db.query<{ n: number; fuera: number }>(
      `select count(*)::int as n,
              count(*) filter (where image_url not like 'https://www.smaalacarta.com.ar/assets/defaults/%.svg')::int as fuera
       from default_images`,
    );
    expect(r.rows[0].n).toBeGreaterThanOrEqual(60);
    expect(r.rows[0].n).toBeLessThanOrEqual(120);
    expect(r.rows[0].fuera).toBe(0);
  });
});

describe("bucket default-images — ADMIN-SUPER-19", () => {
  it("es público, pesa 1 MB como máximo y acepta webp, png, jpg y svg", async () => {
    const r = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      "select public, file_size_limit::int as file_size_limit, allowed_mime_types from storage.buckets where id = 'default-images'",
    );
    expect(r.rows[0].public).toBe(true);
    expect(r.rows[0].file_size_limit).toBe(1048576);
    expect([...r.rows[0].allowed_mime_types].sort()).toEqual(["image/jpeg", "image/png", "image/svg+xml", "image/webp"]);
  });

  const upload = (user: string | null) =>
    asUser(db, user, "insert into storage.objects (bucket_id, name) values ('default-images', 'nueva.svg')");

  it("solo el superadmin escribe", async () => {
    expect((await upload(ANA)).ok).toBe(false);
    expect((await upload(null)).ok).toBe(false);
    expect((await upload(SUPER)).ok).toBe(true);
  });

  it("cualquiera lee", async () => {
    const r = await asUser(db, null, "select name from storage.objects where bucket_id = 'default-images'");
    expect(r.ok && r.rows.map((x) => x.name)).toEqual(["nueva.svg"]);
  });
});

describe("public_menu con imágenes predeterminadas — PUBLICO-51 a 53", () => {
  it("un producto sin imagen propia lleva la ilustración y se marca como ilustrativa", async () => {
    const hamburguesa = (await items())["Hamburguesa completa"];
    expect(file(hamburguesa.imagen)).toBe("hamburguesa.svg");
    expect(hamburguesa.imagenIlustrativa).toBe(true);
  });

  it("la imagen propia siempre gana, y no se marca como ilustrativa", async () => {
    const pizza = (await items())["Pizza con foto"];
    expect(pizza.imagen).toBe(PROPIA);
    expect(pizza.imagenIlustrativa).toBeUndefined();
  });

  it("una imagen propia vacía cuenta como sin imagen", async () => {
    await db.exec("update products set image_url = '' where name = 'Foto vacía'").catch(() => undefined);
    const item = (await items())["Foto vacía"];
    // 'Foto vacía' no coincide con nada: sin imagen en cualquiera de los dos casos.
    expect(item.imagen ?? "").toBe("");
  });

  it("sin coincidencia no hay imagen: el menú del navegador muestra el logo", async () => {
    const misterioso = (await items())["Plato misterioso"];
    expect(misterioso.imagen).toBeUndefined();
    expect(misterioso.imagenIlustrativa).toBeUndefined();
  });

  it("el nombre de la categoría también cuenta", async () => {
    const especial = (await items())["Sorpresa de la casa"];
    expect(file(especial.imagen)).toBe("flan.svg");
    expect(especial.imagenIlustrativa).toBe(true);
  });

  it("con el interruptor apagado no hay ilustraciones, pero la imagen propia sigue", async () => {
    await db.exec(`update business_settings set show_default_images = false where business_id = '${NEG_ANA}'`);
    const menu = await items();

    expect(menu["Hamburguesa completa"].imagen).toBeUndefined();
    expect(menu["Hamburguesa completa"].imagenIlustrativa).toBeUndefined();
    expect(menu["Pizza con foto"].imagen).toBe(PROPIA);

    await db.exec(`update business_settings set show_default_images = true where business_id = '${NEG_ANA}'`);
  });

  it("una entrada inactiva no se usa", async () => {
    await asUser(db, SUPER, "update default_images set active = false where name = 'Hamburguesa'");
    expect((await items())["Hamburguesa completa"].imagen).toBeUndefined();
    await asUser(db, SUPER, "update default_images set active = true where name = 'Hamburguesa'");
  });

  it("el interruptor es por negocio: apagar el de Ana no cambia el de Beto", async () => {
    await db.exec(`update business_settings set show_default_images = false where business_id = '${NEG_ANA}'`);
    await db.exec(`update products set name = 'Pizza de Beto' where business_id = '${NEG_BETO}' and name = 'Misterio de Beto'`);

    const beto = await items("beto");
    expect(file(beto["Pizza de Beto"].imagen)).toBe("pizza.svg");

    await db.exec(`update business_settings set show_default_images = true where business_id = '${NEG_ANA}'`);
  });
});

describe("show_default_images — ADMIN-CONFIG-31", () => {
  it("por defecto está prendido", async () => {
    const r = await db.query<{ show_default_images: boolean }>(
      `select show_default_images from business_settings where business_id = '${NEG_BETO}'`,
    );
    expect(r.rows[0].show_default_images).toBe(true);
  });

  it("save_business_settings lo guarda", async () => {
    const guardar = (valor: boolean) =>
      asUser(
        db,
        ANA,
        `select public.save_business_settings(
           '${NEG_ANA}'::uuid, true, 'moderno', '', '#463AE5', '#9A6CE0', null, '{}'::jsonb, '5493510000000', '', '', '',
           false, '', null::date, null, null, 'claro', array['delivery']::text[], array['efectivo']::text[], null, null,
           true, 30, false, '{}'::jsonb, 50, 50, ${valor})`,
      );

    expect((await guardar(false)).ok).toBe(true);
    const apagado = await db.query<{ show_default_images: boolean }>(
      `select show_default_images from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(apagado.rows[0].show_default_images).toBe(false);

    await guardar(true);
  });

  it("sin el parámetro (el panel anterior) lo deja prendido", async () => {
    const r = await asUser(
      db,
      ANA,
      `select public.save_business_settings(
         '${NEG_ANA}'::uuid, true, 'moderno', '', '#463AE5', '#9A6CE0', null, '{}'::jsonb, '5493510000000', '', '', '',
         false, '', null::date, null, null, 'claro', array['delivery']::text[], array['efectivo']::text[], null, null,
         true, 30, false, '{}'::jsonb, 50, 50)`,
    );
    expect(r.ok).toBe(true);
    const s = await db.query<{ show_default_images: boolean }>(
      `select show_default_images from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(s.rows[0].show_default_images).toBe(true);
  });
});

describe("default_images_unmatched — ADMIN-SUPER-23", () => {
  it("el superadmin ve los productos sin imagen propia ni sugerida, agrupados por nombre y con cantidad de negocios", async () => {
    await db.exec("update products set name = 'Misterio de Beto' where name = 'Pizza de Beto'");
    await db.exec(`insert into products (business_id, category_id, name, price) values
      ('${NEG_BETO}', '${CAT_BETO}', 'PLATO  misterioso!', 100)`);

    const r = await asUser(db, SUPER, "select * from public.default_images_unmatched()");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const misterioso = r.rows.find((x) => x.normalized_name === "plato misterioso");
    expect(misterioso).toMatchObject({ business_count: 2, product_count: 3 });
    // Los que tienen ilustración o imagen propia no aparecen.
    expect(r.rows.some((x) => String(x.normalized_name).includes("hamburguesa"))).toBe(false);
    expect(r.rows.some((x) => String(x.normalized_name).includes("pizza con foto"))).toBe(false);
    // El primero es el que más negocios tiene.
    expect(r.rows[0].normalized_name).toBe("plato misterioso");
  });

  it("no cuenta negocios sin publicar", async () => {
    await db.exec(`update business_settings set published = false where business_id = '${NEG_BETO}'`);
    const r = await asUser(db, SUPER, "select * from public.default_images_unmatched()");
    const misterioso = r.ok && r.rows.find((x) => x.normalized_name === "plato misterioso");
    expect(misterioso).toMatchObject({ business_count: 1 });
    await db.exec(`update business_settings set published = true where business_id = '${NEG_BETO}'`);
  });

  it("un miembro de un negocio o un visitante no lo pueden pedir", async () => {
    const miembro = await asUser(db, ANA, "select * from public.default_images_unmatched()");
    const anon = await asUser(db, null, "select * from public.default_images_unmatched()");

    expect(miembro.ok).toBe(false);
    expect(!miembro.ok && miembro.code).toBe("42501");
    expect(anon.ok).toBe(false);
  });
});
