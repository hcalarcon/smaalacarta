// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigration, asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { choose, offer, openSearch } from "@/test/offers";

// ENVIO-95 a 112 contra Postgres real: el repartidor oferta y el cliente elige.
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
const FERNET = "d2000000-0000-0000-0000-000000000001"; // el producto de Beto

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const code = (r: Awaited<ReturnType<typeof call>>) => (r.ok ? null : r.code);

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

// Un pedido con envío de Ana, en Cantera ($5000) o en la zona que se diga, ya buscando.
async function envio(slug = "ana", zone = "Cantera") {
  const items = JSON.stringify([{ id: slug === "beto" ? FERNET : CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('${slug}', 'Cliente Prueba', 'delivery', 'efectivo', 'Timbre roto',
       '${items}'::jsonb, p_delivery_zone => '${await zoneId(zone)}'::uuid,
       p_customer_phone => '351 555-1234', p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const c = (r.rows[0].result as { code: string }).code;
  const id = (await db.query<{ id: string }>("select id from orders where code = $1", [c])).rows[0].id;
  await openSearch(db, id);
  return { id, code: c };
}

const row = async (id: string) =>
  (
    await db.query<Record<string, unknown>>(
      `select courier_id, courier_status, offered_at, delivery_fee_list, delivery_fee, delivery_fee_reason, status
       from orders where id = $1`,
      [id],
    )
  ).rows[0];

const offers = async (orderId: string) =>
  (
    await db.query<{ courier_id: string; price: string; reason: string | null; closed_at: Date | null }>(
      "select courier_id, price, reason, closed_at from courier_offers where order_id = $1 order by created_at, id",
      [orderId],
    )
  ).rows;

const setStatus = (user: string | null, id: string, to: string) =>
  call(user, `select public.set_order_status('${id}', '${to}')`);

// Pasan `minutes` minutos: las ofertas y la búsqueda quedan más viejas.
async function age(orderId: string, minutes: number) {
  await db.exec(`
    update courier_offers set created_at = created_at - interval '${minutes} minutes' where order_id = '${orderId}';
    update orders set offered_at = offered_at - interval '${minutes} minutes' where id = '${orderId}';
  `);
}

const delivery = async (c: string) => {
  const r = await call(null, `select public.public_order_delivery('${c}') as d`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].d as Record<string, unknown> & {
    ofertas?: { id: string; repartidor: string; precio: number; motivo?: string; favorito: boolean }[];
  };
};

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
    insert into categories (id, business_id, name, active) values
      ('c2000000-0000-0000-0000-000000000001', '${NEG_BETO}', 'Tragos', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${FERNET}', '${NEG_BETO}', 'c2000000-0000-0000-0000-000000000001', 'Fernet', 3000, true);

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

describe("la tabla de ofertas — ENVIO-96 y 97", () => {
  it("cada rol lee lo suyo y nadie escribe directo", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id, 6000, "Llueve");
    const otro = await envio("beto");
    await offer(db, TOQUE_USER, otro.id);

    const count = async (user: string | null) => {
      const r = await call(user, `select count(*) n from courier_offers where order_id = '${o.id}'`);
      return r.ok ? Number(r.rows[0].n) : -1;
    };
    expect(await count(TOQUE_USER)).toBe(1);
    expect(await count(MOTO_USER)).toBe(1);
    expect(await count(LEJOS_USER)).toBe(0);
    expect(await count(ANA)).toBe(2);
    expect(await count(BETO)).toBe(0);
    expect(await count(null)).toBe(0);

    // El negocio de Beto ve la del suyo, no las de Ana.
    const suyo = await call(BETO, `select count(*) n from courier_offers where order_id = '${otro.id}'`);
    expect(suyo.ok && Number(suyo.rows[0].n)).toBe(1);

    const insert = await call(
      LEJOS_USER,
      `insert into courier_offers (order_id, courier_id, price) values ('${o.id}', '${LEJOS}', 1)`,
    );
    expect(insert.ok).toBe(false);
    const update = await call(TOQUE_USER, `update courier_offers set price = 1 where order_id = '${o.id}'`);
    expect(update.ok && update.affected).toBe(0);
    const del = await call(ANA, "delete from courier_offers");
    expect(del.ok && del.affected).toBe(0);
    expect(await offers(o.id)).toHaveLength(2);
  });

  it("es única por pedido y repartidor, y no admite precios ni motivos fuera de rango", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, TOQUE_USER, o.id, 5500, "Más lejos");
    expect(await offers(o.id)).toHaveLength(1);

    const dup = await db.query(
      `insert into courier_offers (order_id, courier_id, price) values ('${o.id}', '${TOQUE}', 1)`,
    ).then(() => true, () => false);
    expect(dup).toBe(false);

    const neg = await db.query(
      `insert into courier_offers (order_id, courier_id, price) values ('${o.id}', '${MOTO}', -1)`,
    ).then(() => true, () => false);
    expect(neg).toBe(false);

    const corto = await db.query(
      `insert into courier_offers (order_id, courier_id, price, reason) values ('${o.id}', '${MOTO}', 1, 'no')`,
    ).then(() => true, () => false);
    expect(corto).toBe(false);
  });
});

describe("ofertar — ENVIO-98 y 99", () => {
  it("con el precio de lista no pide motivo; con otro, sí (P0021), de 3 a 140 caracteres", async () => {
    const o = await envio();

    expect((await offer(db, TOQUE_USER, o.id)).ok).toBe(true);
    expect((await offers(o.id))[0]).toMatchObject({ courier_id: TOQUE, price: "5000.00", reason: null });

    const sin = await offer(db, MOTO_USER, o.id, 6000);
    expect(code(sin)).toBe("P0021");
    const corto = await offer(db, MOTO_USER, o.id, 6000, "no");
    expect(code(corto)).toBe("P0021");
    const largo = await offer(db, MOTO_USER, o.id, 6000, "x".repeat(141));
    expect(code(largo)).toBe("P0021");
    expect(await offers(o.id)).toHaveLength(1);

    expect((await offer(db, MOTO_USER, o.id, 6000, "Llueve y es lejos")).ok).toBe(true);
    expect((await offers(o.id)).find((f) => f.courier_id === MOTO)).toMatchObject({
      price: "6000.00",
      reason: "Llueve y es lejos",
    });
  });

  it("una oferta con el precio de lista descarta el motivo, y un precio inválido da 22023", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id, 6000, "Llueve");
    await offer(db, TOQUE_USER, o.id, 5000, "ya no hace falta");
    expect(await offers(o.id)).toMatchObject([{ price: "5000.00", reason: null }]);

    expect(code(await offer(db, TOQUE_USER, o.id, -5, "motivo"))).toBe("22023");
    expect(code(await offer(db, TOQUE_USER, o.id, 100000000, "motivo"))).toBe("22023");
  });

  it("cambiar la propia oferta no crea otra", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id, 6000, "Llueve");
    await offer(db, TOQUE_USER, o.id, 5500, "Menos lluvia");
    const all = await offers(o.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ price: "5500.00", reason: "Menos lluvia" });
  });

  it("no ofertan los que no cubren la zona, los dados de baja ni los que rechazaron o devolvieron (P0020)", async () => {
    const o = await envio("ana", "Cantera");
    expect(code(await offer(db, LEJOS_USER, o.id))).toBe("P0020");

    await db.exec(`update couriers set active = false where id = '${MOTO}'`);
    expect(code(await offer(db, MOTO_USER, o.id))).toBe("P0020");
    await db.exec(`update couriers set active = true where id = '${MOTO}'`);

    await call(TOQUE_USER, `select public.courier_decline_order('${o.id}')`);
    expect(code(await offer(db, TOQUE_USER, o.id))).toBe("P0020");

    expect(await offers(o.id)).toHaveLength(0);
  });

  it("no ofertan por un pedido ya elegido, cancelado, entregado, que lleva el local o sin pagar", async () => {
    const elegido = await envio();
    await offer(db, TOQUE_USER, elegido.id);
    await choose(db, TOQUE_USER, elegido.id);
    expect(code(await offer(db, MOTO_USER, elegido.id))).toBe("P0020");

    const cancelado = await envio();
    await setStatus(ANA, cancelado.id, "cancelled");
    expect(code(await offer(db, TOQUE_USER, cancelado.id))).toBe("P0020");

    const propio = await envio();
    await call(ANA, `select public.business_self_delivery('${propio.id}')`);
    expect(code(await offer(db, TOQUE_USER, propio.id))).toBe("P0020");

    const sinPagar = await envio();
    await db.exec(`update orders set payment_status = 'awaiting' where id = '${sinPagar.id}'`);
    expect(code(await offer(db, TOQUE_USER, sinPagar.id))).toBe("P0020");
    await db.exec(`update orders set payment_status = 'paid' where id = '${sinPagar.id}'`);
    expect((await offer(db, TOQUE_USER, sinPagar.id)).ok).toBe(true);
  });

  it("solo ofertan los repartidores", async () => {
    const o = await envio();
    for (const user of [ANA, BETO, null]) {
      expect((await offer(db, user, o.id)).ok, String(user)).toBe(false);
    }
    expect(await offers(o.id)).toHaveLength(0);
  });
});

