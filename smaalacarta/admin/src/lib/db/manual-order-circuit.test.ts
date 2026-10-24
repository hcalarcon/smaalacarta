// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { choose, offer } from "@/test/offers";

// ADMIN-PEDIDOS-39 a 46 y ENVIO-137 a 141 contra Postgres real: el pedido manual entra al circuito.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETO = "bbbbbbbb-0000-0000-0000-000000000002";
const TOQUE_USER = "cccccccc-0000-0000-0000-000000000003";
const MOTO_USER = "cccccccc-0000-0000-0000-000000000006";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const NEG_BETO = "b2b2b2b2-0000-0000-0000-000000000002";
const NEG_SIN_ENVIO = "c3c3c3c3-0000-0000-0000-000000000003";
const SIN_ENVIO_USER = "dddddddd-0000-0000-0000-000000000004";
const TOQUE = "7a0c0e00-0000-4000-8000-000000000001";
const MOTO = "7a0c0e00-0000-4000-8000-000000000002";

const CAT = "c1000000-0000-0000-0000-000000000001";
const CAFE = "d1000000-0000-0000-0000-000000000001"; // $1000
const HAMB = "d1000000-0000-0000-0000-000000000002"; // $5000 con un grupo obligatorio y un extra
const AGOTADO = "d1000000-0000-0000-0000-000000000003";
const FERNET = "d2000000-0000-0000-0000-000000000001"; // de Beto
const GRUPO_PUNTO = "a0000000-0000-0000-0000-000000000001";
const GRUPO_EXTRAS = "a0000000-0000-0000-0000-000000000002";
const JUGOSO = "b0000000-0000-0000-0000-000000000001";
const QUESO = "b0000000-0000-0000-0000-000000000002"; // +$500

let db: TestDb;

