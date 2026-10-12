// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asService, asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// MP-12 y MP-15 contra Postgres real: las tablas de la conexión por OAuth no las toca nadie salvo la clave
// de servicio, y el interruptor `mp_oauth_enabled` solo lo mueve un superadmin.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña
const STAFF = "bbbbbbbb-0000-0000-0000-000000000002";
const SUPER = "dddddddd-0000-0000-0000-000000000004";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: STAFF, email: "staff@x.com" });
  await createUser(db, { id: SUPER, email: "super@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo)
      values ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true);
    insert into business_users (business_id, user_id, role) values
      ('${NEG_ANA}', '${ANA}', 'owner'), ('${NEG_ANA}', '${STAFF}', 'staff');
  `);
});

afterAll(() => db.close());

const connection = `insert into payment_connections
  (business_id, mp_user_id, access_token_enc, refresh_token_enc, key_version, expires_at, scope, status, connected_by)
  values ('${NEG_ANA}', 111, 'cifrado-a', 'cifrado-r', 1, now() + interval '180 days', 'offline_access read write',
          'connected', '${ANA}')`;

const state = `insert into mp_oauth_states (state_hash, business_id, user_id, code_verifier_enc, expires_at)
  values ('hash-1', '${NEG_ANA}', '${ANA}', 'verifier-cifrado', now() + interval '10 minutes')`;

describe("las tablas de la conexión — MP-12", () => {
  it("la clave de servicio las lee y escribe", async () => {
    expect((await asService(db, connection)).ok).toBe(true);
    expect((await asService(db, state)).ok).toBe(true);

    const read = await asService(db, "select count(*) n from payment_connections");
    expect(read.ok && Number(read.rows[0].n)).toBe(1);
  });

  it.each([
    ["anon", null],
    ["el dueño del negocio", ANA],
    ["un miembro staff", STAFF],
    ["un superadmin", SUPER],
  ])("%s no lee ni escribe payment_connections ni mp_oauth_states", async (_name, user) => {
    // `createTestDb` vuelve a dar permisos a `anon` y `authenticated` después de las migraciones, así que
    // acá el bloqueo lo hace el RLS sin políticas: no ven filas y no escriben. En Supabase, además, el
    // REVOKE de la migración hace que ni siquiera puedan consultar la tabla.
    for (const table of ["payment_connections", "mp_oauth_states"]) {
      const read = await asUser(db, user, `select * from ${table}`);
      expect(read.ok ? read.rows.length : 0).toBe(0);

      const update = await asUser(db, user, `update ${table} set business_id = business_id`);
      expect(update.ok ? update.affected : 0).toBe(0);

      const remove = await asUser(db, user, `delete from ${table}`);
      expect(remove.ok ? remove.affected : 0).toBe(0);
    }

    const insert = await asUser(db, user, state.replace("hash-1", "hash-2"));
    expect(insert.ok).toBe(false);

    const left = await asService(db, "select count(*) n from mp_oauth_states");
    expect(left.ok && Number(left.rows[0].n)).toBe(1);
  });

  it("un mismo mp_user_id no puede estar en dos negocios", async () => {
    await db.exec(`
      insert into businesses (id, name, slug, whatsapp)
        values ('b2b2b2b2-0000-0000-0000-000000000002', 'Otro', 'otro', '5493510000009');
    `);
    const r = await asService(
      db,
      connection.replace(NEG_ANA, "b2b2b2b2-0000-0000-0000-000000000002"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("23505");
  });

  it("un negocio tiene una sola conexión y un state no se repite", async () => {
    const again = await asService(db, connection.replace("111", "222"));
    expect(again.ok).toBe(false);

    const sameState = await asService(db, state);
    expect(sameState.ok).toBe(false);
  });

  it("solo admite los estados conocidos", async () => {
    const r = await asService(db, "update payment_connections set status = 'otro'");
    expect(r.ok).toBe(false);
  });

  it("al desconectar quedan sin tokens, y conectada sin tokens no se acepta", async () => {
    const revoked = await asService(
      db,
      `update payment_connections set status = 'revoked', access_token_enc = null, refresh_token_enc = null
       where business_id = '${NEG_ANA}'`,
    );
    expect(revoked.ok && revoked.affected).toBe(1);

    const bad = await asService(
      db,
      `update payment_connections set status = 'connected' where business_id = '${NEG_ANA}'`,
    );
    expect(bad.ok).toBe(false);
  });

  it("borrar el negocio borra la conexión y sus states", async () => {
    await db.exec(`
      insert into businesses (id, name, slug, whatsapp)
        values ('c3c3c3c3-0000-0000-0000-000000000003', 'Temporal', 'temporal', '5493510000008');
    `);
    await asService(
      db,
      connection.replace(NEG_ANA, "c3c3c3c3-0000-0000-0000-000000000003").replace("111", "333"),
    );
    await db.exec("delete from businesses where id = 'c3c3c3c3-0000-0000-0000-000000000003'");

    const r = await asService(db, "select count(*) n from payment_connections where mp_user_id = 333");
    expect(r.ok && Number(r.rows[0].n)).toBe(0);
  });
});

describe("el interruptor por negocio — MP-15", () => {
  it("arranca apagado", async () => {
    const r = await db.query<{ v: boolean }>(
      `select mp_oauth_enabled v from businesses where id = '${NEG_ANA}'`,
    );
    expect(r.rows[0].v).toBe(false);
  });

  it("el dueño no puede prenderlo", async () => {
    const r = await asUser(db, ANA, `update businesses set mp_oauth_enabled = true where id = '${NEG_ANA}'`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("42501");
  });

  it("el dueño sigue editando el resto de su negocio", async () => {
    const r = await asUser(db, ANA, `update businesses set name = 'Ana Resto 2' where id = '${NEG_ANA}'`);
    expect(r.ok && r.affected).toBe(1);
  });

  it("un superadmin lo prende y lo apaga", async () => {
    const on = await asUser(db, SUPER, `update businesses set mp_oauth_enabled = true where id = '${NEG_ANA}'`);
    expect(on.ok && on.affected).toBe(1);

    const off = await asUser(db, SUPER, `update businesses set mp_oauth_enabled = false where id = '${NEG_ANA}'`);
    expect(off.ok && off.affected).toBe(1);
  });

  it("la clave de servicio también", async () => {
    const r = await asService(db, `update businesses set mp_oauth_enabled = true where id = '${NEG_ANA}'`);
    expect(r.ok && r.affected).toBe(1);
  });
});