describe("retirar y rechazar — ENVIO-100 y 102", () => {
  it("retirar la propia oferta mientras el cliente no eligió; después, P0020", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id);

    const r = await call(TOQUE_USER, `select public.courier_withdraw_offer('${o.id}')`);
    expect(r.ok).toBe(true);
    expect((await offers(o.id)).map((f) => f.courier_id)).toEqual([MOTO]);

    // Sin oferta propia no hay qué retirar.
    const sin = await call(TOQUE_USER, `select public.courier_withdraw_offer('${o.id}')`);
    expect(code(sin)).toBe("P0020");

    await choose(db, MOTO_USER, o.id);
    const tarde = await call(MOTO_USER, `select public.courier_withdraw_offer('${o.id}')`);
    expect(code(tarde)).toBe("P0020");
    expect((await row(o.id)).courier_id).toBe(MOTO);
  });

  it("rechazar retira la oferta propia y el pedido deja de verse", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);

    expect((await call(TOQUE_USER, `select public.courier_decline_order('${o.id}')`)).ok).toBe(true);
    expect(await offers(o.id)).toHaveLength(0);

    const lista = await call(TOQUE_USER, "select public.courier_available_orders() as l");
    expect(((lista.ok ? lista.rows[0].l : []) as { id: string }[]).map((x) => x.id)).not.toContain(o.id);
  });

  it("courier_take_order ya no existe", async () => {
    const o = await envio();
    const r = await call(TOQUE_USER, `select public.courier_take_order('${o.id}', null, null, null)`);
    expect(r.ok).toBe(false);
  });
});

