// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer, openSearch } from "@/test/offers";

// ENVIO-145 a 154 contra Postgres real: el modo de envíos (precio fijo u ofertas).
const SUPER = "99999999-0000-0000-0000-000000000009";
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const TOQUE_USER = "cccccccc-0000-0000-0000-000000000003";
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const TOQUE = "7a0c0e00-0000-4000-8000-000000000001";
const MOTO = "7a0c0e00-0000-4000-8000-000000000002";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const setMode = (mode: "fixed" | "offers") =>
  db.exec(`update platform_settings set delivery_mode = '${mode}'`);

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

// Un pedido con envío a Cantera, con el modo que tenga la plataforma ahora.
async function envio() {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${await zoneId("Cantera")}'::uuid,
       p_customer_phone => '3515551234',
       p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  await openSearch(db, o.id);
  return { id: o.id, code };
}

const take = (user: string, id: string) => call(user, `select public.courier_take_order('${id}')`);

async function row(id: string) {
  return (
    await db.query<Record<string, unknown>>(
      `select delivery_mode, courier_id, courier_status, delivery_fee, delivery_fee_list from orders where id = $1`,
      [id],
    )
  ).rows[0];
}

async function delivery(code: string) {
  const r = await call(null, `select public.public_order_delivery('${code}') as d`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].d as Record<string, unknown>;
}

async function available(user: string) {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].l as { id: string; modo: string }[];
}

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed" });

  await createUser(db, { id: SUPER, email: "super@x.com" });
  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: TOQUE_USER, email: "toque@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });

  await db.exec(`
    insert into super_admins (user_id) values ('${SUPER}');
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published, address) values ('${NEG_ANA}', true, 'San Martín 100');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${TOQUE_USER}');
    insert into couriers (id, name, whatsapp, active) values ('${MOTO}', 'Moto Express', '5493510000099', true);
    insert into courier_users (courier_id, user_id) values ('${MOTO}', '${MOTO_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${MOTO}', id from delivery_zones where name = 'Cantera';
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Cantera';
  `);
}, 60_000);

// El freno de 20 pedidos por minuto.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await setMode("fixed");
});

afterAll(async () => {
  await db.close();
});

describe("el interruptor — ENVIO-145", () => {
  it("la plataforma arranca en precio fijo", async () => {
    const fresh = await createTestDb({ before: "20261105000000" });
    const r = await fresh.query<{ delivery_mode: string }>("select delivery_mode from platform_settings");
    expect(r.rows).toEqual([{ delivery_mode: "fixed" }]);
    await fresh.close();
  }, 60_000);

  it("solo el superadmin lo cambia", async () => {
    const a = await call(ANA, "update platform_settings set delivery_mode = 'offers'");
    expect(a.ok && a.affected).toBe(0);
    const t = await call(TOQUE_USER, "update platform_settings set delivery_mode = 'offers'");
    expect(t.ok && t.affected).toBe(0);
    const anon = await call(null, "select * from platform_settings");
    expect(!anon.ok || anon.rows.length === 0).toBe(true);
    expect((await db.query("select delivery_mode from platform_settings")).rows[0]).toEqual({
      delivery_mode: "fixed",
    });

    const s = await call(SUPER, "update platform_settings set delivery_mode = 'offers' returning delivery_mode");
    expect(s.ok && s.rows).toEqual([{ delivery_mode: "offers" }]);
  });

  it("no hay segunda fila ni se borra", async () => {
    const ins = await call(SUPER, "insert into platform_settings (id) values (false)");
    expect(ins.ok).toBe(false);
    const del = await call(SUPER, "delete from platform_settings");
    expect(del.ok && del.affected).toBe(0);
  });

  it("solo el superadmin ve cuántos pedidos están buscando", async () => {
    await envio();
    const s = await call(SUPER, "select public.platform_searching_orders() as n");
    expect(s.ok && Number(s.rows[0].n)).toBeGreaterThanOrEqual(1);
    const a = await call(ANA, "select public.platform_searching_orders() as n");
    expect(!a.ok && a.code).toBe("42501");
  });
});

