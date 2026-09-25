// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-SUPER-1 a 5 contra Postgres real.
const SUPER = "5a5a5a5a-0000-0000-0000-000000000001";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const NUEVA = "cccccccc-0000-0000-0000-000000000003"; // cuenta sin negocio
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";

let db: TestDb;

async function count(sql: string) {
  const r = await db.query<{ n: string }>(sql);
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  db = await createTestDb();

  for (const [id, email] of [
    [SUPER, "super@sma.com"],
    [ANA, "ana@x.com"],
    [BETO, "beto@x.com"],
    [NUEVA, "nueva@x.com"],
  ]) {
    await createUser(db, { id, email });
  }

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug) values
      ('${NEG_ANA}', 'Negocio Ana', 'ana'), ('${NEG_BETO}', 'Negocio Beto', 'beto');
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
  `);
}, 60_000);

describe("tabla super_admins — ADMIN-SUPER-1", () => {
  it("un superadmin ve su propia fila", async () => {
    const r = await asUser(db, SUPER, "select user_id from super_admins");
    expect(r.ok && r.rows.map((x) => x.user_id)).toEqual([SUPER]);
  });

  it("un usuario común no ve quiénes son superadmin", async () => {
    const r = await asUser(db, ANA, "select user_id from super_admins");
    expect(r.ok && r.rows).toHaveLength(0);
  });

  it("nadie se agrega como superadmin desde la app", async () => {
    const comun = await asUser(
      db, ANA, `insert into super_admins (user_id) values ('${ANA}')`,
    );
    const anon = await asUser(
      db, null, `insert into super_admins (user_id) values ('${ANA}')`,
    );
    expect(comun.ok).toBe(false);
    expect(anon.ok).toBe(false);
  });

  it("ni un superadmin agrega, cambia o quita filas de la tabla", async () => {
    const agregar = await asUser(
      db, SUPER, `insert into super_admins (user_id) values ('${BETO}')`,
    );
    const quitar = await asUser(
      db, SUPER, `delete from super_admins where user_id = '${SUPER}'`,
    );
    const cambiar = await asUser(
      db, SUPER, `update super_admins set user_id = '${BETO}' where user_id = '${SUPER}'`,
    );

    expect(agregar.ok).toBe(false);
    expect(quitar.ok && quitar.affected).toBe(0);
    expect(cambiar.ok && cambiar.affected).toBe(0);
    expect(await count("select count(*) as n from super_admins")).toBe(1);
  });
});

describe("visibilidad — ADMIN-SUPER-2", () => {
  it("un superadmin ve todos los negocios, miembros y perfiles", async () => {
    const negocios = await asUser(db, SUPER, "select id from businesses");
    const miembros = await asUser(db, SUPER, "select user_id from business_users");
    const perfiles = await asUser(db, SUPER, "select email from profiles");

    expect(negocios.ok && negocios.rows).toHaveLength(2);
    expect(miembros.ok && miembros.rows).toHaveLength(2);
    expect(perfiles.ok && perfiles.rows).toHaveLength(4);
  });

  it("un superadmin edita cualquier negocio", async () => {
    const r = await asUser(
      db, SUPER, `update businesses set whatsapp = '5493510000000' where id = '${NEG_ANA}'`,
    );
    expect(r.ok && r.affected).toBe(1);
  });

  it("un usuario común sigue viendo solo lo suyo", async () => {
    const negocios = await asUser(db, ANA, "select id from businesses");
    const perfiles = await asUser(db, ANA, "select id from profiles");
    expect(negocios.ok && negocios.rows.map((x) => x.id)).toEqual([NEG_ANA]);
    expect(perfiles.ok && perfiles.rows.map((x) => x.id)).toEqual([ANA]);
  });
});

describe("crear negocio con su dueño — ADMIN-SUPER-3 y 5", () => {
  const crear = (
    user: string | null,
    slug = "panaderia",
    owner: string = NUEVA,
  ) =>
    asUser(
      db,
      user,
      `select public.create_business_with_owner(
         'Panadería', '${slug}', '5493510000001', '${owner}') as id`,
    );

  it("un superadmin crea el negocio y su dueño en un solo paso", async () => {
    const r = await crear(SUPER);

    expect(r.ok).toBe(true);
    const id = r.ok ? (r.rows[0].id as string) : "";
    const miembro = await db.query<{ user_id: string; role: string }>(
      `select user_id, role from business_users where business_id = '${id}'`,
    );
    expect(miembro.rows).toEqual([{ user_id: NUEVA, role: "owner" }]);
  });

  it("un usuario común no puede crear negocios", async () => {
    const antes = await count("select count(*) as n from businesses");
    const r = await crear(ANA, "intruso");

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501"); // insufficient_privilege
    expect(await count("select count(*) as n from businesses")).toBe(antes);
  });

  it("sin sesión tampoco", async () => {
    expect((await crear(null, "anonimo")).ok).toBe(false);
  });

  it("solo se crea con la función: ni un superadmin inserta negocios directo", async () => {
    const r = await asUser(
      db, SUPER, `insert into businesses (name, slug) values ('Directo', 'directo')`,
    );
    expect(r.ok).toBe(false);
  });

  it("si el dueño no existe no queda un negocio sin dueño", async () => {
    const antes = await count("select count(*) as n from businesses");
    const r = await crear(SUPER, "sin-duenio", "99999999-0000-0000-0000-000000000009");

    expect(r.ok).toBe(false);
    expect(await count("select count(*) as n from businesses")).toBe(antes);
    expect(
      await count("select count(*) as n from businesses where slug = 'sin-duenio'"),
    ).toBe(0);
  });

  it.each(["www", "admin", "app", "api", "demo", "moderno", "clasico", "minimal"])(
    "no acepta el slug reservado %s (ADMIN-SUPER-12)",
    async (slug) => {
      const r = await crear(SUPER, slug);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.code).toBe("23514");
    },
  );

  it("el slug es único", async () => {
    const r = await crear(SUPER, "ana");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("23505"); // unique_violation
  });

  it.each(["Slug Malo", "con_guion_bajo", "-empieza", "termina-", "doble--guion", "ñandú"])(
    "rechaza el slug %j",
    async (slug) => {
      const r = await crear(SUPER, slug);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.code).toBe("23514"); // check_violation
    },
  );
});

describe("asignar y quitar miembros — ADMIN-SUPER-4", () => {
  it("un superadmin asigna y quita miembros", async () => {
    const agregar = await asUser(
      db, SUPER,
      `insert into business_users (business_id, user_id, role)
       values ('${NEG_ANA}', '${NUEVA}', 'staff')`,
    );
    const quitar = await asUser(
      db, SUPER,
      `delete from business_users where business_id = '${NEG_ANA}' and user_id = '${NUEVA}'`,
    );

    expect(agregar.ok).toBe(true);
    expect(quitar.ok && quitar.affected).toBe(1);
  });

  it("el dueño de un negocio no asigna miembros: solo el superadmin", async () => {
    const r = await asUser(
      db, ANA,
      `insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${NUEVA}')`,
    );
    expect(r.ok).toBe(false);
  });

  it("un usuario común no quita a otro miembro", async () => {
    const r = await asUser(
      db, ANA, `delete from business_users where user_id = '${BETO}'`,
    );
    expect(r.ok && r.affected).toBe(0);
    expect(await count(`select count(*) as n from business_users where user_id = '${BETO}'`)).toBe(1);
  });
});
