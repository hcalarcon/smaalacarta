// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// ENVIO-38 a 40 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña de un negocio con envío
const BETO = "bbbbbbbb-0000-0000-0000-000000000002"; // dueño de otro negocio
const REPA = "cccccccc-0000-0000-0000-000000000003"; // usuario repartidor
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const COURIER = "7a0c0e00-0000-4000-8000-000000000001";

const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const markSettled = (user: string | null, id: string) =>
  call(user, `select public.courier_mark_settled('${id}')`);
const confirm = (user: string | null, id: string) =>
  call(user, `select public.business_confirm_settlement('${id}')`);

async function zoneId(name: string) {
  const r = await db.query<{ id: string }>("select id from courier_zones where name = $1", [name]);
  return r.rows[0].id;
}

// Un pedido con envío (2 cafés = $2000, Cantera $5000), entregado de punta a punta.
async function deliveredOrder(payment = "efectivo") {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null,
       '${items}'::jsonb, p_delivery_zone => '${await zoneId("Cantera")}'::uuid,
       p_customer_phone => '3515551234', p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);

  const code = (r.rows[0].result as { code: string }).code;
  const id = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0].id;
  if (payment !== "efectivo") await db.exec(`update orders set payment = '${payment}' where id = '${id}'`);

  await call(REPA, `select public.set_order_courier('${id}', 'accept', 'Juan')`);
  for (const s of ["confirmed", "preparing", "ready", "handed_to_courier"]) {
    await call(ANA, `select public.set_order_status('${id}', '${s}')`);
  }
  await call(REPA, `select public.courier_set_status('${id}', 'on_the_way')`);
  await call(REPA, `select public.courier_set_status('${id}', 'delivered')`);

  return id;
}

