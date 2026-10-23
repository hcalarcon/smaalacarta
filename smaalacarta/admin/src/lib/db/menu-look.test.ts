// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// PUBLICO-102 a 110 contra Postgres real: la animación del menú, la de carga (con la propia) y la imagen de fondo.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";

const HOST = "https://x.supabase.co/storage/v1/object/public";
const ANIM = (business: string, name = "abc-123.gif") => `${HOST}/business-animations/${business}/${name}`;
const FONDO = (business: string, name = "fondo-1.webp") => `${HOST}/business-images/${business}/${name}`;

let db: TestDb;

const sql = (value: string | null) => (value === null ? "null" : `'${value}'`);

const save = (
  user: string,
  business: string,
  look: { menu?: string; loader?: string; loaderUrl?: string | null; background?: string | null },
) =>
  asUser(
    db,
    user,
    `select public.save_menu_look('${business}', '${look.menu ?? "estandar"}', '${look.loader ?? "hamburguesa"}',
       ${sql(look.loaderUrl ?? null)}, ${sql(look.background ?? null)})`,
  );

async function row(business: string) {
  const r = await db.query<{
    menu_animation: string;
    loader_animation: string;
    loader_custom_url: string | null;
    background_image_url: string | null;
  }>(
    `select menu_animation, loader_animation, loader_custom_url, background_image_url
       from business_settings where business_id = '${business}'`,
  );
  return r.rows[0];
}

async function config(slug: string) {
  const r = await asUser(db, null, `select public.public_menu('${slug}') as m`);
  if (!r.ok) throw new Error(r.error);
  return (r.rows[0].m as { config: Record<string, unknown> }).config;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await db.exec(`
    insert into businesses (id, name, slug, plan_completo) values
      ('${NEG_ANA}', 'Ana', 'ana', true), ('${NEG_BETO}', 'Beto', 'beto', true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published) values ('${NEG_ANA}', true), ('${NEG_BETO}', true);
  `);
}, 60_000);

describe("valores por defecto — PUBLICO-102", () => {
  it("un negocio que nunca eligió carga con su logo (PUBLICO-118): estándar, logo y sin fondo", async () => {
    expect(await row(NEG_ANA)).toEqual({
      menu_animation: "estandar",
      loader_animation: "logo",
      loader_custom_url: null,
      background_image_url: null,
    });
  });

  it("el menú público lo entrega en la configuración, sin fondo ni archivo propio", async () => {
    const c = await config("ana");
    expect(c.animacionMenu).toBe("estandar");
    expect(c.animacionCarga).toBe("logo");
    expect(c).not.toHaveProperty("animacionCargaUrl");
    expect(c).not.toHaveProperty("fondo");
  });
});

describe("guardar y leer la elección — PUBLICO-103", () => {
  it("guarda la animación del menú y la de carga de la lista", async () => {
    expect((await save(ANA, NEG_ANA, { menu: "dinamica", loader: "sushi" })).ok).toBe(true);

    expect(await row(NEG_ANA)).toMatchObject({ menu_animation: "dinamica", loader_animation: "sushi" });
    const c = await config("ana");
    expect(c.animacionMenu).toBe("dinamica");
    expect(c.animacionCarga).toBe("sushi");
  });

  it("'Sin animaciones' se guarda y llega al menú", async () => {
    expect((await save(ANA, NEG_ANA, { menu: "ninguna" })).ok).toBe(true);
    expect((await config("ana")).animacionMenu).toBe("ninguna");
  });

  it("la animación propia y el fondo llegan por la función pública", async () => {
    const r = await save(ANA, NEG_ANA, {
      menu: "suave",
      loader: "custom",
      loaderUrl: ANIM(NEG_ANA),
      background: FONDO(NEG_ANA),
    });
    expect(r.ok).toBe(true);

    const c = await config("ana");
    expect(c.animacionCarga).toBe("custom");
    expect(c.animacionCargaUrl).toBe(ANIM(NEG_ANA));
    expect(c.fondo).toBe(FONDO(NEG_ANA));
  });

  it("quitar el fondo y volver a una animación de la lista borra los archivos guardados", async () => {
    expect((await save(ANA, NEG_ANA, { loader: "pizza", loaderUrl: ANIM(NEG_ANA), background: null })).ok).toBe(true);

    expect(await row(NEG_ANA)).toMatchObject({
      loader_animation: "pizza",
      loader_custom_url: null,
      background_image_url: null,
    });
    const c = await config("ana");
    expect(c).not.toHaveProperty("fondo");
    expect(c).not.toHaveProperty("animacionCargaUrl");
  });

  it("la vista previa del panel trae los mismos datos", async () => {
    await save(ANA, NEG_ANA, { menu: "dinamica", background: FONDO(NEG_ANA) });
    const r = await asUser(db, ANA, `select public.menu_preview('${NEG_ANA}') as m`);
    const cfg = r.ok && (r.rows[0].m as { config: Record<string, unknown> }).config;
    expect(cfg && cfg.animacionMenu).toBe("dinamica");
    expect(cfg && cfg.fondo).toBe(FONDO(NEG_ANA));
  });
});