const sqlText = (value: string | null) => (value === null ? "null" : "'" + value.replace(/'/g, "''") + "'");

async function zoneId(name: string) {
  return (await db.query<{ id: string }>("select id from delivery_zones where name = $1", [name])).rows[0].id;
}

type Extra = {
  business?: string;
  name?: string;
  delivery?: string | null;
  payment?: string | null;
  phone?: string | null;
  zone?: string | null;
  address?: string | null;
  mode?: string | null;
};

type Created = { id: string; code: string; number: number; total: number };

function manual(user: string | null, items: unknown[], extra: Extra = {}) {
  return asUser(
    db,
    user,
    `select public.create_manual_order(
       '${extra.business ?? NEG_ANA}',
       ${sqlText(extra.name ?? "Cliente Mostrador")},
       ${sqlText(extra.delivery === undefined ? "retiro" : extra.delivery)},
       ${sqlText(extra.payment === undefined ? "efectivo" : extra.payment)},
       null,
       ${sqlText(JSON.stringify(items))}::jsonb,
       p_customer_phone => ${sqlText(extra.phone === undefined ? null : extra.phone)},
       p_delivery_zone => ${extra.zone ? `'${extra.zone}'::uuid` : "null"},
       p_delivery_address => ${sqlText(extra.address === undefined ? null : extra.address)},
       p_courier_mode => ${sqlText(extra.mode === undefined ? null : extra.mode)}) as result`,
  );
}

const cafe = [{ id: CAFE, kind: "product", quantity: 1 }];
// Para el negocio sin menú cargado.
const libre = [{ name: "Menú del día", unit_price: 4000, quantity: 1 }];

// Un envío con repartidor de Ana, con todo lo necesario salvo el modo.
async function envio(mode: string | null, extra: Extra = {}) {
  return manual(ANA, cafe, {
    delivery: "delivery",
    phone: "351 555-1234",
    zone: await zoneId("Cantera"),
    address: "Av. Siempre Viva 742",
    mode,
    ...extra,
  });
}

function createdOf(r: Awaited<ReturnType<typeof manual>>) {
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  return r.rows[0].result as Created;
}

async function row(id: string) {
  return (
    await db.query<Record<string, unknown>>(
      `select status, source, payment_status, delivery, payment, customer_phone, delivery_address,
              delivery_zone_name, delivery_fee_list, delivery_fee, courier_id, courier_status, offered_at,
              courier_responded_at, total
       from orders where id = $1`,
      [id],
    )
  ).rows[0];
}

async function available(user: string) {
  const r = await asUser(db, user, "select public.courier_available_orders() as l");
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].l as { id: string }[];
}

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: BETO, email: "beto@x.com" });
  await createUser(db, { id: TOQUE_USER, email: "toque@x.com" });
  await createUser(db, { id: MOTO_USER, email: "moto@x.com" });
  await createUser(db, { id: SIN_ENVIO_USER, email: "sin@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true),
      ('${NEG_BETO}', 'Beto Bar', 'beto', '5493510000002', true, true),
      ('${NEG_SIN_ENVIO}', 'Sin Envío', 'sinenvio', '5493510000003', true, false);
    insert into business_users (business_id, user_id) values
      ('${NEG_ANA}', '${ANA}'), ('${NEG_BETO}', '${BETO}'), ('${NEG_SIN_ENVIO}', '${SIN_ENVIO_USER}');
    insert into business_settings (business_id, published, payment_options) values
      ('${NEG_ANA}', true, '{efectivo,transferencia}'),
      ('${NEG_BETO}', true, '{efectivo,transferencia,tarjeta}'),
      ('${NEG_SIN_ENVIO}', true, '{efectivo}');

    insert into categories (id, business_id, name, active) values
      ('${CAT}', '${NEG_ANA}', 'Comidas', true),
      ('c2000000-0000-0000-0000-000000000001', '${NEG_BETO}', 'Tragos', true);
    insert into products (id, business_id, category_id, name, price, active, sold_out) values
      ('${CAFE}', '${NEG_ANA}', '${CAT}', 'Café', 1000, true, false),
      ('${HAMB}', '${NEG_ANA}', '${CAT}', 'Hamburguesa', 5000, true, false),
      ('${AGOTADO}', '${NEG_ANA}', '${CAT}', 'Agotado', 100, true, true),
      ('${FERNET}', '${NEG_BETO}', 'c2000000-0000-0000-0000-000000000001', 'Fernet', 2500, true, false);

    insert into option_groups (id, business_id, name, min_select, max_select, allow_repeat, active, sort_order) values
      ('${GRUPO_PUNTO}', '${NEG_ANA}', 'Punto', 1, 1, false, true, 0),
      ('${GRUPO_EXTRAS}', '${NEG_ANA}', 'Extras', 0, 3, false, true, 1);
    insert into options (id, group_id, business_id, name, price_delta, active, sold_out, sort_order) values
      ('${JUGOSO}', '${GRUPO_PUNTO}', '${NEG_ANA}', 'Jugoso', 0, true, false, 0),
      ('${QUESO}', '${GRUPO_EXTRAS}', '${NEG_ANA}', 'Queso', 500, true, false, 0);
    insert into product_option_groups (product_id, group_id, business_id, sort_order) values
      ('${HAMB}', '${GRUPO_PUNTO}', '${NEG_ANA}', 0), ('${HAMB}', '${GRUPO_EXTRAS}', '${NEG_ANA}', 1);

    -- Repartos al Toque ya existe y cubre todas las zonas; Moto Express cubre Centro y Cantera.
    insert into courier_users (courier_id, user_id) values ('${TOQUE}', '${TOQUE_USER}');
    insert into couriers (id, name, whatsapp, active) values ('${MOTO}', 'Moto Express', '5493510000099', true);
    insert into courier_users (courier_id, user_id) values ('${MOTO}', '${MOTO_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select '${MOTO}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera');

    -- Ana envía a Centro, Cantera y Oasis; Beto, a Cantera.
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name in ('Centro (hasta Av. Koessler)', 'Cantera', 'Oasis');
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_BETO}', id from delivery_zones where name = 'Cantera';
  `);
}, 60_000);

beforeEach(async () => {
  await db.exec(`update business_settings set favorite_courier_id = null where business_id = '${NEG_ANA}'`);
});

afterAll(async () => {
  await db.close();
});

describe("nace confirmado — ADMIN-PEDIDOS-39", () => {
  it("queda confirmado, manual, sin cobro en línea y con los eventos de un pedido aceptado", async () => {
    const c = createdOf(await manual(ANA, cafe));
    const r = await row(c.id);

    expect(r).toMatchObject({ status: "confirmed", source: "manual", payment_status: "not_required" });

    const events = await db.query<{ status: string; kind: string }>(
      "select status, kind from order_events where order_id = $1 order by created_at, id",
      [c.id],
    );
    expect(events.rows).toEqual([
      { status: "pending", kind: "status" },
      { status: "confirmed", kind: "status" },
    ]);
  });

  it("un pedido manual de retiro no abre ninguna búsqueda de repartidor", async () => {
    const c = createdOf(await manual(ANA, cafe, { delivery: "retiro" }));
    expect(await row(c.id)).toMatchObject({ courier_id: null, courier_status: null, offered_at: null });
  });

  it("un pedido manual no le avisa al local: queda con source = manual", async () => {
    const c = createdOf(await manual(ANA, cafe));
    expect((await row(c.id)).source).toBe("manual");
  });
});

describe("productos del menú con el precio de la base — ADMIN-PEDIDOS-40 y 41", () => {
  it("el precio sale de la base, con las opciones y los extras", async () => {
    const r = await manual(ANA, [
      {
        id: HAMB,
        kind: "product",
        quantity: 2,
        options: [{ id: JUGOSO, quantity: 1 }, { id: QUESO, quantity: 1 }],
        note: "  sin   cebolla ",
      },
    ]);
    const c = createdOf(r);

    expect(Number((await row(c.id)).total)).toBe(11000);

    const items = await db.query<{ name: string; unit_price: string; options: unknown; note: string; free: boolean }>(
      "select name, unit_price, options, note, free from order_items where order_id = $1",
      [c.id],
    );
    expect(items.rows[0]).toMatchObject({ name: "Hamburguesa", unit_price: "5500.00", note: "sin cebolla", free: false });
    expect(items.rows[0].options).toContainEqual({ grupo: "Extras", nombre: "Queso", cantidad: 1, precio: 500 });
  });

  it("un precio mandado por el navegador junto al id se ignora", async () => {
    const c = createdOf(await manual(ANA, [{ id: CAFE, kind: "product", quantity: 3, unit_price: 1, price: 1 }]));
    expect(Number((await row(c.id)).total)).toBe(3000);
  });

  it("exige las opciones obligatorias, como el menú (P0014)", async () => {
    const r = await manual(ANA, [{ id: HAMB, kind: "product", quantity: 1 }]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0014");
  });

  it("no deja pedir un producto sin stock (P0009) ni de otro negocio (P0001)", async () => {
    const agotado = await manual(ANA, [{ id: AGOTADO, kind: "product", quantity: 1 }]);
    const ajeno = await manual(ANA, [{ id: FERNET, kind: "product", quantity: 1 }]);

    expect(!agotado.ok && agotado.code).toBe("P0009");
    expect(!ajeno.ok && ajeno.code).toBe("P0001");
  });

  it("el menú no acepta ítems libres: sigue pidiendo un id", async () => {
    const r = await asUser(
      db,
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null,
         '[{"name":"Libre","unit_price":1,"quantity":1}]'::jsonb, p_customer_phone => '3515551234')`,
    );
    expect(r.ok).toBe(false);
  });
});