describe("lo que ve el repartidor — ENVIO-101", () => {
  type Available = {
    id: string;
    ofertas: number;
    mi_oferta: { precio: number; motivo: string | null } | null;
    resultado: string | null;
  };

  async function available(user: string) {
    const r = await call(user, "select public.courier_available_orders() as l");
    if (!r.ok) throw new Error(r.error);
    return r.rows[0].l as Available[];
  }

  it("ve cuántas ofertas hay y la propia, sin nombres ni precios de los demás", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id, 4500, "Voy para allá");

    const toque = (await available(TOQUE_USER)).find((x) => x.id === o.id)!;
    expect(toque.ofertas).toBe(2);
    expect(toque.mi_oferta).toMatchObject({ precio: 5000, motivo: null });
    expect(toque.resultado).toBeNull();
    expect(JSON.stringify(toque)).not.toMatch(/Moto Express|4500|Voy para allá|Cliente Prueba|3515551234|Siempre Viva/);

    const nueva = await envio();
    const sinOferta = (await available(TOQUE_USER)).find((x) => x.id === nueva.id)!;
    expect(sinOferta).toMatchObject({ ofertas: 0, mi_oferta: null });
  });

  it("cuando el cliente elige a otro, o se cancela, se lo dice por unos minutos", async () => {
    const elegido = await envio();
    await offer(db, TOQUE_USER, elegido.id);
    await offer(db, MOTO_USER, elegido.id);
    await choose(db, MOTO_USER, elegido.id);

    const perdido = (await available(TOQUE_USER)).find((x) => x.id === elegido.id)!;
    expect(perdido.resultado).toBe("chosen_other");
    // El que ganó lo ve en sus envíos en curso, no entre los disponibles.
    expect((await available(MOTO_USER)).map((x) => x.id)).not.toContain(elegido.id);

    const cancelado = await envio();
    await offer(db, TOQUE_USER, cancelado.id);
    await setStatus(ANA, cancelado.id, "cancelled");
    expect((await available(TOQUE_USER)).find((x) => x.id === cancelado.id)!.resultado).toBe("cancelled");

    // Pasado un rato, desaparecen.
    await db.exec("update courier_offers set closed_at = now() - interval '6 minutes'");
    const ids = (await available(TOQUE_USER)).map((x) => x.id);
    expect(ids).not.toContain(elegido.id);
    expect(ids).not.toContain(cancelado.id);
  });
});

describe("la elección del cliente — ENVIO-103 y 104", () => {
  it("el pedido queda con el repartidor, su precio y su motivo, y las ofertas se cierran", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id, 6500, "Fuera de zona");

    const r = await choose(db, MOTO_USER, o.id);
    expect(r.ok).toBe(true);

    expect(await row(o.id)).toMatchObject({
      courier_id: MOTO,
      courier_status: "accepted",
      delivery_fee_list: "5000.00",
      delivery_fee: "6500.00",
      delivery_fee_reason: "Fuera de zona",
    });
    expect((await offers(o.id)).every((f) => f.closed_at !== null)).toBe(true);

    const ev = await db.query<{ note: string }>(
      "select note from order_events where order_id = $1 and kind = 'delivery' order by note",
      [o.id],
    );
    expect(ev.rows.map((e) => e.note).some((n) => /^Envío elegido por el cliente: Moto Express, \d\d:\d\d$/.test(n))).toBe(
      true,
    );

    // El local puede entregárselo.
    for (const s of ["confirmed", "preparing", "ready", "handed_to_courier"]) {
      expect((await setStatus(ANA, o.id, s)).ok, s).toBe(true);
    }
  });

  it("no elige con el código de otro pedido ni con una oferta de otro pedido (P0020)", async () => {
    const a = await envio();
    const b = await envio();
    await offer(db, TOQUE_USER, a.id);
    await offer(db, TOQUE_USER, b.id);
    const ofertaDeB = (await db.query<{ id: string }>("select id from courier_offers where order_id = $1", [b.id]))
      .rows[0].id;

    const r = await call(null, `select public.public_choose_courier('${a.code}', '${ofertaDeB}')`);
    expect(code(r)).toBe("P0020");
    expect((await row(a.id)).courier_id).toBeNull();
    expect((await row(b.id)).courier_id).toBeNull();
  });

  it("un código inválido o inexistente da P0002", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    const id = (await offers(o.id)) && (await db.query<{ id: string }>("select id from courier_offers")).rows[0].id;
    for (const c of ["xx", "0".repeat(20)]) {
      const r = await call(null, `select public.public_choose_courier('${c}', '${id}')`);
      expect(code(r), c).toBe("P0002");
    }
  });

  it("si el repartidor cambió el precio mientras el cliente miraba, no elige (P0022)", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    const id = (await db.query<{ id: string }>("select id from courier_offers where order_id = $1", [o.id])).rows[0]
      .id;

    await offer(db, TOQUE_USER, o.id, 9000, "Subió la nafta");
    const viejo = await call(null, `select public.public_choose_courier('${o.code}', '${id}', 5000)`);
    expect(code(viejo)).toBe("P0022");
    expect((await row(o.id)).courier_id).toBeNull();

    const actual = await call(null, `select public.public_choose_courier('${o.code}', '${id}', 9000)`);
    expect(actual.ok).toBe(true);
    expect((await row(o.id)).delivery_fee).toBe("9000.00");
  });

  it("dos elecciones: gana una y la otra da P0020", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id);

    const primera = await choose(db, TOQUE_USER, o.id);
    const segunda = await choose(db, MOTO_USER, o.id);
    expect(primera.ok).toBe(true);
    expect(code(segunda)).toBe("P0020");
    expect((await row(o.id)).courier_id).toBe(TOQUE);
  });

  it("no elige un repartidor que se dio de baja", async () => {
    const o = await envio();
    await offer(db, MOTO_USER, o.id);
    await db.exec(`update couriers set active = false where id = '${MOTO}'`);
    expect(code(await choose(db, MOTO_USER, o.id))).toBe("P0020");
    await db.exec(`update couriers set active = true where id = '${MOTO}'`);
  });
});

