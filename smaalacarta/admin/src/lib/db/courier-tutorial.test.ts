// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ENVIO-212 contra Postgres real: el tutorial del repartidor se marca por repartidor, en la base, y solo lo marca él.
const UNO_USER = "cccccccc-0000-0000-0000-000000000006";
const DOS_USER = "cccccccc-0000-0000-0000-000000000007";
const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const UNO = "7a0c0e00-0000-4000-8000-000000000002";
const DOS = "7a0c0e00-0000-4000-8000-000000000003";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const status = (user: string | null) => call(user, "select public.courier_tutorial_status() as s");
const mark = (user: string | null) => call(user, "select public.courier_mark_tutorial_seen()");
const seenAt = async (courier: string) =>
  (await db.query<{ t: string | null }>("select tutorial_seen_at as t from couriers where id = $1", [courier])).rows[0].t;

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed" });

  await createUser(db, { id: OWNER, email: "owner@x.com" });
  await createUser(db, { id: UNO_USER, email: "uno@x.com" });
  await createUser(db, { id: DOS_USER, email: "dos@x.com" });
  await db.exec(`
    insert into couriers (id, name, whatsapp, active) values
      ('${UNO}', 'Uno Express', '5493510000099', true),
      ('${DOS}', 'Dos Express', '5493510000098', true);
    insert into courier_users (courier_id, user_id) values ('${UNO}', '${UNO_USER}'), ('${DOS}', '${DOS_USER}');
  `);
}, 60_000);

beforeEach(async () => {
  await db.exec("update couriers set tutorial_seen_at = null");
  await db.exec("update platform_settings set delivery_mode = 'fixed'");
});

afterAll(async () => {
  await db.close();
});

describe("el tutorial del repartidor — ENVIO-212", () => {
  it("arranca sin ver y trae el modo de envíos de la plataforma", async () => {
    const r = await status(UNO_USER);
    expect(r.ok && r.rows[0].s).toMatchObject({ seen: false, mode: "fixed" });

    await db.exec("update platform_settings set delivery_mode = 'offers'");
    const o = await status(UNO_USER);
    expect(o.ok && o.rows[0].s).toMatchObject({ seen: false, mode: "offers" });
  });

  it("trae el precio de lista de una zona real: la más barata de las que cubre", async () => {
    const zones = (await db.query<{ id: string; price: string }>("select id, price from delivery_zones where active order by price desc")).rows;
    const dear = zones[0];
    await db.exec(`insert into courier_zone_coverage (courier_id, zone_id) values ('${DOS}', '${dear.id}') on conflict do nothing`);

    const own = await status(DOS_USER);
    expect(own.ok && Number((own.rows[0].s as { zone_price: number }).zone_price)).toBe(Number(dear.price));

    // Sin zonas propias, la más barata de la plataforma.
    const cheapest = Math.min(...zones.map((z) => Number(z.price)));
    const none = await status(UNO_USER);
    expect(none.ok && Number((none.rows[0].s as { zone_price: number }).zone_price)).toBe(cheapest);
  });

  it("marcarlo pone la hora una sola vez y solo en su propia fila", async () => {
    expect((await mark(UNO_USER)).ok).toBe(true);

    const first = await seenAt(UNO);
    expect(first).not.toBeNull();
    expect(await seenAt(DOS)).toBeNull();

    const r = await status(UNO_USER);
    expect(r.ok && r.rows[0].s).toMatchObject({ seen: true });

    // Repetirlo no pisa la primera hora.
    await db.exec("update couriers set tutorial_seen_at = tutorial_seen_at - interval '1 day' where id = '" + UNO + "'");
    const before = await seenAt(UNO);
    expect((await mark(UNO_USER)).ok).toBe(true);
    expect(new Date(String(await seenAt(UNO))).getTime()).toBe(new Date(String(before)).getTime());
  });

  it("sin ser repartidor, ni leer ni marcar", async () => {
    for (const user of [null, OWNER]) {
      const s = await status(user);
      const m = await mark(user);
      expect(s.ok).toBe(false);
      expect(m.ok).toBe(false);
    }
  });

  it("el navegador no puede escribir la columna a mano", async () => {
    const r = await call(UNO_USER, `update couriers set tutorial_seen_at = now() where id = '${UNO}'`);
    expect(r.ok && (await seenAt(UNO))).toBeFalsy();
  });
});
