// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// PDF-2 contra Postgres real: el bucket de PDF y sus políticas (calcado del de
// imágenes, ver storage.test.ts).
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const BUCKET = "business-pdfs";

let db: TestDb;

const insert = (user: string | null, name: string, bucket = BUCKET) =>
  asUser(db, user, `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')`);

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug) values
      ('${NEG_ANA}', 'Ana', 'ana'), ('${NEG_BETO}', 'Beto', 'beto');
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into storage.buckets (id, name) values ('otro-bucket', 'otro-bucket');
    insert into storage.objects (bucket_id, name) values
      ('${BUCKET}', '${NEG_BETO}/menu.pdf');
  `);
}, 60_000);

describe("el bucket — PDF-2", () => {
  it("existe, es público para leer y limita tipo y tamaño", async () => {
    const r = await db.query<{
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = '${BUCKET}'`,
    );

    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].public).toBe(true);
    expect(Number(r.rows[0].file_size_limit)).toBe(10 * 1024 * 1024);
    expect(r.rows[0].allowed_mime_types).toEqual(["application/pdf"]);
  });
});

describe("escribir — PDF-2", () => {
  it("un miembro sube su PDF a la carpeta de su negocio", async () => {
    expect((await insert(ANA, `${NEG_ANA}/menu.pdf`)).ok).toBe(true);
  });

  it("no puede subir a la carpeta de otro negocio", async () => {
    const r = await insert(ANA, `${NEG_BETO}/intruso.pdf`);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501");
  });

  it("no puede subir fuera de una carpeta de negocio", async () => {
    expect((await insert(ANA, "suelto.pdf")).ok).toBe(false);
  });

  it("no puede escapar de su carpeta con '..'", async () => {
    expect((await insert(ANA, `${NEG_ANA}/../${NEG_BETO}/x.pdf`)).ok).toBe(false);
  });

  it("no puede escribir en otros buckets", async () => {
    expect((await insert(ANA, `${NEG_ANA}/x.pdf`, "otro-bucket")).ok).toBe(false);
  });

  it("sin sesión no se sube nada", async () => {
    expect((await insert(null, `${NEG_ANA}/anonimo.pdf`)).ok).toBe(false);
  });

  it("un miembro borra su PDF, no el de otro", async () => {
    await insert(ANA, `${NEG_ANA}/borrar.pdf`);
    const ajeno = await asUser(db, ANA, `delete from storage.objects where name = '${NEG_BETO}/menu.pdf'`);
    const propio = await asUser(db, ANA, `delete from storage.objects where name = '${NEG_ANA}/borrar.pdf'`);

    expect(ajeno.ok && ajeno.affected).toBe(0);
    expect(propio.ok && propio.affected).toBe(1);
  });
});

describe("leer — PDF-2", () => {
  it("un miembro lista solo los PDF de su negocio", async () => {
    const r = await asUser(db, ANA, `select name from storage.objects where bucket_id = '${BUCKET}'`);
    expect(
      r.ok && r.rows.every((x) => String(x.name).startsWith(`${NEG_ANA}/`)),
    ).toBe(true);
  });

  it("sin sesión no se listan archivos (el PDF se ve por su dirección pública)", async () => {
    const r = await asUser(db, null, `select name from storage.objects where bucket_id = '${BUCKET}'`);
    expect(r.ok && r.rows).toHaveLength(0);
  });
});
