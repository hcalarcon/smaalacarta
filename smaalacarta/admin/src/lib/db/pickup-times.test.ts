// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { choose, offer } from "@/test/offers";

// ENVIO-155 a 162 contra Postgres real: el circuito de tiempos (demora del local, aviso para retirar y los
// dos tiempos de llegada del repartidor).
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const TOQUE_USER = "cccccccc-0000-0000-0000-000000000003";
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
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

async function envio(options: { scheduled?: boolean } = {}) {
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
  // La hora de un programado se fija a mano: elegirla por la función depende del horario del negocio.
  if (options.scheduled) {
    await db.exec(`update orders set scheduled_for = now() + interval '3 hours' where id = '${o.id}'`);
  }
  return { id: o.id, code };
}

const confirm = (id: string) => call(ANA, `select public.set_order_status('${id}', 'confirmed')`);
const prep = (id: string, minutes: number) => call(ANA, `select public.set_order_prep('${id}', ${minutes}, null)`);
const take = (user: string, id: string) => call(user, `select public.courier_take_order('${id}')`);
const eta = (user: string | null, id: string, kind: string, minutes: number | null) =>
  call(user, `select public.courier_set_eta('${id}', '${kind}', ${minutes === null ? "null" : minutes})`);
const timers = () => db.exec("select public.run_order_timers()");

async function row(id: string) {
  return (
    await db.query<Record<string, string | number | null>>(
      `select status, courier_id, courier_status, offered_at, prep_ready_at, pickup_reminder_sent_at,
              ready_was_at, courier_eta_pickup_at, courier_eta_dropoff_at
       from orders where id = $1`,
      [id],
    )
  ).rows[0];
}

async function available(user: string) {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].l as { id: string; listo_a: string | null; demora_min: number | null }[];
}

async function delivery(code: string) {
  const r = await call(null, `select public.public_order_delivery('${code}') as d`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].d as Record<string, unknown>;
}

const minutesFromNow = (value: string | number | Date | null) =>
  (new Date(value as string).getTime() - Date.now()) / 60_000;

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed" });

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: TOQUE_USER, email: "toque@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_BETO}', 'Beto Resto', 'beto', '5493510000002', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published, address, show_prep_time, default_prep_minutes) values
      ('${NEG_ANA}', true, 'San Martín 100', true, 25),
      ('${NEG_BETO}', true, 'Belgrano 200', false, 20);
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

beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await setMode("fixed");
});

afterAll(async () => {
  await db.close();
});

describe("la búsqueda se abre al confirmar — ENVIO-155", () => {
  for (const mode of ["fixed", "offers"] as const) {
    it(`en ${mode} no se ve ni se toma en pendiente, y aparece al confirmar`, async () => {
      await setMode(mode);
      const o = await envio();

      expect((await row(o.id)).courier_status).toBe("waiting");
      expect((await row(o.id)).offered_at).toBeNull();
      expect((await available(MOTO_USER)).map((x) => x.id)).not.toContain(o.id);
      const early = mode === "fixed" ? await take(MOTO_USER, o.id) : await offer(db, MOTO_USER, o.id);
      expect(early.ok).toBe(false);

      const c = await confirm(o.id);
      expect(c.ok).toBe(true);
      expect((await row(o.id)).courier_status).toBe("searching");
      expect((await row(o.id)).offered_at).not.toBeNull();
      expect((await available(MOTO_USER)).map((x) => x.id)).toContain(o.id);
    });
  }

  it("un programado también espera al local", async () => {
    const o = await envio({ scheduled: true });
    expect((await row(o.id)).courier_status).toBe("waiting");
    await confirm(o.id);
    expect((await row(o.id)).courier_status).toBe("searching");
  });

  it("el aviso de 'nadie ofertó' cuenta desde que se abre la búsqueda", async () => {
    const o = await envio();
    await db.exec(`update orders set created_at = now() - interval '30 minutes' where id = '${o.id}'`);
    await timers();
    expect((await db.query("select no_offers_alerted_at from orders where id = $1", [o.id])).rows[0]).toEqual({
      no_offers_alerted_at: null,
    });

    await confirm(o.id);
    await timers();
    expect((await db.query("select no_offers_alerted_at from orders where id = $1", [o.id])).rows[0]).toEqual({
      no_offers_alerted_at: null,
    });

    await db.exec(`update orders set offered_at = now() - interval '11 minutes' where id = '${o.id}'`);
    await timers();
    const after = (await db.query<{ n: string | null }>(
      "select no_offers_alerted_at as n from orders where id = $1",
      [o.id],
    )).rows[0];
    expect(after.n).not.toBeNull();
  });

  it("un pedido manual con envío nace confirmado y ya busca", async () => {
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
    const found = (await db.query<{ id: string; courier_status: string; status: string }>(
      "select id, courier_status, status from orders where source = 'manual' order by created_at desc limit 1",
    )).rows[0];
    expect(found.status).toBe("confirmed");
    expect(found.courier_status).toBe("searching");
    expect((await available(MOTO_USER)).map((x) => x.id)).toContain(found.id);
  });
});