describe("la elección automática — ENVIO-105 y 106", () => {
  it("antes de los 5 minutos no elige; a los 5, la más barata", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id, 6000, "Llueve");
    await offer(db, MOTO_USER, o.id, 4500, "Voy cerca");

    await age(o.id, 4);
    const antes = await delivery(o.code);
    expect(antes.estado).toBe("searching");
    expect(antes.ofertas).toHaveLength(2);
    expect((await row(o.id)).courier_id).toBeNull();

    await age(o.id, 2);
    const despues = await delivery(o.code);
    expect(despues).toMatchObject({ estado: "accepted", repartidor: "Moto Express", precio: 4500 });
    expect(despues.ofertas).toBeUndefined();
    expect(await row(o.id)).toMatchObject({ courier_id: MOTO, delivery_fee_reason: "Voy cerca" });

    const ev = await db.query<{ note: string }>(
      "select note from order_events where order_id = $1 and note like 'Envío asignado por la elección automática%'",
      [o.id],
    );
    expect(ev.rows).toHaveLength(1);
  });

  it("a igual precio gana el favorito del local; sin favorito elegido, Repartos al Toque; si ninguno es el favorito, la más vieja", async () => {
    await setFavorite(MOTO);
    const conFavorito = await envio();
    await offer(db, TOQUE_USER, conFavorito.id);
    await offer(db, MOTO_USER, conFavorito.id);
    await age(conFavorito.id, 6);
    await delivery(conFavorito.code);
    expect((await row(conFavorito.id)).courier_id).toBe(MOTO);

    // Sin favorito elegido vale el de por defecto (ENVIO-130), aunque la otra oferta sea más vieja.
    await setFavorite(null);
    const porDefecto = await envio();
    await offer(db, MOTO_USER, porDefecto.id);
    await db.exec(
      `update courier_offers set created_at = created_at - interval '10 seconds' where order_id = '${porDefecto.id}'`,
    );
    await offer(db, TOQUE_USER, porDefecto.id);
    await age(porDefecto.id, 6);
    await delivery(porDefecto.code);
    expect((await row(porDefecto.id)).courier_id).toBe(TOQUE);

    // El favorito elegido (Moto) no ofertó: entre Lejos y Toque, la más vieja.
    await setFavorite(MOTO);
    const ninguno = await envio("ana", "Oasis");
    await offer(db, LEJOS_USER, ninguno.id);
    await db.exec(
      `update courier_offers set created_at = created_at - interval '10 seconds' where order_id = '${ninguno.id}'`,
    );
    await offer(db, TOQUE_USER, ninguno.id);
    await age(ninguno.id, 6);
    await delivery(ninguno.code);
    expect((await row(ninguno.id)).courier_id).toBe(LEJOS);
    await setFavorite(null);
  });

  it("el favorito no le gana a una oferta más barata", async () => {
    await setFavorite(MOTO);
    const o = await envio();
    await offer(db, MOTO_USER, o.id);
    await offer(db, TOQUE_USER, o.id, 4000, "Estoy en la puerta");
    await age(o.id, 6);
    await delivery(o.code);
    expect((await row(o.id)).courier_id).toBe(TOQUE);
  });

  it("es idempotente y no toca un pedido ya resuelto", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id, 4000, "Cerca");
    await age(o.id, 6);

    await delivery(o.code);
    const una = await row(o.id);
    await delivery(o.code);
    await delivery(o.code);
    expect(await row(o.id)).toEqual(una);
    expect((await db.query("select 1 from order_events where order_id = $1 and note like 'Envío asignado%'", [o.id]))
      .rows).toHaveLength(1);
  });

  it("sin ofertas no elige nada, y ignora a los repartidores dados de baja", async () => {
    const vacio = await envio();
    await age(vacio.id, 30);
    expect((await delivery(vacio.code)).estado).toBe("searching");

    const o = await envio();
    await offer(db, MOTO_USER, o.id, 3000, "Barato");
    await offer(db, TOQUE_USER, o.id);
    await db.exec(`update couriers set active = false where id = '${MOTO}'`);
    await age(o.id, 6);
    await delivery(o.code);
    expect((await row(o.id)).courier_id).toBe(TOQUE);
    await db.exec(`update couriers set active = true where id = '${MOTO}'`);
  });

  it("también la resuelven el panel del repartidor y el del local, antes de leer", async () => {
    const a = await envio();
    await offer(db, TOQUE_USER, a.id);
    await age(a.id, 6);
    const lista = await call(MOTO_USER, "select public.courier_available_orders() as l");
    expect(lista.ok).toBe(true);
    expect((await row(a.id)).courier_id).toBe(TOQUE);

    const b = await envio();
    await offer(db, MOTO_USER, b.id);
    await age(b.id, 6);
    const local = await call(ANA, "select public.business_order_offers() as l");
    expect(local.ok).toBe(true);
    expect((await row(b.id)).courier_id).toBe(MOTO);

    const c = await envio();
    await offer(db, TOQUE_USER, c.id);
    await age(c.id, 6);
    expect((await call(ANA, "select public.settle_due_courier_offers()")).ok).toBe(true);
    expect((await row(c.id)).courier_id).toBe(TOQUE);
  });

  it("una oferta tardía no cambia lo elegido: el pedido se resuelve primero", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await age(o.id, 6);

    // La oferta tardía se rechaza (y la base, que deshace todo lo del llamado, resuelve en la próxima lectura).
    const tarde = await offer(db, MOTO_USER, o.id, 1000, "Más barato pero tarde");
    expect(code(tarde)).toBe("P0020");
    expect(await offers(o.id)).toHaveLength(1);

    expect((await delivery(o.code)).repartidor).toBe("Repartos al Toque");
    expect((await row(o.id)).courier_id).toBe(TOQUE);
  });

  it("solo la ve quien corresponde: un visitante no resuelve nada con settle_due_courier_offers", async () => {
    expect((await call(null, "select public.settle_due_courier_offers()")).ok).toBe(false);
    expect((await call(null, "select public.settle_courier_offers(gen_random_uuid())")).ok).toBe(false);
    expect((await call(ANA, "select public.settle_courier_offers(gen_random_uuid())")).ok).toBe(false);
  });
});

