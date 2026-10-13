// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ADMIN-PEDIDOS-37 y 38, ADMIN-CONFIG-49 y 50 y SEGUIMIENTO-37 contra Postgres real: tiempo de preparación
// estimado por el local.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const CARLA = "cccccccc-0000-0000-0000-000000000003";
const DANI = "dddddddd-0000-0000-0000-000000000004";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001"; // muestra el tiempo al cliente
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002"; // lo deja apagado (por defecto)
const NEG_CARLA = "c3c3c3c3-0000-0000-0000-000000000003"; // para la sugerencia
const NEG_DANI = "d4d4d4d4-0000-0000-0000-000000000004"; // para los últimos 20
const CAT_ANA = "c1000000-0000-0000-0000-000000000001";
const CAT_BETO = "c2000000-0000-0000-0000-000000000001";
const HAMB = "d1000000-0000-0000-0000-000000000001";
const FERNET = "d2000000-0000-0000-0000-000000000001";

let db: TestDb;

async function place(slug: string, product: string) {
  const items = JSON.stringify([{ id: product, kind: "product", quantity: 1 }]);
  const r = await asUser(
    db,
    null,
    `select public.create_public_order('${slug}', 'Cliente', 'retiro', 'efectivo', null, '${items}'::jsonb,
       p_customer_phone => '3515551234') as result`,
  );
  if (!r.ok) throw new Error(r.error);
  const { code } = r.rows[0].result as { code: string };
  const row = await db.query<{ id: string }>(`select id from orders where code = '${code}'`);
  return { code, id: row.rows[0].id };
}

async function setStatus(user: string, id: string, status: string) {
  const r = await asUser(db, user, `select public.set_order_status('${id}', '${status}')`);
  if (!r.ok) throw new Error(r.error);
}

async function prep(user: string | null, id: string, minutes: unknown, reason: string | null = null) {
  return asUser(
    db,
    user,
    `select public.set_order_prep('${id}', ${minutes === null ? "null" : minutes}, ${
      reason === null ? "null" : `'${reason}'`
    }) as r`,
  );
}

async function tracking(code: string) {
  const r = await asUser(db, null, `select public.public_order_tracking('${code}') as t`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].t as {
    pedido: { prep?: { desde: string; hasta: string; actualizado: string; motivo?: string } };
    eventos: { estado: string }[];
  };
}

async function readyIn(id: string) {
  const r = await db.query<{ m: number }>(
    `select extract(epoch from prep_ready_at - now()) / 60 as m from orders where id = '${id}'`,
  );
  return Number(r.rows[0].m);
}