describe("producto libre — ADMIN-PEDIDOS-42", () => {
  it("queda marcado como libre y suma al total junto con los del menú", async () => {
    const c = createdOf(
      await manual(ANA, [
        { id: CAFE, kind: "product", quantity: 1 },
        { name: "  Torta de la casa ", unit_price: 2500.5, quantity: 2, note: "con vela" },
      ]),
    );

    expect(Number((await row(c.id)).total)).toBe(6001);

    const items = await db.query<{ name: string; free: boolean; product_id: string | null; note: string | null }>(
      "select name, free, product_id, note from order_items where order_id = $1 order by sort_order",
      [c.id],
    );
    expect(items.rows).toEqual([
      { name: "Café", free: false, product_id: CAFE, note: null },
      { name: "Torta de la casa", free: true, product_id: null, note: "con vela" },
    ]);
  });

  it.each([
    ["con un nombre vacío", { name: "", unit_price: 1, quantity: 1 }],
    ["con un precio negativo", { name: "a", unit_price: -1, quantity: 1 }],
    ["con cantidad 0", { name: "a", unit_price: 1, quantity: 0 }],
    ["con un precio que no es número", { name: "a", unit_price: "gratis", quantity: 1 }],
  ])("rechaza un libre %s", async (_caso, item) => {
    const r = await manual(ANA, [item]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("22023");
  });
});

describe("entrega y pago fijos — ADMIN-PEDIDOS-43 y 44", () => {
  it("el consumo en el local se acepta aunque el negocio no lo tenga en su configuración", async () => {
    const c = createdOf(await manual(ANA, cafe, { delivery: "local" }));
    expect(await row(c.id)).toMatchObject({ delivery: "local", status: "confirmed", courier_status: null });
  });

  it("el pago QR se acepta en el pedido manual y no en el menú (P0008)", async () => {
    const c = createdOf(await manual(ANA, cafe, { delivery: "local", payment: "qr" }));
    expect((await row(c.id)).payment).toBe("qr");

    const publico = await asUser(
      db,
      null,
      `select public.create_public_order('ana', 'Cliente', 'retiro', 'qr', null,
         '[{"id":"${CAFE}","kind":"product","quantity":1}]'::jsonb, p_customer_phone => '3515551234')`,
    );
    expect(!publico.ok && publico.code).toBe("P0008");
  });

  it("no acepta un medio de pago que el negocio no tiene (P0008), ni Mercado Pago", async () => {
    const tarjeta = await manual(ANA, cafe, { payment: "tarjeta" }); // Ana no la habilitó
    const mp = await manual(ANA, cafe, { payment: "mercadopago" });

    expect(!tarjeta.ok && tarjeta.code).toBe("P0008");
    expect(!mp.ok && mp.code).toBe("P0008");
  });

  it("no acepta texto libre en la entrega ni en el pago", async () => {
    const entrega = await manual(ANA, cafe, { delivery: "mostrador" });
    const pago = await manual(ANA, cafe, { payment: "cripto" });

    expect(!entrega.ok && entrega.code).toBe("P0007");
    expect(!pago.ok && pago.code).toBe("P0008");
  });

  it("exige elegir entrega y pago", async () => {
    expect((await manual(ANA, cafe, { delivery: null })).ok).toBe(false);
    expect((await manual(ANA, cafe, { payment: null })).ok).toBe(false);
  });
});

describe("teléfono — ADMIN-PEDIDOS-45", () => {
  it("es obligatorio con envío (P0018), también sin repartidores en el negocio", async () => {
    const conRepartidor = await envio("offers", { phone: null });
    const sinRepartidor = await manual(SIN_ENVIO_USER, libre, {
      business: NEG_SIN_ENVIO,
      delivery: "delivery",
      phone: null,
    });

    expect(!conRepartidor.ok && conRepartidor.code).toBe("P0018");
    expect(!sinRepartidor.ok && sinRepartidor.code).toBe("P0018");
  });

  it("es opcional en retiro y en consumo en el local", async () => {
    const retiro = createdOf(await manual(ANA, cafe, { delivery: "retiro", phone: null }));
    const local = createdOf(await manual(ANA, cafe, { delivery: "local", phone: "" }));

    expect((await row(retiro.id)).customer_phone).toBeNull();
    expect((await row(local.id)).customer_phone).toBeNull();
  });

  it("si se carga, tiene que ser válido, y se guarda solo con dígitos", async () => {
    const corto = await manual(ANA, cafe, { phone: "123" });
    expect(!corto.ok && corto.code).toBe("P0018");

    const c = createdOf(await manual(ANA, cafe, { phone: "351 555-1234" }));
    expect((await row(c.id)).customer_phone).toBe("3515551234");
  });
});

describe("envío con repartidor — ENVIO-137 a 141", () => {
  it("con 'buscar repartidor' abre las ofertas y los repartidores lo ven", async () => {
    const c = createdOf(await envio("offers"));
    const r = await row(c.id);

    expect(r).toMatchObject({
      status: "confirmed",
      courier_id: null,
      courier_status: "searching",
      delivery_zone_name: "Cantera",
      delivery_address: "Av. Siempre Viva 742",
      customer_phone: "3515551234",
    });
    expect(r.offered_at).not.toBeNull();
    expect(Number(r.delivery_fee)).toBe(Number(r.delivery_fee_list));

    expect((await available(TOQUE_USER)).some((o) => o.id === c.id)).toBe(true);
    expect((await available(MOTO_USER)).some((o) => o.id === c.id)).toBe(true);
  });

  it("con 'buscar repartidor' el cliente elige desde el seguimiento, como en cualquier pedido", async () => {
    const c = createdOf(await envio("offers"));

    expect((await offer(db, MOTO_USER, c.id)).ok).toBe(true);
    expect((await choose(db, MOTO_USER, c.id)).ok).toBe(true);

    expect(await row(c.id)).toMatchObject({ courier_id: MOTO, courier_status: "accepted" });
  });

  it("con 'asignar a mi favorito' va directo a su favorito, sin ofertas", async () => {
    await db.exec(`update business_settings set favorite_courier_id = '${MOTO}' where business_id = '${NEG_ANA}'`);
    const c = createdOf(await envio("favorite"));
    const r = await row(c.id);

    expect(r).toMatchObject({ courier_id: MOTO, courier_status: "accepted", status: "confirmed" });
    expect(r.courier_responded_at).not.toBeNull();
    expect(r.offered_at).toBeNull();

    // El favorito lo ve como suyo y nadie más lo ve para ofertar.
    expect((await available(TOQUE_USER)).some((o) => o.id === c.id)).toBe(false);
    const propios = await asUser(db, MOTO_USER, "select public.courier_orders() as l");
    expect(propios.ok && (propios.rows[0].l as { id: string }[]).some((o) => o.id === c.id)).toBe(true);

    const note = await db.query<{ note: string }>(
      "select note from order_events where order_id = $1 and kind = 'delivery'",
      [c.id],
    );
    expect(note.rows[0].note).toMatch(/^Envío asignado a Moto Express, \d\d:\d\d$/);
  });

  it("sin favorito elegido no hay a quién asignar: falla (P0016), sin repartidor por defecto (ENVIO-254)", async () => {
    const r = await envio("favorite");
    expect(!r.ok && r.code).toBe("P0016");
  });

  it("'asignar a mi favorito' falla si el favorito no cubre el barrio (P0016)", async () => {
    await db.exec(`update business_settings set favorite_courier_id = '${MOTO}' where business_id = '${NEG_ANA}'`);
    const r = await envio("favorite", { zone: await zoneId("Oasis") }); // Moto Express no cubre Oasis

    expect(!r.ok && r.code).toBe("P0016");
  });

  it("con 'lo llevo yo' queda a cargo del local, sin repartidor", async () => {
    const c = createdOf(await envio("self"));
    const r = await row(c.id);

    expect(r).toMatchObject({ courier_id: null, courier_status: "self", status: "confirmed" });
    expect((await available(TOQUE_USER)).some((o) => o.id === c.id)).toBe(false);
  });

  it("pide barrio, dirección y modo", async () => {
    const sinBarrio = await envio("offers", { zone: null });
    const sinDireccion = await envio("offers", { address: "" });
    const sinModo = await envio(null);
    const modoRaro = await envio("rapido");

    expect(!sinBarrio.ok && sinBarrio.code).toBe("P0016");
    expect(!sinDireccion.ok && sinDireccion.code).toBe("22023");
    expect(!sinModo.ok && sinModo.code).toBe("22023");
    expect(!modoRaro.ok && modoRaro.code).toBe("22023");
  });

  it("un barrio que el local no tildó se rechaza (P0016)", async () => {
    // Ana envía a Centro, Cantera y Oasis; "Villa Parque" no está entre sus zonas.
    const otra = await db.query<{ id: string }>(
      `select z.id from delivery_zones z
       where z.active and not exists (
         select 1 from business_delivery_zones bz where bz.business_id = '${NEG_ANA}' and bz.zone_id = z.id)
       limit 1`,
    );
    const r = await envio("offers", { zone: otra.rows[0].id });

    expect(!r.ok && r.code).toBe("P0016");
  });

  it("un barrio con el envío desactivado en el negocio se rechaza (P0016)", async () => {
    const r = await manual(SIN_ENVIO_USER, libre, {
      business: NEG_SIN_ENVIO,
      delivery: "delivery",
      phone: "3515551234",
      zone: await zoneId("Cantera"),
      address: "Av. Siempre Viva 742",
      mode: "offers",
    });

    expect(!r.ok && r.code).toBe("P0016");
  });

  it("un barrio sin entrega con repartidor (retiro) se rechaza (P0016)", async () => {
    const r = await manual(ANA, cafe, { delivery: "retiro", zone: await zoneId("Cantera") });
    expect(!r.ok && r.code).toBe("P0016");
  });

  it("un negocio sin repartidores carga el envío igual: sin barrio ni circuito", async () => {
    const r = await manual(SIN_ENVIO_USER, libre, {
      business: NEG_SIN_ENVIO,
      delivery: "delivery",
      phone: "3515551234",
      address: "Mitre 10",
    });
    const c = createdOf(r);

    expect(await row(c.id)).toMatchObject({ delivery: "delivery", courier_status: null, status: "confirmed" });
  });
});

describe("quién puede cargar — ADMIN-PEDIDOS-46", () => {
  it("un no-miembro no puede cargar en un negocio ajeno (42501)", async () => {
    const r = await manual(ANA, [{ id: FERNET, kind: "product", quantity: 1 }], { business: NEG_BETO });

    expect(!r.ok && r.code).toBe("42501");
  });

  it("sin sesión tampoco (42501)", async () => {
    const r = await manual(null, cafe);
    expect(!r.ok && r.code).toBe("42501");
  });

  it("no queda ningún pedido cuando se rechaza", async () => {
    const antes = (await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n;
    await envio("offers", { phone: null });
    await manual(ANA, [{ id: AGOTADO, kind: "product", quantity: 1 }]);
    const despues = (await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n;

    expect(despues).toBe(antes);
  });
});