describe("devolver, cancelar y resolver desde el local — ENVIO-107 a 109", () => {
  it("devolver: las ofertas de los demás siguen y la cuenta de 5 minutos arranca de nuevo", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id, 6000, "Llueve");
    await offer(db, MOTO_USER, o.id, 5000);
    await choose(db, TOQUE_USER, o.id);
    expect((await row(o.id)).courier_id).toBe(TOQUE);
    expect((await offers(o.id)).every((f) => f.closed_at !== null)).toBe(true);

    // Pasaron 20 minutos desde las ofertas originales.
    await age(o.id, 20);

    const r = await call(TOQUE_USER, `select public.courier_return_order('${o.id}', 'other', 'Se me pinchó la moto')`);
    expect(r.ok).toBe(true);

    expect(await row(o.id)).toMatchObject({ courier_id: null, courier_status: "searching", delivery_fee: "5000.00" });
    // La oferta de quien devolvió se borró; la de Moto Express sigue, abierta.
    const left = await offers(o.id);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ courier_id: MOTO, closed_at: null });

    // La cuenta arranca desde la devolución: ahora no se elige sola...
    expect((await delivery(o.code)).estado).toBe("searching");
    // ...y el cliente puede elegir entre las que quedaron.
    const d = await delivery(o.code);
    expect(d.ofertas?.map((x) => x.repartidor)).toEqual(["Moto Express"]);
    expect(d.cierra_en).toBeTruthy();

    // A los 5 minutos de la devolución, se elige sola.
    await db.exec(`update orders set offered_at = offered_at - interval '6 minutes' where id = '${o.id}'`);
    expect((await delivery(o.code)).estado).toBe("accepted");
    expect((await row(o.id)).courier_id).toBe(MOTO);
  });

  it("devolver no deja volver a ofertar a quien lo devolvió, aunque el pedido siga buscando", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await choose(db, TOQUE_USER, o.id);
    await call(TOQUE_USER, `select public.courier_return_order('${o.id}', 'other', 'No llego')`);
    expect(code(await offer(db, TOQUE_USER, o.id))).toBe("P0020");
    expect((await offer(db, MOTO_USER, o.id)).ok).toBe(true);
  });

  it("cancelar cierra las ofertas abiertas sin borrarlas", async () => {
    const o = await envio();
    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id);

    expect((await setStatus(ANA, o.id, "cancelled")).ok).toBe(true);
    const all = await offers(o.id);
    expect(all).toHaveLength(2);
    expect(all.every((f) => f.closed_at !== null)).toBe(true);
    expect(code(await choose(db, TOQUE_USER, o.id))).toBe("P0020");
  });

  it("asignar a mano y 'lo llevo yo' cierran las ofertas abiertas", async () => {
    const a = await envio();
    await offer(db, TOQUE_USER, a.id);
    expect((await call(ANA, `select public.business_assign_courier('${a.id}', '${MOTO}')`)).ok).toBe(true);
    expect((await offers(a.id)).every((f) => f.closed_at !== null)).toBe(true);
    expect(code(await choose(db, TOQUE_USER, a.id))).toBe("P0020");
    expect((await row(a.id)).courier_id).toBe(MOTO);

    const b = await envio();
    await offer(db, TOQUE_USER, b.id);
    expect((await call(ANA, `select public.business_self_delivery('${b.id}')`)).ok).toBe(true);
    expect((await offers(b.id)).every((f) => f.closed_at !== null)).toBe(true);
    expect((await row(b.id)).courier_status).toBe("self");
  });
});

