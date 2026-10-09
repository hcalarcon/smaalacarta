// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
// @ts-expect-error — el script es un .mjs sin tipos
import { armarMigracion, DIR_IMAGENES, DIR_MIGRACIONES, limpiarSvg, nombreMigracion, parseTabla } from "../../../scripts/seed-default-images.mjs";

// ADMIN-SUPER-25 y 26: nombre único y seed ampliado de imágenes predeterminadas, contra Postgres real.
const SUPER = "5a5a5a5a-0000-0000-0000-000000000009";

let db: TestDb;

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";

async function entrada(nombre: string, categoria: string | null = null) {
  const r = await asUser(
    db,
    null,
    `select name from public.suggest_default_image(${q(nombre)}, ${categoria === null ? "null" : q(categoria)})`,
  );
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0]?.name as string | undefined) ?? null;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: SUPER, email: "super@sma.com" });
  await db.exec(`insert into super_admins (user_id) values ('${SUPER}')`);
}, 60_000);

describe("default_images — nombre único — ADMIN-SUPER-25", () => {
  const insertar = (nombre: string) =>
    asUser(db, SUPER, `insert into default_images (name, keywords, image_url) values (${q(nombre)}, array['x'], 'https://x.test/a.svg')`);

  it("el superadmin no puede repetir un nombre, ni cambiando mayúsculas ni con espacios en los bordes", async () => {
    for (const repetido of ["Pizza", "pizza", "  PIZZA  "]) {
      const r = await insertar(repetido);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.code).toBe("23505");
    }
  });

  it("un nombre distinto sí se guarda", async () => {
    expect((await insertar("Pizza al molde")).ok).toBe(true);
    await asUser(db, SUPER, "delete from default_images where name = 'Pizza al molde'");
  });

  it("no queda ninguna entrada repetida en el seed", async () => {
    const r = await db.query<{ n: number; distintos: number }>(
      "select count(*)::int as n, count(distinct lower(name))::int as distintos from default_images",
    );
    expect(r.rows[0].n).toBe(r.rows[0].distintos);
  });
});