async function row(id: string) {
  const r = await db.query<Record<string, unknown>>(
    "select settled_at, settled_by, settlement_received_at, settlement_received_by from orders where id = $1",
    [id],
  );
  return r.rows[0];
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: REPA, email: "repa@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true, false);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_ANA}', true, 'San Martín 100'), ('${NEG_BETO}', true, null);
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into courier_users (courier_id, user_id) values ('${COURIER}', '${REPA}');
  `);
}, 60_000);

// El freno de 20 pedidos por minuto: los pedidos de los tests anteriores se "envejecen".
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
});

afterAll(async () => {
  await db.close();
});

describe("el repartidor marca Rendido — ENVIO-39", () => {
  it("marca la hora y quién, y deja un evento con el monto del pedido sin el envío", async () => {
    const id = await deliveredOrder();

    const r = await markSettled(REPA, id);
    expect(r.ok).toBe(true);

    const o = await row(id);
    expect(o.settled_at).not.toBeNull();
    expect(o.settled_by).toBe(REPA);
    expect(o.settlement_received_at).toBeNull();

    const events = await db.query<{ note: string; kind: string; changed_by: string }>(
      "select note, kind, changed_by from order_events where order_id = $1 order by created_at desc, id desc limit 1",
      [id],
    );
    expect(events.rows[0]).toEqual({ note: "Rendido al local: $2.000", kind: "delivery", changed_by: REPA });
  });

  it("no se repite ni se deshace (P0004)", async () => {
    const id = await deliveredOrder();
    expect((await markSettled(REPA, id)).ok).toBe(true);

    const again = await markSettled(REPA, id);
    expect(!again.ok && again.code).toBe("P0004");
  });

  it("exige un pedido entregado (P0004)", async () => {
    const id = await deliveredOrder();
    await db.exec(`update orders set status = 'on_the_way' where id = '${id}'`);

    const r = await markSettled(REPA, id);
    expect(!r.ok && r.code).toBe("P0004");
  });

  it("exige efectivo: con transferencia no hay nada que rendir (P0004)", async () => {
    const id = await deliveredOrder("transferencia");

    const r = await markSettled(REPA, id);
    expect(!r.ok && r.code).toBe("P0004");
    expect((await row(id)).settled_at).toBeNull();
  });

  it("un miembro del negocio, otro negocio y un visitante no lo marcan", async () => {
    const id = await deliveredOrder();

    const member = await markSettled(ANA, id);
    expect(!member.ok && member.code).toBe("42501");

    const other = await markSettled(BETO, id);
    expect(!other.ok && other.code).toBe("42501");

    const anon = await markSettled(null, id);
    expect(anon.ok).toBe(false);

    expect((await row(id)).settled_at).toBeNull();
  });

  it("un pedido que no existe da P0002", async () => {
    const r = await markSettled(REPA, "00000000-0000-0000-0000-000000000099");
    expect(!r.ok && r.code).toBe("P0002");
  });
});

describe("el local marca Recibido — ENVIO-39", () => {
  it("solo después de que el repartidor lo marcó (P0004)", async () => {
    const id = await deliveredOrder();

    const early = await confirm(ANA, id);
    expect(!early.ok && early.code).toBe("P0004");
    expect((await row(id)).settlement_received_at).toBeNull();
  });

  it("guarda la hora, quién y deja su evento", async () => {
    const id = await deliveredOrder();
    await markSettled(REPA, id);

    const r = await confirm(ANA, id);
    expect(r.ok).toBe(true);

    const o = await row(id);
    expect(o.settlement_received_at).not.toBeNull();
    expect(o.settlement_received_by).toBe(ANA);

    const events = await db.query<{ note: string; kind: string }>(
      "select note, kind from order_events where order_id = $1 order by created_at desc, id desc limit 1",
      [id],
    );
    expect(events.rows[0]).toEqual({ note: "Rendición recibida", kind: "delivery" });
  });

  it("no se repite (P0004)", async () => {
    const id = await deliveredOrder();
    await markSettled(REPA, id);
    expect((await confirm(ANA, id)).ok).toBe(true);

    const again = await confirm(ANA, id);
    expect(!again.ok && again.code).toBe("P0004");
  });

  it("el repartidor, otro negocio y un visitante no lo confirman", async () => {
    const id = await deliveredOrder();
    await markSettled(REPA, id);

    const courier = await confirm(REPA, id);
    expect(!courier.ok && courier.code).toBe("P0002");

    const other = await confirm(BETO, id);
    expect(!other.ok && other.code).toBe("P0002");

    const anon = await confirm(null, id);
    expect(anon.ok).toBe(false);

    expect((await row(id)).settlement_received_at).toBeNull();
  });
});

describe("las marcas no se cambian a mano — ENVIO-40", () => {
  it("un miembro no marca ni desmarca por UPDATE directo", async () => {
    const id = await deliveredOrder();

    const set = await call(ANA, `update orders set settled_at = now() where id = '${id}'`);
    expect(!set.ok && set.code).toBe("42501");

    await markSettled(REPA, id);
    await confirm(ANA, id);

    for (const col of ["settled_at", "settlement_received_at", "settled_by", "settlement_received_by"]) {
      const r = await call(ANA, `update orders set ${col} = null where id = '${id}'`);
      expect(!r.ok && r.code, col).toBe("42501");
    }

    const o = await row(id);
    expect(o.settled_at).not.toBeNull();
    expect(o.settlement_received_at).not.toBeNull();
  });

  it("el resto del pedido se sigue pudiendo actualizar", async () => {
    const id = await deliveredOrder();
    const r = await call(ANA, `update orders set notes = 'ok' where id = '${id}'`);
    expect(r.ok && r.affected).toBe(1);
  });
});

describe("courier_orders trae la rendición — ENVIO-40", () => {
  type Listed = { id: string; rendicion: { rendido_el: string | null; recibido_el: string | null } };

  async function listed(id: string) {
    const r = await call(REPA, "select public.courier_orders() as o");
    if (!r.ok) throw new Error(r.error);
    return (r.rows[0].o as Listed[]).find((o) => o.id === id);
  }

  it("rendicion lleva rendido_el y recibido_el", async () => {
    const id = await deliveredOrder();
    expect((await listed(id))?.rendicion).toEqual({ rendido_el: null, recibido_el: null });

    await markSettled(REPA, id);
    const marked = (await listed(id))?.rendicion;
    expect(marked?.rendido_el).not.toBeNull();
    expect(marked?.recibido_el).toBeNull();

    await confirm(ANA, id);
    expect((await listed(id))?.rendicion.recibido_el).not.toBeNull();
  });

  it("un pedido viejo con la rendición abierta no desaparece; cerrada, sí", async () => {
    const id = await deliveredOrder();
    await db.exec(`update orders set created_at = now() - interval '10 days' where id = '${id}'`);
    expect(await listed(id)).toBeTruthy();

    await markSettled(REPA, id);
    expect(await listed(id)).toBeTruthy();

    await confirm(ANA, id);
    expect(await listed(id)).toBeUndefined();
  });
});
