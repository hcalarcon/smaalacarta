// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-CONFIG-1, 3 y 4 (y el formato de ADMIN-CONFIG-2 en la base) contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";

let db: TestDb;

type Settings = {
  business?: string;
  published?: boolean;
  template?: string;
  tagline?: string;
  primary?: string;
  secondary?: string;
  header?: string | null;
  schedule?: unknown;
  whatsapp?: string;
};

// Llama a la función que guarda la configuración, como lo haría la app.
function save(user: string | null, s: Settings = {}) {
  const header = s.header === undefined ? "https://ejemplo.com/cabecera.jpg" : s.header;
  return asUser(
    db,
    user,
    `select public.save_business_settings(
       '${s.business ?? NEG_ANA}'::uuid,
       ${s.published ?? false},
       '${s.template ?? "moderno"}',
       '${s.tagline ?? "Cocina casera"}',
       '${s.primary ?? "#463AE5"}',
       '${s.secondary ?? "#9A6CE0"}',
       ${header === null ? "null" : `'${header}'`},
       '${JSON.stringify(s.schedule ?? { lunes: ["12:00-15:00", "20:00-01:00"], domingo: [] })}'::jsonb,
       '${s.whatsapp ?? "5493510000000"}')`,
  );
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug) values
      ('${NEG_ANA}', 'Ana', 'ana'), ('${NEG_BETO}', 'Beto', 'beto');
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
  `);
}, 60_000);

describe("guardar la configuración — ADMIN-CONFIG-1 y 3", () => {
  it("un miembro guarda la configuración de su negocio y su WhatsApp", async () => {
    const r = await save(ANA, { published: true, tagline: "La mejor" });

    expect(r.ok).toBe(true);
    const s = await db.query<{ published: boolean; tagline: string; template: string; primary_color: string }>(
      `select published, tagline, template, primary_color from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(s.rows[0]).toEqual({
      published: true,
      tagline: "La mejor",
      template: "moderno",
      primary_color: "#463AE5",
    });
    const b = await db.query<{ whatsapp: string }>(
      `select whatsapp from businesses where id = '${NEG_ANA}'`,
    );
    expect(b.rows[0].whatsapp).toBe("5493510000000");
  });

  it("guardar de nuevo actualiza la misma fila (no duplica)", async () => {
    await save(ANA, { tagline: "Segunda vez" });

    const s = await db.query<{ tagline: string }>(
      `select tagline from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(s.rows).toEqual([{ tagline: "Segunda vez" }]);
  });

  it("un miembro lee su configuración y nadie más", async () => {
    await save(BETO, { business: NEG_BETO, tagline: "De Beto" });

    const propia = await asUser(db, ANA, "select business_id from business_settings");
    const sinSesion = await asUser(db, null, "select business_id from business_settings");

    expect(propia.ok && propia.rows.map((r) => r.business_id)).toEqual([NEG_ANA]);
    expect(sinSesion.ok && sinSesion.rows).toHaveLength(0);
  });

  it("no se puede guardar la configuración de otro negocio", async () => {
    const r = await save(ANA, { business: NEG_BETO, tagline: "Intrusa" });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501");
    const s = await db.query<{ tagline: string }>(
      `select tagline from business_settings where business_id = '${NEG_BETO}'`,
    );
    expect(s.rows[0].tagline).toBe("De Beto");
  });

  it("ni cambiar su WhatsApp", async () => {
    const antes = await db.query<{ whatsapp: string | null }>(
      `select whatsapp from businesses where id = '${NEG_BETO}'`,
    );
    await save(ANA, { business: NEG_BETO, whatsapp: "999" });

    const despues = await db.query<{ whatsapp: string | null }>(
      `select whatsapp from businesses where id = '${NEG_BETO}'`,
    );
    expect(despues.rows[0].whatsapp).toBe(antes.rows[0].whatsapp);
  });

  it("sin sesión no se guarda nada", async () => {
    expect((await save(null)).ok).toBe(false);
  });

  it("no se puede borrar la configuración desde la app", async () => {
    const r = await asUser(db, ANA, `delete from business_settings where business_id = '${NEG_ANA}'`);
    expect(r.ok && r.affected).toBe(0);
  });
});

describe("es atómico — ADMIN-CONFIG-3", () => {
  it("si la configuración es inválida no cambia el WhatsApp", async () => {
    const antes = await db.query<{ whatsapp: string }>(
      `select whatsapp from businesses where id = '${NEG_ANA}'`,
    );

    const r = await save(ANA, { primary: "rojo", whatsapp: "5490000000000" });

    expect(r.ok).toBe(false);
    const despues = await db.query<{ whatsapp: string }>(
      `select whatsapp from businesses where id = '${NEG_ANA}'`,
    );
    expect(despues.rows[0].whatsapp).toBe(antes.rows[0].whatsapp);
  });
});

describe("formato de los datos — ADMIN-CONFIG-2", () => {
  it.each([
    ["plantilla desconocida", { template: "futurista" }],
    ["color sin #", { primary: "463AE5" }],
    ["color corto", { secondary: "#fff" }],
    ["color con letras inválidas", { primary: "#GGGGGG" }],
    ["imagen sin https", { header: "http://x.com/a.jpg" }],
    ["imagen que no es una dirección", { header: "javascript:alert(1)" }],
    ["día desconocido", { schedule: { lunes2: ["10:00-12:00"] } }],
    ["horario que no es una lista", { schedule: { lunes: "10:00-12:00" } }],
    ["hora inválida", { schedule: { lunes: ["25:00-26:00"] } }],
    ["formato inválido", { schedule: { lunes: ["10-12"] } }],
    ["horarios que no son un objeto", { schedule: ["lunes"] }],
  ])("rechaza %s", async (_caso, extra) => {
    const r = await save(ANA, extra as Settings);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23514");
  });

  it("acepta los horarios que cruzan la medianoche y los días cerrados", async () => {
    const r = await save(ANA, {
      schedule: { viernes: ["20:00-02:00"], sabado: ["12:00-15:00", "20:00-02:00"], domingo: [] },
    });
    expect(r.ok).toBe(true);
  });

  it("acepta no tener imagen de cabecera ni horarios", async () => {
    const r = await save(ANA, { header: null, schedule: {} });
    expect(r.ok).toBe(true);
  });
});

describe("publicación — ADMIN-CONFIG-4", () => {
  it("un negocio nuevo no es público", async () => {
    const nuevo = "a3a3a3a3-0000-0000-0000-000000000003";
    await db.exec(`insert into businesses (id, name, slug) values ('${nuevo}', 'Nuevo', 'nuevo')`);
    await db.exec(`insert into business_settings (business_id) values ('${nuevo}')`);

    const s = await db.query<{ published: boolean; template: string }>(
      `select published, template from business_settings where business_id = '${nuevo}'`,
    );
    expect(s.rows[0]).toEqual({ published: false, template: "moderno" });
  });

  it("los valores por defecto son válidos", async () => {
    const otro = "a4a4a4a4-0000-0000-0000-000000000004";
    await db.exec(`insert into businesses (id, name, slug) values ('${otro}', 'Otro', 'otro')`);

    const r = await db.query(`insert into business_settings (business_id) values ('${otro}') returning *`);
    expect(r.rows).toHaveLength(1);
  });
});
