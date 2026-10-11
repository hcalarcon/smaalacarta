// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { choose, offer } from "@/test/offers";

// ADMIN-PWA-1 a 8 contra Postgres real: suscripciones push y tareas por tiempo.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña de un negocio con envío
const BETO = "bbbbbbbb-0000-0000-0000-000000000002"; // repartidor
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006"; // otro repartidor
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const TOQUE = "7a0c0e00-0000-4000-8000-000000000001";
const CAFE = "d1000000-0000-0000-0000-000000000001";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const code = (r: Awaited<ReturnType<typeof call>>) => (r.ok ? null : r.code);

const save = (user: string | null, endpoint = ENDPOINT, p256dh = "p256", auth = "auth", ua: string | null = "UA") =>
  call(
    user,
    `select public.save_push_subscription('${endpoint}', '${p256dh}', '${auth}', ${ua === null ? "null" : `'${ua}'`})`,
  );

const subs = async () =>
  (await db.query<{ user_id: string; endpoint: string }>("select user_id, endpoint from push_subscriptions order by endpoint"))
    .rows;

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

// Un pedido con envío de Ana en Cantera, ya buscando.
async function envio() {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null,
       '${items}'::jsonb, p_delivery_zone => '${await zoneId("Cantera")}'::uuid,
       p_customer_phone => '351 555-1234', p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const c = (r.rows[0].result as { code: string }).code;
  const id = (await db.query<{ id: string }>("select id from orders where code = $1", [c])).rows[0].id;
  return { id, code: c };
}

const orderRow = async (id: string) =>
  (
    await db.query<{ courier_status: string; courier_id: string | null; no_offers_alerted_at: Date | null }>(
      "select courier_status, courier_id, no_offers_alerted_at from orders where id = $1",
      [id],
    )
  ).rows[0];

// Pasan `minutes` minutos: la búsqueda y las ofertas quedan más viejas.
async function age(orderId: string, minutes: number) {
  await db.exec(`
    update courier_offers set created_at = created_at - interval '${minutes} minutes' where order_id = '${orderId}';
    update orders set offered_at = offered_at - interval '${minutes} minutes' where id = '${orderId}';
  `);
}

const runTimers = () => db.exec("select public.run_order_timers()");

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published, address) values ('${NEG_ANA}', true, 'San Martín 100');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);

    insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${BETO}');
    insert into couriers (id, name, whatsapp, active) values
      ('7a0c0e00-0000-4000-8000-000000000002', 'Moto Express', '5493510000099', true);
    insert into courier_users (courier_id, user_id) values ('7a0c0e00-0000-4000-8000-000000000002', '${MOTO_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select '7a0c0e00-0000-4000-8000-000000000002', id from delivery_zones where name = 'Cantera';
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera');
  `);
}, 60_000);

// El freno de 20 pedidos por minuto.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await db.exec("delete from push_subscriptions");
});

afterAll(async () => {
  await db.close();
});

describe("suscripciones push — ADMIN-PWA-1 a 4", () => {
  it("cada usuario ve y borra solo lo suyo, y anon no puede nada (ADMIN-PWA-1)", async () => {
    expect((await save(ANA, "https://push.example/ana")).ok).toBe(true);
    expect((await save(BETO, "https://push.example/beto")).ok).toBe(true);

    const count = async (user: string | null) => {
      const r = await call(user, "select count(*) n from push_subscriptions");
      return r.ok ? Number(r.rows[0].n) : -1;
    };
    expect(await count(ANA)).toBe(1);
    expect(await count(BETO)).toBe(1);
    expect(await count(null)).toBe(0);

    // Borrar "todo" como Ana solo se lleva la suya.
    const del = await call(ANA, "delete from push_subscriptions");
    expect(del.ok && del.affected).toBe(1);
    expect((await subs()).map((s) => s.user_id)).toEqual([BETO]);

    // anon no borra nada.
    const anon = await call(null, "delete from push_subscriptions");
    expect(anon.ok && anon.affected).toBe(0);
    expect(await subs()).toHaveLength(1);
  });

  it("no hay insert ni update directos (ADMIN-PWA-1)", async () => {
    const insert = await call(
      ANA,
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ('${ANA}', 'https://push.example/directo', 'p', 'a')`,
    );
    expect(insert.ok).toBe(false);

    await save(ANA, "https://push.example/ana");
    const update = await call(ANA, "update push_subscriptions set p256dh = 'otra'");
    expect(update.ok && update.affected).toBe(0);
  });

  it("guarda la del usuario y el mismo endpoint pasa a la cuenta nueva (ADMIN-PWA-2)", async () => {
    await save(ANA);
    expect(await subs()).toEqual([{ user_id: ANA, endpoint: ENDPOINT }]);

    await save(BETO, ENDPOINT, "otra-clave", "otro-auth");
    const rows = await db.query<{ user_id: string; p256dh: string; auth: string }>(
      "select user_id, p256dh, auth from push_subscriptions",
    );
    expect(rows.rows).toEqual([{ user_id: BETO, p256dh: "otra-clave", auth: "otro-auth" }]);

    // Guardar dos veces lo mismo no duplica.
    await save(BETO, ENDPOINT, "otra-clave", "otro-auth");
    expect(await subs()).toHaveLength(1);
  });

  it("rechaza sin sesión, endpoints que no son https y datos vacíos (ADMIN-PWA-3)", async () => {
    const anon = await save(null);
    expect(anon.ok).toBe(false);

    const http = await save(ANA, "http://push.example/x");
    expect(http.ok).toBe(false);
    expect(code(http)).toBe("22023");

    expect(code(await save(ANA, "https://push.example/x", "", "auth"))).toBe("22023");
    expect(code(await save(ANA, "https://push.example/x", "p", "   "))).toBe("22023");
    expect(code(await save(ANA, ""))).toBe("22023");
    expect(await subs()).toHaveLength(0);
  });

  it("borra la propia y nunca la de otro (ADMIN-PWA-4)", async () => {
    await save(ANA, "https://push.example/ana");
    await save(BETO, "https://push.example/beto");

    // Beto pide borrar la de Ana: no pasa nada.
    await call(BETO, "select public.delete_push_subscription('https://push.example/ana')");
    expect(await subs()).toHaveLength(2);

    await call(ANA, "select public.delete_push_subscription('https://push.example/ana')");
    expect((await subs()).map((s) => s.user_id)).toEqual([BETO]);

    // Sin sesión no puede llamarla.
    const anon = await call(null, "select public.delete_push_subscription('https://push.example/beto')");
    expect(anon.ok).toBe(false);
    expect(await subs()).toHaveLength(1);
  });
});