describe("lo que ve el cliente — ENVIO-110", () => {
  it("las ofertas, con el favorito primero y después por precio; sin teléfonos ni datos del cliente", async () => {
    await setFavorite(MOTO);
    const o = await envio();
    await offer(db, TOQUE_USER, o.id, 4000, "Estoy cerca");
    await offer(db, MOTO_USER, o.id, 5000);

    const d = await delivery(o.code);
    expect(d.estado).toBe("searching");
    expect(d.ofertas).toEqual([
      expect.objectContaining({ repartidor: "Moto Express", precio: 5000, favorito: true }),
      expect.objectContaining({ repartidor: "Repartos al Toque", precio: 4000, motivo: "Estoy cerca", favorito: false }),
    ]);
    expect(d.ofertas![0]).not.toHaveProperty("motivo");
    expect(d.cierra_en).toEqual(expect.any(String));
    expect(d).not.toHaveProperty("whatsapp");
    expect(d).not.toHaveProperty("repartidor");
    expect(JSON.stringify(d)).not.toMatch(/5493510000099|3515551234|Siempre Viva|Cliente Prueba/);
  });

  it("sin ofertas: lista vacía y sin cierre; elegido, su WhatsApp y nada más de los otros", async () => {
    const o = await envio();
    const vacio = await delivery(o.code);
    expect(vacio.ofertas).toEqual([]);
    expect(vacio).not.toHaveProperty("cierra_en");

    await offer(db, TOQUE_USER, o.id);
    await offer(db, MOTO_USER, o.id);
    await choose(db, MOTO_USER, o.id);
    const elegido = await delivery(o.code);
    expect(elegido).toMatchObject({ estado: "accepted", repartidor: "Moto Express", whatsapp: "5493510000099" });
    expect(elegido).not.toHaveProperty("ofertas");
  });

  it("las ordena con el favorito primero (por defecto, Repartos al Toque) y después por precio y antigüedad; el cierre es 5 minutos después de la primera", async () => {
    const o = await envio();
    await offer(db, MOTO_USER, o.id);
    await age(o.id, 1);
    await offer(db, TOQUE_USER, o.id);

    const d = await delivery(o.code);
    expect(d.ofertas!.map((x) => x.repartidor)).toEqual(["Repartos al Toque", "Moto Express"]);

    const first = (await db.query<{ t: Date }>("select min(created_at) t from courier_offers where order_id = $1", [o.id]))
      .rows[0].t;
    const closes = new Date(d.cierra_en as string).getTime();
    expect(closes - first.getTime()).toBe(5 * 60_000);
  });
});

describe("lo que ve el local — ENVIO-111", () => {
  it("las ofertas de sus pedidos buscando, con nombre, precio y cierre; nada de otros negocios", async () => {
    const o = await envio("ana");
    await offer(db, TOQUE_USER, o.id, 4500, "Cerca");
    await offer(db, MOTO_USER, o.id);
    const otro = await envio("beto");
    await offer(db, TOQUE_USER, otro.id);

    const r = await call(ANA, "select public.business_order_offers() as l");
    const lista = (r.ok ? r.rows[0].l : []) as {
      order_id: string;
      cierra_en: string;
      ofertas: { repartidor: string; precio: number; motivo: string | null }[];
    }[];

    const suyo = lista.find((x) => x.order_id === o.id)!;
    expect(suyo.ofertas.map((x) => [x.repartidor, x.precio])).toEqual([
      ["Repartos al Toque", 4500],
      ["Moto Express", 5000],
    ]);
    expect(suyo.cierra_en).toEqual(expect.any(String));
    expect(lista.map((x) => x.order_id)).not.toContain(otro.id);

    expect((await call(TOQUE_USER, "select public.business_order_offers() as l")).ok && true).toBe(true);
    expect((await call(null, "select public.business_order_offers()")).ok).toBe(false);
  });

  it("un repartidor o un negocio sin pedidos recibe una lista vacía", async () => {
    const r = await call(TOQUE_USER, "select public.business_order_offers() as l");
    expect(r.ok && r.rows[0].l).toEqual([]);
  });
});