describe("el repartidor ve la demora antes de tomar — ENVIO-156", () => {
  it("con la demora que cargó el local", async () => {
    const o = await envio();
    await confirm(o.id);
    await prep(o.id, 30);

    const item = (await available(MOTO_USER)).find((x) => x.id === o.id)!;
    expect(item.demora_min).toBe(30);
    expect(minutesFromNow(item.listo_a)).toBeGreaterThan(29);
    expect(minutesFromNow(item.listo_a)).toBeLessThan(31);
  });

  it("sin demora cargada usa el tiempo por defecto del negocio", async () => {
    const o = await envio();
    await confirm(o.id);

    const item = (await available(MOTO_USER)).find((x) => x.id === o.id)!;
    expect(item.demora_min).toBe(25);
    expect(minutesFromNow(item.listo_a)).toBeGreaterThan(24);
    expect(minutesFromNow(item.listo_a)).toBeLessThan(26);
    // La estimación no se guarda: el cliente no ve una hora que el local no marcó.
    expect((await row(o.id)).prep_ready_at).toBeNull();
  });

  it("un programado muestra su hora y sin demora", async () => {
    const o = await envio({ scheduled: true });
    await confirm(o.id);
    const item = (await available(MOTO_USER)).find((x) => x.id === o.id)!;
    expect(item.demora_min).toBeNull();
    expect(minutesFromNow(item.listo_a)).toBeGreaterThan(170);
  });
});