// Crea pedidos manuales ya terminados: Confirmado y Listo con `minutes[i]` de diferencia, el último
// el más reciente. Los eventos se escriben a mano para controlar los tiempos.
async function seedFinished(business: string, user: string, minutes: number[], olderBy = 0) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false)`);

  for (const [index, m] of minutes.entries()) {
    const created = await db.query<{ id: string }>(
      `select (public.create_manual_order('${business}', 'Mostrador', 'retiro', 'efectivo', null,
         '[{"name":"Pizza","unit_price":100,"quantity":1}]'::jsonb) ->> 'id') as id`,
    );
    const id = created.rows[0].id;
    const readyAgo = olderBy + (minutes.length - index) * 4 + 1;

    await db.exec(`
      delete from order_events where order_id = '${id}';
      update orders set status = 'delivered' where id = '${id}';
      insert into order_events (order_id, business_id, status, created_at) values
        ('${id}', '${business}', 'confirmed', now() - interval '${readyAgo + m} minutes'),
        ('${id}', '${business}', 'ready', now() - interval '${readyAgo} minutes');
    `);
  }
}

async function suggested(user: string | null, business: string) {
  const r = await asUser(db, user, `select public.suggested_prep_minutes('${business}') as s`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].s as number | null;
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: CARLA, email: "carla@x.com" });
  await createUser(db, { id: DANI, email: "dani@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true),
      ('${NEG_CARLA}', 'Carla Café', 'carla', '5493510000003', true),
      ('${NEG_DANI}', 'Dani Dulces', 'dani', '5493510000004', true);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}'), ('${NEG_CARLA}', '${CARLA}'), ('${NEG_DANI}', '${DANI}');
    insert into business_settings (business_id, published, show_prep_time) values
      ('${NEG_ANA}', true, true);
    insert into business_settings (business_id, published) values
      ('${NEG_BETO}', true), ('${NEG_CARLA}', true), ('${NEG_DANI}', true);
    insert into categories (id, business_id, name) values
      ('${CAT_ANA}', '${NEG_ANA}', 'Comidas'), ('${CAT_BETO}', '${NEG_BETO}', 'Tragos');
    insert into products (id, business_id, category_id, name, price) values
      ('${HAMB}', '${NEG_ANA}', '${CAT_ANA}', 'Hamburguesa', 1000),
      ('${FERNET}', '${NEG_BETO}', '${CAT_BETO}', 'Fernet', 2500);
  `);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("set_order_prep — ADMIN-PEDIDOS-37", () => {
  it("fija la hora en ahora + minutos, el motivo y deja un evento aparte de la línea de tiempo", async () => {
    const { id } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");

    const r = await prep(ANA, id, 25);
    expect(r.ok ? "ok" : r.error).toBe("ok");
    expect(await readyIn(id)).toBeGreaterThan(24);
    expect(await readyIn(id)).toBeLessThanOrEqual(25);

    const again = await prep(ANA, id, 35, "busy");
    expect(again.ok).toBe(true);

    const row = await db.query<{ prep_reason: string; prep_updated_at: string | null }>(
      `select prep_reason, prep_updated_at from orders where id = '${id}'`,
    );
    expect(row.rows[0].prep_reason).toBe("busy");
    expect(row.rows[0].prep_updated_at).not.toBeNull();

    const events = await db.query<{ kind: string; status: string; note: string | null }>(
      `select kind, status, note from order_events where order_id = '${id}' and kind = 'prep' order by created_at, id`,
    );
    expect(events.rows).toHaveLength(2);
    expect(events.rows[1].status).toBe("confirmed");
    expect(events.rows[1].note).toContain("35");
  });

  it("acepta 5 y 180 y rechaza lo que queda afuera del rango o no es un número", async () => {
    const { id } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");

    expect((await prep(ANA, id, 5)).ok).toBe(true);
    expect((await prep(ANA, id, 180)).ok).toBe(true);

    for (const bad of [4, 181, 0, -10]) {
      const r = await prep(ANA, id, bad);
      expect(r.ok, `${bad} min`).toBe(false);
    }
    expect((await prep(ANA, id, null)).ok).toBe(false);
  });

  it("rechaza un motivo que no es uno de los cuatro", async () => {
    const { id } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");

    expect((await prep(ANA, id, 20, "lluvia")).ok).toBe(false);
    for (const reason of ["busy", "weather", "supply", "other"]) {
      expect((await prep(ANA, id, 20, reason)).ok, reason).toBe(true);
    }
  });

  it("solo en Confirmado o En preparación", async () => {
    const { id } = await place("ana", HAMB);

    expect((await prep(ANA, id, 20)).ok, "pendiente").toBe(false);

    await setStatus(ANA, id, "confirmed");
    expect((await prep(ANA, id, 20)).ok, "confirmado").toBe(true);

    await setStatus(ANA, id, "preparing");
    expect((await prep(ANA, id, 20)).ok, "en preparación").toBe(true);

    await setStatus(ANA, id, "ready");
    expect((await prep(ANA, id, 20)).ok, "listo").toBe(false);
  });

  it("no aplica a pedidos programados ni anticipados", async () => {
    const programado = await place("ana", HAMB);
    await setStatus(ANA, programado.id, "confirmed");
    await db.exec(`update orders set scheduled_for = now() + interval '3 hours' where id = '${programado.id}'`);
    expect((await prep(ANA, programado.id, 20)).ok).toBe(false);

    const anticipado = await place("ana", HAMB);
    await setStatus(ANA, anticipado.id, "confirmed");
    await db.exec(`update orders set preorder = true where id = '${anticipado.id}'`);
    expect((await prep(ANA, anticipado.id, 20)).ok).toBe(false);
  });

  it("otro negocio no puede cargar el tiempo de un pedido ajeno, ni un visitante sin sesión", async () => {
    const { id } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");

    const ajeno = await prep(BETO, id, 20);
    expect(ajeno.ok).toBe(false);

    const anon = await prep(null, id, 20);
    expect(anon.ok).toBe(false);

    const row = await db.query<{ prep_ready_at: string | null }>(
      `select prep_ready_at from orders where id = '${id}'`,
    );
    expect(row.rows[0].prep_ready_at).toBeNull();
  });

  it("un negocio suspendido no puede cambiarlo", async () => {
    const { id } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");

    await db.exec(`update businesses set active = false where id = '${NEG_ANA}'`);
    try {
      const r = await prep(ANA, id, 20);
      expect(r.ok).toBe(false);
    } finally {
      await db.exec(`update businesses set active = true where id = '${NEG_ANA}'`);
    }

    expect((await prep(ANA, id, 20)).ok).toBe(true);
  });
});

