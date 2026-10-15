// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigration, asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { take as takeOffer } from "@/test/offers";

// ENVIO-59 a 75 contra Postgres real: la búsqueda de repartidor (varios repartidores, etapa 2). Desde la
// etapa 2b el repartidor oferta y el cliente elige (ENVIO-95 a 112): ver `courier-offers.test.ts`.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001"; // dueña de un negocio con envío
const BETO = "bbbbbbbb-0000-0000-0000-000000000002"; // dueño de otro negocio con envío
const TOQUE_USER = "cccccccc-0000-0000-0000-000000000003"; // repartidor 1 (Repartos al Toque)
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006"; // repartidor 2 (Moto Express)
const LEJOS_USER = "cccccccc-0000-0000-0000-000000000007"; // repartidor 3: solo cubre Oasis
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const TOQUE = "7a0c0e00-0000-4000-8000-000000000001";
const MOTO = "7a0c0e00-0000-4000-8000-000000000002";
const LEJOS = "7a0c0e00-0000-4000-8000-000000000003";

const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const sqlText = (value: string | null) => (value === null ? "null" : "'" + value.replace(/'/g, "''") + "'");
const call = (user: string | null, sql: string) => asUser(db, user, sql);

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

type Extra = { delivery?: string; zone?: string | null; phone?: string | null; address?: string | null };

function create(slug: string, extra: Extra = {}) {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const zone = extra.zone ?? null;
  return call(
    null,
    `select public.create_public_order('${slug}', 'Cliente Prueba', ${sqlText(extra.delivery ?? "retiro")}, 'efectivo',
       'Timbre roto', '${items}'::jsonb,
       p_delivery_zone => ${zone === null ? "null" : `'${zone}'::uuid`},
       p_customer_phone => ${sqlText(extra.phone === undefined ? "3515551234" : extra.phone)},
       p_delivery_address => ${sqlText(extra.address === undefined ? null : extra.address)}) as result`,
  );
}

// Un pedido con envío de Ana, en Cantera, todavía sin confirmar.
async function envio(zone = "Cantera") {
  const r = await create("ana", {
    delivery: "delivery",
    zone: await zoneId(zone),
    phone: "351 555-1234",
    address: "Av. Siempre Viva 742",
  });
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const id = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0].id;
  return { id, code };
}

const confirm = (id: string) => call(ANA, `select public.set_order_status('${id}', 'confirmed')`);
const setStatus = (user: string | null, id: string, to: string) =>
  call(user, `select public.set_order_status('${id}', '${to}')`);

// Un pedido con la búsqueda abierta.
async function searching(zone = "Cantera") {
  const o = await envio(zone);
  const r = await confirm(o.id);
  if (!r.ok) throw new Error(r.error);
  return o;
}

// El repartidor oferta y el cliente lo elige: queda con el pedido.
const take = (user: string | null, id: string, price: number | null = null, reason: string | null = null) =>
  takeOffer(db, user!, id, price, reason);

async function available(user: string) {
  const r = await call(user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].l as { id: string; [key: string]: unknown }[];
}
const sees = async (user: string, id: string) => (await available(user)).some((o) => o.id === id);

async function row(id: string) {
  return (
    await db.query<Record<string, unknown>>(
      `select courier_id, courier_status, offered_at, courier_note,
              delivery_fee_list, delivery_fee, delivery_fee_reason, status
       from orders where id = $1`,
      [id],
    )
  ).rows[0];
}

const setFavorite = (courier: string | null) =>
  db.exec(`update business_settings set favorite_courier_id = ${courier ? `'${courier}'` : "null"}
             where business_id = '${NEG_ANA}'`);

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: TOQUE_USER, email: "toque@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });
  await createUser(db, { id: LEJOS_USER, email: "lejos@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true, true);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}');
    insert into business_settings (business_id, published, address) values
      ('${NEG_ANA}', true, 'San Martín 100'), ('${NEG_BETO}', true, null);
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);

    -- Repartos al Toque ya existe y cubre todas las zonas. Moto Express cubre Centro y Cantera; el
    -- tercero solo Oasis.
    insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${TOQUE_USER}');
    insert into couriers (id, name, whatsapp, active) values
      ('${MOTO}', 'Moto Express', '5493510000099', true),
      ('${LEJOS}', 'Lejos', null, true);
    insert into courier_users (courier_id, user_id) values
      ('${MOTO}', '${MOTO_USER}'), ('${LEJOS}', '${LEJOS_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${MOTO}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera');
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${LEJOS}', id from delivery_zones where name = 'Oasis';

    -- Ana envía a Centro, Cantera y Oasis; Beto, a Cantera.
    -- Con el envío activo, la base ya les cargó todas las zonas (ENVIO-128): se parte de cero.
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera', 'Oasis');
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_BETO}', id from delivery_zones where name = 'Cantera';
  `);
}, 60_000);

// El freno de 20 pedidos por minuto.
beforeEach(async () => {
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await setFavorite(null);
});

afterAll(async () => {
  await db.close();
});

describe("la búsqueda se abre al confirmar — ENVIO-59, 95 y 155", () => {
  it("el pedido con envío nace sin repartidor y esperando: los repartidores no lo ven hasta que el local lo acepta", async () => {
    const o = await envio();
    const r = await row(o.id);
    expect(r).toMatchObject({ courier_id: null, courier_status: "waiting", status: "pending" });
    expect(r.offered_at).toBeNull();
    expect(await sees(TOQUE_USER, o.id)).toBe(false);

    expect((await confirm(o.id)).ok).toBe(true);
    expect((await row(o.id)).courier_status).toBe("searching");
    expect((await row(o.id)).offered_at).not.toBeNull();
    expect(await sees(TOQUE_USER, o.id)).toBe(true);
  });

  it("después de abrirse, seguir el pedido no cambia la búsqueda: offered_at queda", async () => {
    const o = await envio();
    expect((await confirm(o.id)).ok).toBe(true);
    const antes = await row(o.id);
    await setStatus(ANA, o.id, "preparing");
    const despues = await row(o.id);
    expect(despues.courier_status).toBe("searching");
    expect(despues.offered_at).toEqual(antes.offered_at);
  });

  it("un pedido sin envío (retiro) no abre ninguna búsqueda", async () => {
    const c = await create("ana", { delivery: "retiro" });
    const code = (c.ok ? (c.rows[0].result as { code: string }).code : "") as string;
    const id = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0].id;
    expect((await confirm(id)).ok).toBe(true);
    const r = await row(id);
    expect(r).toMatchObject({ courier_id: null, courier_status: null, offered_at: null });
  });

  it("el pedido programado se ofrece al aceptarlo, con su hora", async () => {
    const o = await envio();
    await db.exec(`update orders set scheduled_for = now() + interval '1 day' where id = '${o.id}'`);
    expect((await confirm(o.id)).ok).toBe(true);

    const lista = await available(TOQUE_USER);
    const found = lista.find((x) => x.id === o.id);
    expect(found).toBeTruthy();
    expect(found?.programado).not.toBeNull();
  });
});

describe("cobertura de zonas — ENVIO-62 y 99", () => {
  it("cada repartidor ve solo los pedidos de las zonas que cubre", async () => {
    const cantera = await searching("Cantera");
    const oasis = await searching("Oasis");

    expect(await sees(TOQUE_USER, cantera.id)).toBe(true);
    expect(await sees(TOQUE_USER, oasis.id)).toBe(true);
    expect(await sees(MOTO_USER, cantera.id)).toBe(true);
    expect(await sees(MOTO_USER, oasis.id)).toBe(false);
    expect(await sees(LEJOS_USER, cantera.id)).toBe(false);
    expect(await sees(LEJOS_USER, oasis.id)).toBe(true);
  });

  it("quien no cubre la zona no puede ofertar ni rechazar (P0019)", async () => {
    const o = await searching("Cantera");
    const t = await take(LEJOS_USER, o.id);
    expect(!t.ok && t.code).toBe("P0020");
    const d = await call(LEJOS_USER, `select public.courier_decline_order('${o.id}')`);
    expect(!d.ok && d.code).toBe("P0020");
  });

  it("un repartidor dado de baja no ve ni oferta nada", async () => {
    const o = await searching();
    await db.exec(`update couriers set active = false where id = '${MOTO}'`);
    expect(await sees(MOTO_USER, o.id)).toBe(false);
    const t = await take(MOTO_USER, o.id);
    expect(!t.ok && t.code).toBe("P0020");
    await db.exec(`update couriers set active = true where id = '${MOTO}'`);
  });

  it("si deja de cubrir la zona, lo deja de ver", async () => {
    const o = await searching();
    await db.exec(`delete from courier_zone_coverage where courier_id = '${MOTO}'
      and zone_id = (select id from delivery_zones where name = 'Cantera')`);
    expect(await sees(MOTO_USER, o.id)).toBe(false);
    await db.exec(`insert into courier_zone_coverage (courier_id, zone_id)
      select '${MOTO}', id from delivery_zones where name = 'Cantera'`);
  });
});

describe("rechazar y devolver — ENVIO-65 y 66", () => {
  it("rechazar: ese pedido deja de verse para ese repartidor y sigue para los demás", async () => {
    const o = await searching();
    const r = await call(TOQUE_USER, `select public.courier_decline_order('${o.id}')`);
    expect(r.ok).toBe(true);

    expect(await sees(TOQUE_USER, o.id)).toBe(false);
    expect(await sees(MOTO_USER, o.id)).toBe(true);

    // Ya no puede ofertar.
    const t = await take(TOQUE_USER, o.id);
    expect(!t.ok && t.code).toBe("P0020");

    const d = await db.query<{ kind: string; courier_id: string }>(
      "select kind, courier_id from courier_order_declines where order_id = $1",
      [o.id],
    );
    expect(d.rows).toEqual([{ kind: "rejected", courier_id: TOQUE }]);

    // El pedido sigue buscando.
    expect((await row(o.id)).courier_status).toBe("searching");
  });

  it("devolver: motivo obligatorio, vuelve a ofertas, menos para quien lo devolvió", async () => {
    const o = await searching();
    await take(MOTO_USER, o.id, 7000, "Lluvia");

    const sinMotivo = await call(MOTO_USER, `select public.courier_return_order('${o.id}', 'other', '  ')`);
    expect(!sinMotivo.ok && sinMotivo.code).toBe("22023");
    expect((await row(o.id)).courier_id).toBe(MOTO);

    const antes = new Date((await row(o.id)).offered_at as string).getTime();
    const ok = await call(MOTO_USER, `select public.courier_return_order('${o.id}', 'other', 'Se me pinchó la moto')`);
    expect(ok.ok).toBe(true);

    const r = await row(o.id);
    expect(r).toMatchObject({
      courier_id: null,
      courier_status: "searching",
      courier_note: null,
      delivery_fee: "5000.00",
      delivery_fee_reason: null,
    });
    expect(new Date(r.offered_at as string).getTime()).toBeGreaterThanOrEqual(antes);

    // Lo ven todos menos el que lo devolvió, que ya no puede ofertar.
    expect(await sees(TOQUE_USER, o.id)).toBe(true);
    expect(await sees(MOTO_USER, o.id)).toBe(false);
    const t = await take(MOTO_USER, o.id);
    expect(!t.ok && t.code).toBe("P0020");

    const d = await db.query<{ kind: string; reason: string }>(
      "select kind, reason from courier_order_declines where order_id = $1 and courier_id = $2",
      [o.id, MOTO],
    );
    expect(d.rows).toEqual([{ kind: "returned", reason: "Se me pinchó la moto" }]);

    const ev = await db.query<{ note: string }>(
      "select note from order_events where order_id = $1 and kind = 'delivery' and note like 'Envío devuelto%'",
      [o.id],
    );
    expect(ev.rows[0].note).toMatch(/^Envío devuelto por Moto Express: Se me pinchó la moto, \d\d:\d\d$/);

    // Otro lo ofrece y el cliente lo elige.
    expect((await take(TOQUE_USER, o.id)).ok).toBe(true);
    expect((await row(o.id)).courier_id).toBe(TOQUE);
  });

  it("solo devuelve el repartidor asignado y solo antes de que el local se lo entregue", async () => {
    const o = await searching();
    await take(TOQUE_USER, o.id);

    const otro = await call(MOTO_USER, `select public.courier_return_order('${o.id}', 'vehicle')`);
    expect(!otro.ok && otro.code).toBe("P0002");
    const local = await call(ANA, `select public.courier_return_order('${o.id}', 'vehicle')`);
    expect(local.ok).toBe(false);
    const anon = await call(null, `select public.courier_return_order('${o.id}', 'vehicle')`);
    expect(anon.ok).toBe(false);

    await setStatus(ANA, o.id, "handed_to_courier");
    const tarde = await call(TOQUE_USER, `select public.courier_return_order('${o.id}', 'other', 'Ya lo tengo')`);
    expect(!tarde.ok && tarde.code).toBe("P0004");
    expect((await row(o.id)).courier_id).toBe(TOQUE);
  });

  it("devolver un pedido ya preparado se puede mientras no esté entregado al repartidor", async () => {
    const o = await searching();
    await take(TOQUE_USER, o.id);
    await setStatus(ANA, o.id, "ready");
    const r = await call(TOQUE_USER, `select public.courier_return_order('${o.id}', 'other', 'No llego')`);
    expect(r.ok).toBe(true);
    expect((await row(o.id)).status).toBe("ready");
    expect(await sees(MOTO_USER, o.id)).toBe(true);
  });
});

describe("el local resuelve — ENVIO-67 y 68", () => {
  it("asignar a mano: queda accepted con el repartidor y un evento", async () => {
    const o = await searching();
    const r = await call(ANA, `select public.business_assign_courier('${o.id}', '${MOTO}', 'Hablamos por WhatsApp')`);
    expect(r.ok).toBe(true);

    expect(await row(o.id)).toMatchObject({
      courier_id: MOTO,
      courier_status: "accepted",
      courier_note: "Hablamos por WhatsApp",
    });
    expect(await sees(TOQUE_USER, o.id)).toBe(false);

    const ev = await db.query<{ note: string }>(
      "select note from order_events where order_id = $1 and kind = 'delivery'",
      [o.id],
    );
    expect(ev.rows[0].note).toMatch(/^Envío asignado a Moto Express: Hablamos por WhatsApp, \d\d:\d\d$/);

    // Ahora el local puede entregárselo.
    for (const s of ["preparing", "ready", "handed_to_courier"]) {
      expect((await setStatus(ANA, o.id, s)).ok, s).toBe(true);
    }
  });

  it("el repartidor tiene que estar activo y cubrir la zona (22023)", async () => {
    const o = await searching("Cantera");
    const lejos = await call(ANA, `select public.business_assign_courier('${o.id}', '${LEJOS}')`);
    expect(!lejos.ok && lejos.code).toBe("22023");

    await db.exec(`update couriers set active = false where id = '${MOTO}'`);
    const baja = await call(ANA, `select public.business_assign_courier('${o.id}', '${MOTO}')`);
    expect(!baja.ok && baja.code).toBe("22023");
    await db.exec(`update couriers set active = true where id = '${MOTO}'`);

    const fantasma = await call(
      ANA,
      `select public.business_assign_courier('${o.id}', '99999999-0000-0000-0000-000000000009')`,
    );
    expect(!fantasma.ok && fantasma.code).toBe("22023");
    expect((await row(o.id)).courier_id).toBeNull();
  });

  it("solo con la búsqueda abierta (P0004): ni cancelado ni ya elegido", async () => {
    const cancelado = await searching();
    await setStatus(ANA, cancelado.id, "cancelled");
    const a = await call(ANA, `select public.business_assign_courier('${cancelado.id}', '${MOTO}')`);
    expect(!a.ok && a.code).toBe("P0004");

    const tomado = await searching();
    await take(TOQUE_USER, tomado.id);
    const b = await call(ANA, `select public.business_assign_courier('${tomado.id}', '${MOTO}')`);
    expect(!b.ok && b.code).toBe("P0004");
    const c = await call(ANA, `select public.business_self_delivery('${tomado.id}')`);
    expect(!c.ok && c.code).toBe("P0004");
  });

  it("Lo llevo yo: pasa a 'self' y el local lo entrega por el camino sin repartidor", async () => {
    const o = await searching();
    expect((await call(ANA, `select public.business_self_delivery('${o.id}')`)).ok).toBe(true);
    expect(await row(o.id)).toMatchObject({ courier_id: null, courier_status: "self" });
    expect(await sees(TOQUE_USER, o.id)).toBe(false);

    const handed = await setStatus(ANA, o.id, "handed_to_courier");
    expect(!handed.ok && handed.code).toBe("P0004");

    expect((await setStatus(ANA, o.id, "preparing")).ok).toBe(true);
    expect((await setStatus(ANA, o.id, "ready")).ok).toBe(true);
    expect((await setStatus(ANA, o.id, "delivered")).ok).toBe(true);
    expect((await row(o.id)).status).toBe("delivered");
  });

  it("solo los miembros del negocio del pedido; el resto no se entera de que existe (P0002)", async () => {
    const o = await searching();

    for (const user of [BETO, TOQUE_USER]) {
      const a = await call(user, `select public.business_assign_courier('${o.id}', '${MOTO}')`);
      expect(!a.ok && a.code, `asignar ${user}`).toBe("P0002");
      const s = await call(user, `select public.business_self_delivery('${o.id}')`);
      expect(!s.ok && s.code, `self ${user}`).toBe("P0002");
    }
    const anon = await call(null, `select public.business_self_delivery('${o.id}')`);
    expect(anon.ok).toBe(false);
    const anon2 = await call(null, `select public.business_assign_courier('${o.id}', '${MOTO}')`);
    expect(anon2.ok).toBe(false);

    expect((await row(o.id)).courier_status).toBe("searching");
  });
});

describe("handed_to_courier solo con un repartidor — ENVIO-69", () => {
  it("rechazado sin repartidor (P0004), por la función y por UPDATE directo", async () => {
    const o = await searching();
    const fn = await setStatus(ANA, o.id, "handed_to_courier");
    expect(!fn.ok && fn.code).toBe("P0004");

    const direct = await call(ANA, `update orders set status = 'handed_to_courier' where id = '${o.id}'`);
    expect(!direct.ok && direct.code).toBe("P0004");
  });

  it("tampoco con 'accepted' pero sin repartidor cargado a mano", async () => {
    const o = await searching();
    // El local no puede forjar el estado desde la app...
    const forge = await call(
      ANA,
      `update orders set courier_status = 'accepted', status = 'handed_to_courier' where id = '${o.id}'`,
    );
    expect(forge.ok).toBe(false);
    // ...y aunque llegara por otro camino, el pedido sin repartidor sigue sin poder entregarse.
    await db.exec(`update orders set courier_status = 'accepted' where id = '${o.id}'`);
    const r = await setStatus(ANA, o.id, "handed_to_courier");
    expect(!r.ok && r.code).toBe("P0004");
  });
});

describe("el teléfono del cliente — ENVIO-70", () => {
  it("es obligatorio en todos los pedidos, con o sin envío (P0018)", async () => {
    for (const phone of [null, "", "1234567", "1234567890123456", "sin números"]) {
      const retiro = await create("ana", { delivery: "retiro", phone });
      expect(!retiro.ok && retiro.code, `retiro ${phone}`).toBe("P0018");

      const otroNegocio = await create("beto", { delivery: "retiro", phone });
      expect(!otroNegocio.ok && otroNegocio.code, `otro negocio ${phone}`).toBe("P0018");
    }

    const envioSinTel = await create("ana", {
      delivery: "delivery",
      zone: await zoneId("Cantera"),
      phone: null,
      address: "Av. Siempre Viva 742",
    });
    expect(!envioSinTel.ok && envioSinTel.code).toBe("P0018");
  });

  it("se guarda normalizado también en un retiro", async () => {
    const r = await create("ana", { delivery: "retiro", phone: "(351) 555-1234" });
    expect(r.ok).toBe(true);
    const code = (r.ok ? (r.rows[0].result as { code: string }).code : "") as string;
    const o = await db.query<{ customer_phone: string; courier_status: string | null }>(
      "select customer_phone, courier_status from orders where code = $1",
      [code],
    );
    expect(o.rows[0]).toEqual({ customer_phone: "3515551234", courier_status: null });
  });

  it("un negocio que no existe sigue dando P0002", async () => {
    const r = await create("fantasma", { delivery: "retiro", phone: null });
    expect(!r.ok && r.code).toBe("P0002");
  });
});

describe("quién ve qué — ENVIO-71 a 73 y 101", () => {
  it("antes de que lo elijan el repartidor no ve nombre, teléfono ni dirección del cliente", async () => {
    const o = await searching();
    const r = await call(TOQUE_USER, "select public.courier_available_orders() as l");
    const lista = (r.ok ? r.rows[0].l : []) as Record<string, unknown>[];
    const found = lista.find((x) => x.id === o.id)!;

    expect(found.negocio).toEqual({ nombre: "Ana Resto", direccion: "San Martín 100" });
    expect(found).toMatchObject({
      numero: expect.any(String),
      total: 2000,
      pago: "efectivo",
      envio: { zona: "Cantera", precio_lista: 5000 },
      ofertas: 0,
      mi_oferta: null,
    });
    expect(found).toHaveProperty("programado");
    expect(found).not.toHaveProperty("cliente");
    expect(found).not.toHaveProperty("notas");
    expect(found).not.toHaveProperty("items");
    expect(JSON.stringify(found)).not.toMatch(/Cliente Prueba|3515551234|Siempre Viva|Timbre roto/);
  });

  it("recién cuando lo eligen ve los datos del cliente (courier_orders)", async () => {
    const o = await searching();
    await take(TOQUE_USER, o.id);

    const r = await call(TOQUE_USER, "select public.courier_orders() as l");
    const lista = (r.ok ? r.rows[0].l : []) as { id: string; cliente: unknown }[];
    expect(lista.find((x) => x.id === o.id)?.cliente).toEqual({
      nombre: "Cliente Prueba",
      telefono: "3515551234",
      direccion: "Av. Siempre Viva 742",
    });

    // Otro repartidor no lo ve en sus pedidos.
    const otro = await call(MOTO_USER, "select public.courier_orders() as l");
    expect(((otro.ok ? otro.rows[0].l : []) as { id: string }[]).map((x) => x.id)).not.toContain(o.id);
  });

  it("courier_orders sigue trayendo los pedidos viejos sin rendir", async () => {
    const o = await searching();
    await take(TOQUE_USER, o.id);
    for (const s of ["preparing", "ready", "handed_to_courier"]) await setStatus(ANA, o.id, s);
    await call(TOQUE_USER, `select public.courier_set_status('${o.id}', 'on_the_way')`);
    await call(TOQUE_USER, `select public.courier_set_status('${o.id}', 'delivered')`);
    await db.exec(`update orders set created_at = now() - interval '20 days' where id = '${o.id}'`);

    const r = await call(TOQUE_USER, "select public.courier_orders() as l");
    expect(((r.ok ? r.rows[0].l : []) as { id: string }[]).map((x) => x.id)).toContain(o.id);
  });

  it("cada rol: solo el repartidor llama a las funciones del repartidor", async () => {
    const o = await searching();
    for (const user of [ANA, BETO, null]) {
      expect((await call(user, "select public.courier_available_orders()")).ok, `lista ${user}`).toBe(false);
      expect((await take(user, o.id)).ok, `tomar ${user}`).toBe(false);
      expect((await call(user, `select public.courier_decline_order('${o.id}')`)).ok, `rechazar ${user}`).toBe(false);
    }
    const local = await take(ANA, o.id);
    expect(!local.ok && local.code).toBe("42501");
  });

  it("las tablas de rechazos: cada uno ve las suyas; el negocio, las de sus pedidos; nadie escribe", async () => {
    const o = await searching();
    await call(TOQUE_USER, `select public.courier_decline_order('${o.id}')`);
    await call(MOTO_USER, `select public.courier_decline_order('${o.id}')`);

    const count = async (user: string | null) => {
      const r = await call(user, `select count(*) n from courier_order_declines where order_id = '${o.id}'`);
      return r.ok ? Number(r.rows[0].n) : -1;
    };
    expect(await count(TOQUE_USER)).toBe(1);
    expect(await count(MOTO_USER)).toBe(1);
    expect(await count(LEJOS_USER)).toBe(0);
    expect(await count(ANA)).toBe(2);
    expect(await count(BETO)).toBe(0);
    expect(await count(null)).toBe(0);

    const insert = await call(
      TOQUE_USER,
      `insert into courier_order_declines (order_id, courier_id, kind) values ('${o.id}', '${LEJOS}', 'rejected')`,
    );
    expect(insert.ok).toBe(false);
    const del = await call(TOQUE_USER, "delete from courier_order_declines");
    expect(del.ok && del.affected).toBe(0);
  });

  it("el repartidor no lee pedidos por SQL directo", async () => {
    const o = await searching();
    const r = await call(TOQUE_USER, `select id from orders where id = '${o.id}'`);
    expect(r.ok && r.rows.length).toBe(0);
  });
});

describe("la migración convierte los pedidos abiertos de antes — ENVIO-74", () => {
  it("los que esperaban el OK de un repartidor quedan sin repartidor; los aceptados no se tocan", async () => {
    const old = await createTestDb({ before: "20261022000000_busqueda_de_repartidor.sql" });

    try {
      await createUser(old, { id: ANA, email: "ana@x.com" });
      await old.exec(`
        insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
          ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
        insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
        insert into business_settings (business_id, published) values ('${NEG_ANA}', true);
        insert into orders (id, business_id, order_number, status, total, customer_name, courier_id, courier_status) values
          ('f0000000-0000-0000-0000-000000000001', '${NEG_ANA}', '1', 'pending', 100, 'A', '${TOQUE}', 'waiting'),
          ('f0000000-0000-0000-0000-000000000002', '${NEG_ANA}', '2', 'pending', 100, 'B', '${TOQUE}', 'requested'),
          ('f0000000-0000-0000-0000-000000000003', '${NEG_ANA}', '3', 'pending', 100, 'C', '${TOQUE}', 'rejected'),
          ('f0000000-0000-0000-0000-000000000004', '${NEG_ANA}', '4', 'confirmed', 100, 'D', '${TOQUE}', 'accepted'),
          ('f0000000-0000-0000-0000-000000000005', '${NEG_ANA}', '5', 'cancelled', 100, 'E', '${TOQUE}', 'rejected');
      `);

      await applyMigration(old, "20261022000000_busqueda_de_repartidor.sql");

      const r = await old.query<{ order_number: string; courier_id: string | null; courier_status: string }>(
        "select order_number, courier_id, courier_status from orders order by order_number",
      );
      expect(r.rows).toEqual([
        { order_number: "1", courier_id: null, courier_status: "waiting" },
        { order_number: "2", courier_id: null, courier_status: "waiting" },
        { order_number: "3", courier_id: null, courier_status: "waiting" },
        { order_number: "4", courier_id: TOQUE, courier_status: "accepted" },
        { order_number: "5", courier_id: TOQUE, courier_status: "rejected" },
      ]);
    } finally {
      await old.close();
    }
  });
});