describe("los dos tiempos del repartidor — ENVIO-157", () => {
  async function taken() {
    const o = await envio();
    await confirm(o.id);
    await prep(o.id, 30);
    const t = await take(MOTO_USER, o.id);
    if (!t.ok) throw new Error(t.error);
    return o;
  }

  it("el repartidor del pedido carga 'llego al local'", async () => {
    const o = await taken();
    const r = await eta(MOTO_USER, o.id, "pickup", 10);
    expect(r.ok).toBe(true);
    const m = minutesFromNow((await row(o.id)).courier_eta_pickup_at);
    expect(m).toBeGreaterThan(9);
    expect(m).toBeLessThan(11);
  });

  it("el rango es de 1 a 120", async () => {
    const o = await taken();
    for (const bad of [0, -5, 121, null]) {
      const r = await eta(MOTO_USER, o.id, "pickup", bad);
      expect(!r.ok && r.code).toBe("22023");
    }
    expect((await eta(MOTO_USER, o.id, "pickup", 1)).ok).toBe(true);
    expect((await eta(MOTO_USER, o.id, "pickup", 120)).ok).toBe(true);
    const kind = await eta(MOTO_USER, o.id, "otra", 10);
    expect(!kind.ok && kind.code).toBe("22023");
  });

  it("solo el repartidor del pedido: otro, el local y el cliente no", async () => {
    const o = await taken();
    const other = await eta(TOQUE_USER, o.id, "pickup", 10);
    expect(!other.ok && other.code).toBe("P0002");
    const local = await eta(ANA, o.id, "pickup", 10);
    expect(!local.ok && local.code).toBe("42501");
    const anon = await eta(null, o.id, "pickup", 10);
    expect(anon.ok).toBe(false);
    expect((await row(o.id)).courier_eta_pickup_at).toBeNull();
  });

  it("'llego al cliente' solo después de retirar", async () => {
    const o = await taken();
    const early = await eta(MOTO_USER, o.id, "dropoff", 15);
    expect(!early.ok && early.code).toBe("P0004");

    await db.exec(`update orders set status = 'handed_to_courier' where id = '${o.id}'`);
    expect((await eta(MOTO_USER, o.id, "dropoff", 15)).ok).toBe(true);
    expect((await row(o.id)).courier_eta_dropoff_at).not.toBeNull();
  });

  it("devolver el pedido borra los tiempos", async () => {
    const o = await taken();
    await eta(MOTO_USER, o.id, "pickup", 10);
    const r = await call(MOTO_USER, `select public.courier_return_order('${o.id}', 'Cambió la demora')`);
    expect(r.ok).toBe(true);
    const after = await row(o.id);
    expect(after.courier_eta_pickup_at).toBeNull();
    expect(after.courier_id).toBeNull();
    expect(after.courier_status).toBe("searching");
    // Le vuelve a aparecer a los otros repartidores, no a quien lo devolvió.
    expect((await available(TOQUE_USER)).map((x) => x.id)).toContain(o.id);
    expect((await available(MOTO_USER)).map((x) => x.id)).not.toContain(o.id);
  });

  it("si lo devuelve después de un cambio de demora, el pedido vuelve marcado (ENVIO-159 y 164)", async () => {
    const o = await taken();
    await prep(o.id, 50);
    expect((await row(o.id)).ready_was_at).not.toBeNull();

    await call(MOTO_USER, `select public.courier_return_order('${o.id}', 'No me sirve la hora')`);
    const flag = async () =>
      (await db.query<{ f: boolean }>("select returned_prep_changed as f from orders where id = $1", [o.id])).rows[0].f;
    expect(await flag()).toBe(true);

    // Lo toma otro repartidor: la marca se limpia.
    await take(TOQUE_USER, o.id);
    expect(await flag()).toBe(false);
  });

  it("una devolución sin cambio de demora no lleva la marca", async () => {
    const o = await taken();
    await call(MOTO_USER, `select public.courier_return_order('${o.id}', 'Se me pinchó la moto')`);
    const r = await db.query<{ f: boolean }>("select returned_prep_changed as f from orders where id = $1", [o.id]);
    expect(r.rows[0].f).toBe(false);
  });

  it("en ofertas, al ser elegido el repartidor también lo carga", async () => {
    await setMode("offers");
    const o = await envio();
    await confirm(o.id);
    expect((await offer(db, MOTO_USER, o.id)).ok).toBe(true);
    expect((await choose(db, MOTO_USER, o.id)).ok).toBe(true);
    expect((await eta(MOTO_USER, o.id, "pickup", 15)).ok).toBe(true);
  });
});