describe("el favorito ya no tiene ventana — ENVIO-112", () => {
  it("las columnas viejas no existen y las preferencias no reciben minutos", async () => {
    const cols = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and column_name in ('offer_favorite_id', 'offer_favorite_until', 'favorite_minutes')`,
    );
    expect(cols.rows).toEqual([]);

    const zonas = await zoneId("Cantera");
    const ok = await call(ANA, `select public.save_delivery_preferences(array['${zonas}']::uuid[], '${MOTO}')`);
    expect(ok.ok).toBe(true);
    const fav = await db.query<{ favorite_courier_id: string }>(
      `select favorite_courier_id from business_settings where business_id = '${NEG_ANA}'`,
    );
    expect(fav.rows[0].favorite_courier_id).toBe(MOTO);

    const old = await call(ANA, `select public.set_courier_preferences('${MOTO}', 5)`);
    expect(old.ok).toBe(false);
  });
});

describe("el seguimiento sabe si es para retirar — SEGUIMIENTO-35", () => {
  it("public_order_tracking trae la entrega del pedido", async () => {
    const conEnvio = await envio();
    const t = await call(null, `select public.public_order_tracking('${conEnvio.code}') as t`);
    expect(t.ok && (t.rows[0].t as { pedido: { entrega: string } }).pedido.entrega).toBe("delivery");

    const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
    const r = await call(
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null, '${items}'::jsonb,
         p_customer_phone => '3515551234') as result`,
    );
    const c = r.ok ? (r.rows[0].result as { code: string }).code : "";
    const retiro = await call(null, `select public.public_order_tracking('${c}') as t`);
    expect(retiro.ok && (retiro.rows[0].t as { pedido: { entrega: string } }).pedido.entrega).toBe("retiro");
  });
});

describe("la migración — ENVIO-95", () => {
  it("los pedidos abiertos que esperaban pasan a buscar; los terminados no se tocan", async () => {
    const old = await createTestDb({ before: "20261023000000_ofertas_de_repartidor.sql" });

    try {
      await createUser(old, { id: ANA, email: "ana@x.com" });
      await old.exec(`
        insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
          ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
        insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
        insert into business_settings (business_id, published) values ('${NEG_ANA}', true);
        insert into delivery_zones (id, name, price, sort_order, active) values
          ('e0000000-0000-0000-0000-00000000000a', 'Zona migración', 1000, 99, true);
        insert into orders (id, business_id, order_number, status, total, customer_name, courier_status, delivery_zone_id) values
          ('f0000000-0000-0000-0000-000000000001', '${NEG_ANA}', '1', 'pending', 100, 'A', 'waiting', 'e0000000-0000-0000-0000-00000000000a'),
          ('f0000000-0000-0000-0000-000000000002', '${NEG_ANA}', '2', 'cancelled', 100, 'B', 'waiting', 'e0000000-0000-0000-0000-00000000000a'),
          ('f0000000-0000-0000-0000-000000000003', '${NEG_ANA}', '3', 'confirmed', 100, 'C', 'self', 'e0000000-0000-0000-0000-00000000000a');
      `);

      await applyMigration(old, "20261023000000_ofertas_de_repartidor.sql");

      const r = await old.query<{ order_number: string; courier_status: string; offered: boolean }>(
        "select order_number, courier_status, offered_at is not null as offered from orders order by order_number",
      );
      expect(r.rows).toEqual([
        { order_number: "1", courier_status: "searching", offered: true },
        { order_number: "2", courier_status: "waiting", offered: false },
        { order_number: "3", courier_status: "self", offered: false },
      ]);
    } finally {
      await old.close();
    }
  }, 60_000);
});