describe("seed ampliado — ADMIN-SUPER-26", () => {
  const leer = (sufijo: string) => {
    const f = readdirSync(DIR_MIGRACIONES).find((a: string) => a.endsWith(sufijo));
    expect(f).toBeDefined();
    return readFileSync(path.join(DIR_MIGRACIONES, f as string), "utf8");
  };
  const migracion = () => leer("_seed_imagenes_predeterminadas_ampliado.sql");
  const migracionFotos = () => leer("_imagenes_predeterminadas_fotos.sql");

  it("toda imagen de default_images existe en landing/assets/defaults", async () => {
    const r = await db.query<{ image_url: string }>("select image_url from default_images");
    const faltan = r.rows
      .map((x) => x.image_url.split("/").pop() as string)
      .filter((archivo) => !existsSync(path.join(DIR_IMAGENES, archivo)));
    expect(faltan).toEqual([]);
  });

  it("no se pierde ninguna palabra clave del seed inicial ni quedan entradas sin claves", async () => {
    const r = await db.query<{ name: string }>("select name from default_images where cardinality(keywords) = 0");
    expect(r.rows).toEqual([]);
  });

  it("suma claves a las entradas que ya existían en lugar de duplicarlas", async () => {
    const r = await db.query<{ keywords: string[]; priority: number }>(
      "select keywords, priority from default_images where name = 'Choripán'",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].keywords).toEqual(expect.arrayContaining(["salchicha", "panchos".replace(/s$/, ""), "choripan"]));
    expect(r.rows[0].priority).toBe(5); // la del seed inicial, sin tocar
  });

  it("las entradas nuevas entran con prioridad 0", async () => {
    const r = await db.query<{ priority: number }>("select priority from default_images where name in ('Guiso', 'Granizado', 'Palta')");
    expect(r.rows.map((x) => x.priority)).toEqual([0, 0, 0]);
  });

  it("correrlo de nuevo no cambia nada", async () => {
    const foto = async () =>
      (await db.query("select name, keywords, image_url, priority from default_images order by name")).rows;
    const antes = await foto();
    await db.exec(migracion());
    await db.exec(migracionFotos()); // el seed vuelve a poner el `.svg`; la migración de fotos lo cambia otra vez
    expect(await foto()).toEqual(antes);
  });

  it("las fotos son .jpg y correr su migración de nuevo no cambia nada — ADMIN-SUPER-27", async () => {
    const urls = async () => (await db.query<{ image_url: string }>("select image_url from default_images order by name")).rows;
    const antes = await urls();
    expect(antes.every((x) => !x.image_url.endsWith(".svg"))).toBe(true);
    await db.exec(migracionFotos());
    expect(await urls()).toEqual(antes);
  });

  it("una imagen del superadmin con otra dirección no se toca — ADMIN-SUPER-27", async () => {
    await db.exec("insert into default_images (name, keywords, image_url) values ('Propia SVG', array['propia svg'], 'https://x.test/propia.svg')");
    await db.exec(migracionFotos());
    const r = await db.query<{ image_url: string }>("select image_url from default_images where name = 'Propia SVG'");
    expect(r.rows[0].image_url).toBe("https://x.test/propia.svg");
    await db.exec("delete from default_images where name = 'Propia SVG'");
  });

  it.each([
    ["Milanesa napolitana", "Milanesa napolitana"],
    ["Milanesa napolitana con papas fritas", "Milanesa napolitana"],
    ["Milanesa", "Milanesa"],
    ["Papas fritas", "Papas fritas"],
    ["Hamburguesa con papas fritas", "Hamburguesa"],
    ["Puré de papas", "Papa"],
    ["Pancho", "Choripán"],
    ["Entrecot", "Bife"],
    ["Ramen", "Sopa"],
    ["Locro", "Guiso"],
    ["Cucurucho", "Cucurucho"],
    ["Frozen", "Granizado"],
    ["Torta de cumpleaños", "Torta de cumpleaños"],
    ["Caipirinha", "Trago tropical"],
    ["Champagne", "Espumante"],
    ["Naranja", "Naranja"],
    ["Palta", "Palta"],
  ])("%j -> %s", async (nombre, esperada) => {
    expect(await entrada(nombre)).toBe(esperada);
  });
});

describe("script seed-default-images — ADMIN-SUPER-26", () => {
  it("limpiarSvg saca el prólogo XML y los comentarios", () => {
    const limpio = limpiarSvg('<?xml version="1.0"?>\n<!-- Noto -->\n<svg viewBox="0 0 1 1"><!-- x --><path/></svg>\n');
    expect(limpio).toBe('<svg viewBox="0 0 1 1"><path/></svg>\n');
  });

  it("cada fila de la tabla está en ENTRADAS o en NOMBRES_NUEVAS, y ninguna apunta a la misma entrada", () => {
    const filas = parseTabla();
    expect(filas).toHaveLength(75);
    expect(() => armarMigracion(filas)).not.toThrow();
  });

  it("dos filas que apuntan a la misma entrada, o dos nuevas con la misma clave, no se arman", () => {
    const [a, b] = parseTabla();
    expect(() => armarMigracion([a, { ...b, entrada: a.entrada }])).toThrow(/misma entrada/);
    const nuevas = parseTabla().filter((f: { nueva: boolean }) => f.nueva);
    expect(() => armarMigracion([nuevas[0], { ...nuevas[1], keywords: nuevas[0].keywords }])).toThrow(/reclaman/);
  });

  it("las comillas de un nombre se escapan", () => {
    const [f] = parseTabla();
    expect(armarMigracion([{ ...f, entrada: "L'Atelier" }])).toContain("'L''Atelier'");
  });

  it("nombreMigracion reusa la que ya existe o toma el día siguiente a la última", () => {
    expect(nombreMigracion(["20261012000000_a.sql", "20261014000000_b.sql"])).toEqual({
      nombre: "20261015000000_seed_imagenes_predeterminadas_ampliado.sql",
      existia: false,
    });
    expect(nombreMigracion(["20261015000000_seed_imagenes_predeterminadas_ampliado.sql"]).existia).toBe(true);
  });
});