describe("suggested_prep_minutes — ADMIN-PEDIDOS-38", () => {
  it("con menos de 5 muestras no sugiere nada", async () => {
    await seedFinished(NEG_CARLA, CARLA, [10, 20, 30, 40]);
    expect(await suggested(CARLA, NEG_CARLA)).toBeNull();
  });

  it("con 5 o más es la mediana, y descarta lo que tardó más de 3 horas", async () => {
    await seedFinished(NEG_CARLA, CARLA, [50, 240]);
    // 10, 20, 30, 40, 50 (el de 240 min no cuenta) → mediana 30.
    expect(await suggested(CARLA, NEG_CARLA)).toBe(30);
  });

  it("usa solo los últimos 20 pedidos", async () => {
    // 21 viejos de 100 min: si contaran, la mediana sería 100. Los últimos 20 son de 10 min.
    await seedFinished(NEG_DANI, DANI, Array.from({ length: 21 }, () => 100), 1000);
    await seedFinished(NEG_DANI, DANI, Array.from({ length: 20 }, () => 10));
    expect(await suggested(DANI, NEG_DANI)).toBe(10);
  });

  it("no mira los pedidos de otro negocio ni responde a quien no es del negocio", async () => {
    expect(await suggested(ANA, NEG_CARLA)).toBeNull();
    const anon = await asUser(db, null, `select public.suggested_prep_minutes('${NEG_CARLA}')`);
    expect(anon.ok).toBe(false);
    expect(await suggested(ANA, NEG_ANA)).toBeNull();
  });
});

describe("el seguimiento — SEGUIMIENTO-37", () => {
  it("con el interruptor encendido entrega la ventana de 10 minutos y el motivo", async () => {
    const { id, code } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");

    expect((await tracking(code)).pedido).not.toHaveProperty("prep");

    await prep(ANA, id, 30, "weather");
    const { pedido, eventos } = await tracking(code);

    expect(pedido.prep).toBeDefined();
    const desde = new Date(pedido.prep!.desde).getTime();
    const hasta = new Date(pedido.prep!.hasta).getTime();
    expect(hasta - desde).toBe(10 * 60_000);
    expect(pedido.prep!.motivo).toBe("weather");
    expect(pedido.prep!.actualizado).toBeTruthy();
    // Un evento de tiempo no es un paso de la línea de tiempo.
    expect(eventos.map((e) => e.estado)).toEqual(["pending", "confirmed"]);
  });

  it("con el interruptor apagado no entrega nada, aunque el local haya cargado el tiempo", async () => {
    const { id, code } = await place("beto", FERNET);
    await setStatus(BETO, id, "confirmed");
    await prep(BETO, id, 30);

    expect((await tracking(code)).pedido).not.toHaveProperty("prep");
  });

  it("deja de entregarlo cuando el pedido está listo", async () => {
    const { id, code } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");
    await prep(ANA, id, 30);
    expect((await tracking(code)).pedido.prep).toBeDefined();

    await setStatus(ANA, id, "ready");
    expect((await tracking(code)).pedido).not.toHaveProperty("prep");
  });

  it("no lo entrega en un pedido programado", async () => {
    const { id, code } = await place("ana", HAMB);
    await setStatus(ANA, id, "confirmed");
    await prep(ANA, id, 30);
    await db.exec(`update orders set scheduled_for = now() + interval '3 hours' where id = '${id}'`);

    expect((await tracking(code)).pedido).not.toHaveProperty("prep");
  });

  it("el tiempo de un negocio no aparece en el pedido de otro", async () => {
    const ana = await place("ana", HAMB);
    await setStatus(ANA, ana.id, "confirmed");
    await prep(ANA, ana.id, 45);

    const beto = await place("beto", FERNET);
    await setStatus(BETO, beto.id, "confirmed");

    expect((await tracking(beto.code)).pedido).not.toHaveProperty("prep");
  });
});