describe("tareas por tiempo — ADMIN-PWA-5 a 8", () => {
  it("elige sola la oferta vencida aunque nadie mire el pedido (ADMIN-PWA-5)", async () => {
    const o = await envio();
    expect((await offer(db, BETO, o.id, 6000, "Llueve")).ok).toBe(true);
    expect((await offer(db, MOTO_USER, o.id)).ok).toBe(true);

    // Antes de los 5 minutos no pasa nada.
    await runTimers();
    expect((await orderRow(o.id)).courier_status).toBe("searching");

    await age(o.id, 6);
    await runTimers();

    const row = await orderRow(o.id);
    expect(row.courier_status).toBe("accepted");
    // Gana la más barata: la de lista de Moto Express ($5000) contra los $6000 de Toque.
    expect(row.courier_id).toBe("7a0c0e00-0000-4000-8000-000000000002");
  });

  it("marca una sola vez el pedido sin ofertas con más de 10 minutos (ADMIN-PWA-6)", async () => {
    const sinOfertas = await envio();
    const conOfertas = await envio();
    const reciente = await envio();
    const sinPagar = await envio();
    await offer(db, BETO, conOfertas.id);

    await age(sinOfertas.id, 11);
    await age(conOfertas.id, 11);
    await age(reciente.id, 9);
    await age(sinPagar.id, 11);
    await db.exec(`update orders set payment_status = 'awaiting' where id = '${sinPagar.id}'`);

    await runTimers();

    const first = (await orderRow(sinOfertas.id)).no_offers_alerted_at;
    expect(first).not.toBeNull();
    expect((await orderRow(conOfertas.id)).no_offers_alerted_at).toBeNull();
    expect((await orderRow(reciente.id)).no_offers_alerted_at).toBeNull();
    expect((await orderRow(sinPagar.id)).no_offers_alerted_at).toBeNull();

    // Otra vuelta no la vuelve a marcar: el aviso sale una sola vez.
    await runTimers();
    expect((await orderRow(sinOfertas.id)).no_offers_alerted_at).toEqual(first);
  });

  it("no marca un pedido cancelado ni uno que no es de envío (ADMIN-PWA-6)", async () => {
    const cancelado = await envio();
    await age(cancelado.id, 11);
    await db.exec(`update orders set status = 'cancelled' where id = '${cancelado.id}'`);

    const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
    const retiro = await call(
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null, '${items}'::jsonb,
         p_customer_phone => '351 555-1234') as result`,
    );
    if (!retiro.ok) throw new Error(retiro.error);
    await db.exec("update orders set created_at = created_at - interval '11 minutes', offered_at = created_at");

    await runTimers();

    expect((await orderRow(cancelado.id)).no_offers_alerted_at).toBeNull();
    const marked = await db.query("select 1 from orders where delivery_zone_id is null and no_offers_alerted_at is not null");
    expect(marked.rows).toHaveLength(0);
  });

  it("al volver a buscar por una devolución se limpia la marca (ADMIN-PWA-7)", async () => {
    const o = await envio();
    await offer(db, BETO, o.id);
    await choose(db, BETO, o.id);
    expect((await orderRow(o.id)).courier_status).toBe("accepted");

    // Hubo una marca vieja (p. ej. de antes de que alguien ofertara).
    await db.exec(`update orders set no_offers_alerted_at = now() where id = '${o.id}'`);

    const returned = await call(BETO, `select public.courier_return_order('${o.id}', 'Se me pinchó la moto')`);
    expect(returned.ok).toBe(true);

    const row = await orderRow(o.id);
    expect(row.courier_status).toBe("searching");
    expect(row.no_offers_alerted_at).toBeNull();
  });

  it("anon y authenticated no pueden llamarla (ADMIN-PWA-8)", async () => {
    for (const user of [null, ANA, BETO]) {
      const r = await call(user, "select public.run_order_timers()");
      expect(r.ok).toBe(false);
      expect(code(r)).toBe("42501");
    }
  });

  it("la migración la programa cada minuto solo si existe pg_cron (ADMIN-PWA-8)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261025000000_avisos_push.sql"), "utf8");

    expect(sql).toMatch(/extname\s*=\s*'pg_cron'/);
    expect(sql).toMatch(/cron\.schedule\(\s*'order-timers',\s*'\* \* \* \* \*'/);
  });
});