describe("anticipados y programados: se ofrecen al confirmar — ENVIO-121 a 125", () => {
  const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
  const openAllDay = Object.fromEntries(DAYS.map((d) => [d, ["00:00-23:59"]]));
  const setup = (sql: string) => db.exec(`update business_settings set ${sql} where business_id = '${NEG_ANA}'`);
  // Mediodía en Argentina (15:00 UTC) de un día fijo.
  const NOON = new Date("2026-10-14T15:00:00Z");

  // Un pedido con envío de Ana para más tarde: programado a una hora, o anticipado (el negocio está
  // cerrado todo el día de hoy y toma pedidos para mañana).
  async function paraMasTarde(kind: "programado" | "anticipado") {
    const tomorrow = DAYS[new Date().getDay() % 7];
    if (kind === "programado") {
      await setup(`schedule = '${JSON.stringify(openAllDay)}'::jsonb, allow_scheduled_orders = true`);
    } else {
      await setup(
        `preorders_enabled = true, schedule = '${JSON.stringify({ [tomorrow]: ["12:00-23:00"] })}'::jsonb,
         preorder_cutoffs = '${JSON.stringify({ [tomorrow]: { dia: tomorrow, hora: "00:00" } })}'::jsonb`,
      );
    }

    // La base exige que la hora programada sea de hoy (hora de Argentina). Con "ahora + 90 min" el test
    // fallaba de noche, así que el reloj queda fijo al mediodía mientras se crea el pedido.
    const extra =
      kind === "programado"
        ? `, p_scheduled_for => '${new Date(NOON.getTime() + 90 * 60_000).toISOString()}'::timestamptz`
        : ", p_preorder => true";
    const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
    const sql = `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null,
         '${items}'::jsonb${extra}, p_delivery_zone => '${await zoneId("Cantera")}'::uuid,
         p_customer_phone => '351 555-1234', p_delivery_address => 'Av. Siempre Viva 742') as result`;
    if (kind === "programado") vi.useFakeTimers({ toFake: ["Date"], now: NOON });
    let r: Awaited<ReturnType<typeof call>>;
    try {
      r = await call(null, sql);
    } finally {
      vi.useRealTimers();
    }
    await setup("preorders_enabled = false, preorder_cutoffs = '{}'::jsonb, schedule = '{}'::jsonb");
    if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
    const c = (r.rows[0].result as { code: string }).code;
    const id = (await db.query<{ id: string }>("select id from orders where code = $1", [c])).rows[0].id;
    return { id, code: c };
  }

  const visibleFor = async (user: string, id: string) => {
    const r = await call(user, "select public.courier_available_orders() as l");
    if (!r.ok) throw new Error(r.error);
    return (r.rows[0].l as { id: string }[]).some((o) => o.id === id);
  };

  it.each(["anticipado", "programado"] as const)(
    "un pedido %s no se ofrece hasta que el local lo confirma, y después sí",
    async (kind) => {
      const o = await paraMasTarde(kind);

      const waiting = await row(o.id);
      expect(waiting.courier_status).toBe("waiting");
      expect(waiting.offered_at).toBeNull();
      expect(await visibleFor(TOQUE_USER, o.id)).toBe(false);
      expect(code(await offer(db, TOQUE_USER, o.id))).toBe("P0020");

      expect((await setStatus(ANA, o.id, "confirmed")).ok).toBe(true);

      const open = await row(o.id);
      expect(open.courier_status).toBe("searching");
      expect(open.offered_at).not.toBeNull();
      expect(await visibleFor(TOQUE_USER, o.id)).toBe(true);
      expect((await offer(db, TOQUE_USER, o.id)).ok).toBe(true);
    },
  );

  it("cancelarlo antes de confirmar no abre la búsqueda", async () => {
    const o = await paraMasTarde("programado");
    expect((await setStatus(ANA, o.id, "cancelled")).ok).toBe(true);

    expect((await row(o.id)).courier_status).toBe("waiting");
    expect(code(await offer(db, TOQUE_USER, o.id))).toBe("P0020");
  });

  it("los 5 minutos de la elección automática cuentan desde la primera oferta", async () => {
    const o = await paraMasTarde("anticipado");
    await setStatus(ANA, o.id, "confirmed");
    await age(o.id, 10);
    expect((await offer(db, TOQUE_USER, o.id)).ok).toBe(true);

    // Recién ofertó: la ventana corre desde la oferta, no desde la confirmación.
    await call(ANA, "select public.business_order_offers()");
    expect((await row(o.id)).courier_status).toBe("searching");

    await age(o.id, 6);
    await call(ANA, "select public.business_order_offers()");
    const after = await row(o.id);
    expect(after.courier_status).toBe("accepted");
    expect(after.courier_id).toBe(TOQUE);
  });

  it("un pedido común se ofrece apenas se crea", async () => {
    const o = await envio();
    const r = await row(o.id);

    expect(r.courier_status).toBe("searching");
    expect(r.offered_at).not.toBeNull();
    expect(await visibleFor(TOQUE_USER, o.id)).toBe(true);
  });

  it("la migración pasa a esperar los anticipados y programados pendientes sin ofertas", async () => {
    const old = await createTestDb({ before: "20261024000000_ofertas_al_confirmar_anticipados.sql" });

    try {
      await createUser(old, { id: ANA, email: "ana@x.com" });
      await old.exec(`
        insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
          ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
        insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
        insert into business_settings (business_id, published) values ('${NEG_ANA}', true);
        insert into delivery_zones (id, name, price, sort_order, active) values
          ('e0000000-0000-0000-0000-00000000000a', 'Zona migración', 1000, 99, true);
        insert into orders (id, business_id, order_number, status, total, customer_name, courier_status,
                            offered_at, delivery_zone_id, preorder, scheduled_for) values
          ('f0000000-0000-0000-0000-000000000001', '${NEG_ANA}', '1', 'pending', 100, 'A', 'searching', now(), 'e0000000-0000-0000-0000-00000000000a', true, null),
          ('f0000000-0000-0000-0000-000000000002', '${NEG_ANA}', '2', 'pending', 100, 'B', 'searching', now(), 'e0000000-0000-0000-0000-00000000000a', false, now() + interval '2 hours'),
          ('f0000000-0000-0000-0000-000000000003', '${NEG_ANA}', '3', 'pending', 100, 'C', 'searching', now(), 'e0000000-0000-0000-0000-00000000000a', false, null),
          ('f0000000-0000-0000-0000-000000000004', '${NEG_ANA}', '4', 'confirmed', 100, 'D', 'searching', now(), 'e0000000-0000-0000-0000-00000000000a', true, null),
          ('f0000000-0000-0000-0000-000000000005', '${NEG_ANA}', '5', 'pending', 100, 'E', 'searching', now(), 'e0000000-0000-0000-0000-00000000000a', true, null);
        insert into courier_offers (order_id, courier_id, price) values
          ('f0000000-0000-0000-0000-000000000005', '${TOQUE}', 1000);
      `);

      await applyMigration(old, "20261024000000_ofertas_al_confirmar_anticipados.sql");

      const r = await old.query<{ order_number: string; courier_status: string; offered: boolean }>(
        "select order_number, courier_status, offered_at is not null as offered from orders order by order_number",
      );
      expect(r.rows).toEqual([
        { order_number: "1", courier_status: "waiting", offered: false },
        { order_number: "2", courier_status: "waiting", offered: false },
        { order_number: "3", courier_status: "searching", offered: true },
        { order_number: "4", courier_status: "searching", offered: true },
        { order_number: "5", courier_status: "searching", offered: true },
      ]);
    } finally {
      await old.close();
    }
  }, 60_000);
});