describe("empanada y logo — PUBLICO-118", () => {
  it("se pueden elegir y se guardan sin archivo propio", async () => {
    for (const loader of ["empanada", "logo", "hamburguesa"]) {
      expect((await save(ANA, NEG_ANA, { loader })).ok).toBe(true);
      expect(await row(NEG_ANA)).toMatchObject({ loader_animation: loader, loader_custom_url: null });
    }
  });

  it("el menú público entrega la elección guardada (los que ya eligieron una no cambian)", async () => {
    await save(ANA, NEG_ANA, { loader: "pizza" });
    expect((await config("ana")).animacionCarga).toBe("pizza");
  });
});

describe("validación en el servidor — PUBLICO-104 y 105", () => {
  it.each([
    ["una animación del menú que no existe", { menu: "loca" }],
    ["una animación de carga que no existe", { loader: "cohete" }],
    ["'propia' sin archivo", { loader: "custom", loaderUrl: null }],
  ])("rechaza %s", async (_name, look) => {
    const r = await save(ANA, NEG_ANA, look);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("22023");
  });

  it.each([
    ["de otro negocio", ANIM(NEG_BETO)],
    ["de otro bucket", `${HOST}/business-images/${NEG_ANA}/abc.gif`],
    ["de otro tipo", ANIM(NEG_ANA, "abc.svg")],
    ["que no es https", `http://x.supabase.co/storage/v1/object/public/business-animations/${NEG_ANA}/abc.gif`],
    ["fuera de Storage", "https://evil.example/business-animations/otro.gif"],
    ["con una carpeta que escapa", ANIM(NEG_ANA, "../x.gif")],
  ])("rechaza una animación propia %s", async (_name, url) => {
    const r = await save(ANA, NEG_ANA, { loader: "custom", loaderUrl: url });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("22023");
  });

  it.each([
    ["de otro negocio", FONDO(NEG_BETO)],
    ["del bucket de animaciones", `${HOST}/business-animations/${NEG_ANA}/fondo.webp`],
    ["que es un GIF", FONDO(NEG_ANA, "fondo.gif")],
  ])("rechaza un fondo %s", async (_name, url) => {
    const r = await save(ANA, NEG_ANA, { background: url });
    expect(r.ok).toBe(false);
  });

  it("la tabla también lo exige, aunque se escriba directo", async () => {
    const otraCarpeta = await asUser(
      db,
      ANA,
      `update business_settings set background_image_url = '${FONDO(NEG_BETO)}' where business_id = '${NEG_ANA}'`,
    );
    expect(otraCarpeta.ok).toBe(false);

    const sinArchivo = await asUser(
      db,
      ANA,
      `update business_settings set loader_animation = 'custom', loader_custom_url = null where business_id = '${NEG_ANA}'`,
    );
    expect(sinArchivo.ok).toBe(false);
  });
});

describe("cada negocio, lo suyo — PUBLICO-106", () => {
  it("un negocio no cambia la elección de otro", async () => {
    await save(BETO, NEG_BETO, { menu: "ninguna", loader: "cafe" });

    const r = await save(ANA, NEG_BETO, { menu: "dinamica", loader: "pizza" });
    expect(r.ok).toBe(false);
    expect(await row(NEG_BETO)).toMatchObject({ menu_animation: "ninguna", loader_animation: "cafe" });
  });

  it("sin sesión no se guarda nada", async () => {
    const r = await asUser(db, null, `select public.save_menu_look('${NEG_ANA}', 'ninguna', 'pizza', null, null)`);
    expect(r.ok).toBe(false);
    expect((await row(NEG_ANA)).menu_animation).not.toBe("ninguna");
  });
});

describe("el bucket de animaciones — PUBLICO-105", () => {
  const BUCKET = "business-animations";
  const insert = (user: string | null, name: string, bucket = BUCKET) =>
    asUser(db, user, `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')`);

  it("limita el tipo y el tamaño: GIF, WebP o PNG, hasta 1 MB", async () => {
    const r = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = '${BUCKET}'`,
    );

    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].public).toBe(true);
    expect(Number(r.rows[0].file_size_limit)).toBe(1024 * 1024);
    expect([...r.rows[0].allowed_mime_types].sort()).toEqual(["image/gif", "image/png", "image/webp"]);
  });

  it("el bucket de imágenes (el fondo) sigue en 2 MB", async () => {
    const r = await db.query<{ file_size_limit: string }>(
      "select file_size_limit from storage.buckets where id = 'business-images'",
    );
    expect(Number(r.rows[0].file_size_limit)).toBe(2 * 1024 * 1024);
  });

  it("un miembro sube a la carpeta de su negocio y a ninguna otra", async () => {
    expect((await insert(ANA, `${NEG_ANA}/mi-animacion.gif`)).ok).toBe(true);

    const ajena = await insert(ANA, `${NEG_BETO}/intruso.gif`);
    expect(ajena.ok).toBe(false);
    expect(!ajena.ok && ajena.code).toBe("42501");
    expect((await insert(ANA, "suelto.gif")).ok).toBe(false);
    expect((await insert(ANA, `${NEG_ANA}/../${NEG_BETO}/x.gif`)).ok).toBe(false);
    expect((await insert(null, `${NEG_ANA}/anonimo.gif`)).ok).toBe(false);
  });

  it("un miembro borra lo suyo, no lo ajeno", async () => {
    await insert(BETO, `${NEG_BETO}/ajena.gif`);
    const ajeno = await asUser(db, ANA, `delete from storage.objects where name = '${NEG_BETO}/ajena.gif'`);
    expect(ajeno.ok && ajeno.affected).toBe(0);
  });
});