describe("configuración — ADMIN-CONFIG-49 y 50", () => {
  it("por defecto el tiempo no se muestra y el valor por defecto es 20", async () => {
    const r = await db.query<{ show: boolean; mins: number }>(
      `select show_prep_time as show, default_prep_minutes as mins from business_settings where business_id = '${NEG_BETO}'`,
    );
    expect(r.rows[0]).toEqual({ show: false, mins: 20 });
  });

  const save = (user: string, business: string, show: unknown, minutes: unknown) =>
    asUser(
      db,
      user,
      `select public.save_business_settings('${business}', true, 'moderno', null, '#112233', '#445566', null,
        '{}'::jsonb, null, null, null, null, false, null, null, null, null, 'claro',
        array['retiro'], array['efectivo'], null, null, false, 60, false, '{}'::jsonb, 50, 50, true, true,
        ${show}, ${minutes})`,
    );

  it("save_business_settings guarda el interruptor y el tiempo por defecto", async () => {
    const r = await save(BETO, NEG_BETO, true, 35);
    expect(r.ok ? "ok" : r.error).toBe("ok");

    const row = await db.query<{ show: boolean; mins: number }>(
      `select show_prep_time as show, default_prep_minutes as mins from business_settings where business_id = '${NEG_BETO}'`,
    );
    expect(row.rows[0]).toEqual({ show: true, mins: 35 });
  });

  it("rechaza un tiempo por defecto fuera de 5 a 180", async () => {
    for (const bad of [4, 181]) {
      expect((await save(BETO, NEG_BETO, true, bad)).ok, `${bad}`).toBe(false);
    }
  });

  it("una llamada sin los parámetros nuevos no pisa lo guardado", async () => {
    await save(BETO, NEG_BETO, true, 35);

    const r = await asUser(
      db,
      BETO,
      `select public.save_business_settings('${NEG_BETO}', true, 'moderno', null, '#112233', '#445566', null,
        '{}'::jsonb, null, null, null, null, false, null, null, null, null, 'claro',
        array['retiro'], array['efectivo'], null, null, false, 60, false, '{}'::jsonb, 50, 50, true, true)`,
    );
    expect(r.ok).toBe(true);

    const row = await db.query<{ show: boolean; mins: number }>(
      `select show_prep_time as show, default_prep_minutes as mins from business_settings where business_id = '${NEG_BETO}'`,
    );
    expect(row.rows[0]).toEqual({ show: true, mins: 35 });
  });

  it("otro negocio no puede cambiar la configuración ajena", async () => {
    const read = () =>
      db.query<{ mins: number }>(
        `select default_prep_minutes as mins from business_settings where business_id = '${NEG_BETO}'`,
      );
    const before = (await read()).rows[0].mins;

    await save(ANA, NEG_BETO, true, 90);

    expect((await read()).rows[0].mins).toBe(before);
  });
});