describe("el aviso para ir a retirar — ENVIO-158 y 159", () => {
  async function taken(minutes: number) {
    const o = await envio();
    await confirm(o.id);
    await prep(o.id, minutes);
    const t = await take(MOTO_USER, o.id);
    if (!t.ok) throw new Error(t.error);
    return o;
  }

  it("no avisa mientras falta más de 10 minutos", async () => {
    const o = await taken(60);
    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).toBeNull();
  });

  it("avisa una sola vez cuando faltan 10 minutos o menos", async () => {
    const o = await taken(60);
    await db.exec(`update orders set prep_ready_at = now() + interval '8 minutes' where id = '${o.id}'`);
    // El UPDATE directo ya cuenta como cambio de demora: el aviso empieza sin enviar.
    expect((await row(o.id)).pickup_reminder_sent_at).toBeNull();

    await timers();
    const first = (await row(o.id)).pickup_reminder_sent_at;
    expect(first).not.toBeNull();

    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).toEqual(first);
  });

  it("sin repartidor no avisa", async () => {
    const o = await envio();
    await confirm(o.id);
    await prep(o.id, 5);
    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).toBeNull();
  });

  it("si el local cambia la demora, el aviso se rearma y queda la hora anterior", async () => {
    const o = await taken(60);
    await db.exec(`update orders set prep_ready_at = now() + interval '8 minutes' where id = '${o.id}'`);
    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).not.toBeNull();
    const before = (await row(o.id)).prep_ready_at;

    const r = await prep(o.id, 45);
    expect(r.ok).toBe(true);
    const changed = await row(o.id);
    expect(changed.pickup_reminder_sent_at).toBeNull();
    expect(new Date(changed.ready_was_at as string).getTime()).toBe(new Date(before as string).getTime());

    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).toBeNull();

    await db.exec(`update orders set prep_ready_at = now() + interval '9 minutes' where id = '${o.id}'`);
    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).not.toBeNull();
  });

  it("queda el evento del cambio de demora", async () => {
    const o = await taken(30);
    await prep(o.id, 50);
    const events = (await db.query<{ note: string }>(
      "select note from order_events where order_id = $1 and kind = 'prep' order by created_at, id",
      [o.id],
    )).rows;
    expect(events.at(-1)?.note).toContain("50");
  });

  it("un pedido ya listo no recibe el aviso previo", async () => {
    const o = await taken(60);
    await db.exec(`update orders set status = 'ready', prep_ready_at = now() + interval '5 minutes' where id = '${o.id}'`);
    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).toBeNull();
  });

  it("quien toma un pedido a minutos de estar listo lo recibe en el siguiente minuto, pero no otro repartidor", async () => {
    const o = await envio();
    await confirm(o.id);
    await prep(o.id, 5);
    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).toBeNull();
    await take(MOTO_USER, o.id);
    await timers();
    expect((await row(o.id)).pickup_reminder_sent_at).not.toBeNull();
  });
});

describe("el cliente ve cuándo llega — ENVIO-161", () => {
  it("trae llega_a una vez retirado, sin datos nuevos del repartidor", async () => {
    const o = await envio();
    await confirm(o.id);
    await take(MOTO_USER, o.id);
    expect(await delivery(o.code)).not.toHaveProperty("llega_a");

    await db.exec(`update orders set status = 'handed_to_courier' where id = '${o.id}'`);
    await eta(MOTO_USER, o.id, "dropoff", 15);

    const d = await delivery(o.code);
    expect(d).toHaveProperty("llega_a");
    expect(minutesFromNow(d.llega_a as string)).toBeGreaterThan(14);
    expect(Object.keys(d).sort()).toEqual(
      ["estado", "llega_a", "modo", "precio", "precio_lista", "repartidor", "whatsapp", "zona"].sort(),
    );
  });

  it("el tiempo al local no se le muestra al cliente", async () => {
    const o = await envio();
    await confirm(o.id);
    await take(MOTO_USER, o.id);
    await eta(MOTO_USER, o.id, "pickup", 10);
    expect(JSON.stringify(await delivery(o.code))).not.toContain("pickup");
    expect(await delivery(o.code)).not.toHaveProperty("llega_a");
  });
});

describe("el local no escribe los tiempos del circuito — ENVIO-162", () => {
  it.each([
    ["courier_eta_pickup_at", "now()"],
    ["courier_eta_dropoff_at", "now()"],
    ["pickup_reminder_sent_at", "now()"],
    ["ready_was_at", "now()"],
    ["returned_prep_changed", "true"],
  ])("%s", async (column, value) => {
    const o = await envio();
    const r = await call(ANA, `update orders set ${column} = ${value} where id = '${o.id}'`);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("42501");
  });
});