describe("el pedido copia el modo al nacer — ENVIO-146", () => {
  it("nace con el modo de la plataforma y no cambia si se mueve el interruptor", async () => {
    const fijo = await envio();
    await setMode("offers");
    const ofertas = await envio();
    await setMode("fixed");

    expect((await row(fijo.id)).delivery_mode).toBe("fixed");
    expect((await row(ofertas.id)).delivery_mode).toBe("offers");

    await setMode("offers");
    expect((await row(fijo.id)).delivery_mode).toBe("fixed");
  });

  it("un pedido sin envío no tiene modo", async () => {
    const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
    const r = await call(
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null, '${items}'::jsonb,
         p_customer_phone => '3515551234') as result`,
    );
    expect(r.ok).toBe(true);
    const code = ((r.ok && r.rows[0].result) as { code: string }).code;
    const o = (await db.query<{ delivery_mode: string | null }>(
      "select delivery_mode from orders where code = $1",
      [code],
    )).rows[0];
    expect(o.delivery_mode).toBeNull();
  });

  it("ni el local ni el cliente cambian el modo del pedido", async () => {
    const o = await envio();
    const r = await call(ANA, `update orders set delivery_mode = 'offers' where id = '${o.id}'`);
    expect(r.ok).toBe(false);
    expect((await row(o.id)).delivery_mode).toBe("fixed");
  });

  it("un pedido manual con 'Buscar repartidor' copia el modo", async () => {
    await setMode("fixed");
    const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
    const r = await call(
      ANA,
      `select public.create_manual_order('${NEG_ANA}', 'Cliente', 'delivery', 'efectivo', null, '${items}'::jsonb,
         p_courier_mode => 'offers',
         p_delivery_zone => '${await zoneId("Cantera")}'::uuid,
         p_customer_phone => '3515551234',
         p_delivery_address => 'Av. Siempre Viva 742') as result`,
    );
    if (!r.ok) throw new Error(r.error);
    const id = ((r.rows[0].result as { id?: string }).id ?? "") as string;
    const found = id
      ? (await db.query<{ delivery_mode: string }>("select delivery_mode from orders where id = $1", [id])).rows[0]
      : (await db.query<{ delivery_mode: string }>(
          "select delivery_mode from orders where source = 'manual' order by created_at desc limit 1",
        )).rows[0];
    expect(found.delivery_mode).toBe("fixed");
  });
});

describe("precio fijo: el primero que toma — ENVIO-147", () => {
  it("lo ven los repartidores con el modo y el precio de lista, y lo toma uno al precio de lista", async () => {
    const o = await envio();
    const lista = await available(TOQUE_USER);
    expect(lista.find((x) => x.id === o.id)?.modo).toBe("fixed");

    const r = await take(TOQUE_USER, o.id);
    expect(r.ok).toBe(true);
    const after = await row(o.id);
    expect(after).toMatchObject({ courier_id: TOQUE, courier_status: "accepted" });
    expect(Number(after.delivery_fee)).toBe(Number(after.delivery_fee_list));

    const ev = await db.query<{ note: string }>(
      "select note from order_events where order_id = $1 and kind = 'delivery'",
      [o.id],
    );
    expect(ev.rows.some((e) => e.note.startsWith("Envío tomado por"))).toBe(true);
  });

  it("dos que tocan a la vez: gana uno y el otro recibe P0019", async () => {
    const o = await envio();
    const [a, b] = await Promise.all([take(TOQUE_USER, o.id), take(MOTO_USER, o.id)]);
    const oks = [a, b].filter((r) => r.ok).length;
    expect(oks).toBe(1);
    const lost = [a, b].find((r) => !r.ok);
    expect(lost && !lost.ok && lost.code).toBe("P0019");
  });

  it("el que llega tarde ve P0019, y el pedido deja de aparecerle", async () => {
    const o = await envio();
    expect((await take(TOQUE_USER, o.id)).ok).toBe(true);
    const late = await take(MOTO_USER, o.id);
    expect(!late.ok && late.code).toBe("P0019");
    expect((await available(MOTO_USER)).some((x) => x.id === o.id)).toBe(false);
  });

  it("un pedido de ofertas no se toma: P0023", async () => {
    await setMode("offers");
    const o = await envio();
    const r = await take(TOQUE_USER, o.id);
    expect(!r.ok && r.code).toBe("P0023");
    expect((await row(o.id)).courier_status).toBe("searching");
  });
});

describe("en precio fijo no hay ofertas — ENVIO-148 y 149", () => {
  it("ofertar, retirar la oferta y elegir dan P0023", async () => {
    const o = await envio();

    const made = await offer(db, TOQUE_USER, o.id);
    expect(!made.ok && made.code).toBe("P0023");

    const wd = await call(TOQUE_USER, `select public.courier_withdraw_offer('${o.id}')`);
    expect(!wd.ok && wd.code).toBe("P0023");

    const fake = "11111111-1111-1111-1111-111111111111";
    const ch = await call(null, `select public.public_choose_courier('${o.code}', '${fake}')`);
    expect(!ch.ok && ch.code).toBe("P0023");
    expect((await row(o.id)).courier_status).toBe("searching");
  });

  it("en ofertas, la elección automática sigue igual y en fixed no toca nada", async () => {
    const fijo = await envio();
    await db.exec(`update orders set offered_at = now() - interval '1 hour' where id = '${fijo.id}'`);
    await db.query("select public.settle_courier_offers($1)", [fijo.id]);
    expect((await row(fijo.id)).courier_status).toBe("searching");
  });

  it("el seguimiento de un pedido fixed trae modo y no trae ofertas ni cuenta regresiva", async () => {
    const o = await envio();
    const d = await delivery(o.code);
    expect(d).toMatchObject({ modo: "fixed", estado: "searching" });
    expect(d.ofertas).toBeUndefined();
    expect(d.cierra_en).toBeUndefined();

    expect((await take(TOQUE_USER, o.id)).ok).toBe(true);
    const after = await delivery(o.code);
    expect(after).toMatchObject({ modo: "fixed", estado: "accepted", repartidor: "Repartos al Toque" });
    expect(Number(after.precio)).toBe(Number(after.precio_lista));
  });

  it("el seguimiento de un pedido de ofertas sigue trayendo la lista", async () => {
    await setMode("offers");
    const o = await envio();
    expect((await offer(db, TOQUE_USER, o.id)).ok).toBe(true);
    const d = await delivery(o.code);
    expect(d.modo).toBe("offers");
    expect(Array.isArray(d.ofertas) && d.ofertas.length).toBe(1);
  });
});

describe("devolver, cancelar, asignar a mano y 'lo llevo yo' en los dos modos — ENVIO-150 y 151", () => {
  for (const mode of ["fixed", "offers"] as const) {
    describe(`modo ${mode}`, () => {
      // El repartidor se queda con el pedido: tomándolo (fixed) o ofertando y eligiendo (offers).
      async function taken() {
        await setMode(mode);
        const o = await envio();
        if (mode === "fixed") {
          expect((await take(TOQUE_USER, o.id)).ok).toBe(true);
        } else {
          expect((await offer(db, TOQUE_USER, o.id)).ok).toBe(true);
          const f = (await db.query<{ id: string }>("select id from courier_offers where order_id = $1", [o.id]))
            .rows[0];
          const c = await call(null, `select public.public_choose_courier('${o.code}', '${f.id}')`);
          expect(c.ok).toBe(true);
        }
        return o;
      }

      it("el que devuelve no lo vuelve a ver y otro repartidor sí, con el mismo modo", async () => {
        const o = await taken();
        const r = await call(TOQUE_USER, `select public.courier_return_order('${o.id}', 'other', 'Se me rompió la moto')`);
        expect(r.ok).toBe(true);

        expect(await row(o.id)).toMatchObject({ courier_status: "searching", courier_id: null, delivery_mode: mode });
        expect((await available(TOQUE_USER)).some((x) => x.id === o.id)).toBe(false);
        expect((await available(MOTO_USER)).some((x) => x.id === o.id)).toBe(true);

        const offers = await db.query("select 1 from courier_offers where order_id = $1 and courier_id = $2", [
          o.id,
          TOQUE,
        ]);
        expect(offers.rows).toHaveLength(0);
      });

      it("cancelar el pedido cierra la búsqueda", async () => {
        await setMode(mode);
        const o = await envio();
        const c = await call(ANA, `select public.set_order_status('${o.id}', 'cancelled')`);
        expect(c.ok).toBe(true);
        expect((await available(TOQUE_USER)).some((x) => x.id === o.id && x.modo)).toBe(false);
        const t = await take(MOTO_USER, o.id);
        expect(t.ok).toBe(false);
      });

      it("el local asigna a mano un repartidor", async () => {
        await setMode(mode);
        const o = await envio();
        const r = await call(ANA, `select public.business_assign_courier('${o.id}', '${MOTO}', 'Por WhatsApp')`);
        expect(r.ok).toBe(true);
        expect(await row(o.id)).toMatchObject({ courier_id: MOTO, courier_status: "accepted" });
      });

      it("'Lo llevo yo' lo saca de la búsqueda", async () => {
        await setMode(mode);
        const o = await envio();
        const r = await call(ANA, `select public.business_self_delivery('${o.id}')`);
        expect(r.ok).toBe(true);
        expect(await row(o.id)).toMatchObject({ courier_id: null, courier_status: "self" });
        const t = await take(TOQUE_USER, o.id);
        expect(t.ok).toBe(false);
      });

      it("a los 10 minutos sin nadie se marca el aviso, una sola vez", async () => {
        await setMode(mode);
        const o = await envio();
        await db.exec(`update orders set offered_at = now() - interval '11 minutes' where id = '${o.id}'`);
        await db.exec("select public.run_order_timers()");
        const a = (await db.query<{ t: Date | null }>(
          "select no_offers_alerted_at as t from orders where id = $1",
          [o.id],
        )).rows[0].t;
        expect(a).not.toBeNull();
      });
    });
  }
});

describe("los pedidos abiertos al migrar quedan en ofertas — ENVIO-146", () => {
  it("la migración los marca offers", async () => {
    const old = await createTestDb({ before: "20261104000000" });
    await createUser(old, { id: ANA, email: "ana@x.com" });
    await old.exec(`
      insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
        ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
      insert into orders (id, business_id, order_number, code, customer_name, delivery, payment, total,
                          status, courier_status, offered_at)
      values ('a0a0a0a0-0000-0000-0000-000000000001', '${NEG_ANA}', 1, 'aaaaaaaaaaaaaaaaaaaa', 'Cli',
              'delivery', 'efectivo', 1000, 'pending', 'searching', now());
    `);
    const { applyMigration } = await import("@/test/db");
    await applyMigration(old, "20261104000000_modo_de_envios.sql");
    const r = await old.query<{ delivery_mode: string }>("select delivery_mode from orders");
    expect(r.rows).toEqual([{ delivery_mode: "offers" }]);
    await old.close();
  }, 60_000);
});
