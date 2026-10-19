// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asService, asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { offer, openSearch } from "@/test/offers";

// ENVIO-186 a 189 contra Postgres real: lo que el /code-review de la tarea 33 dejó pendiente, con el
// interruptor "Exigir términos a repartidores" prendido y apagado.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const UNO_USER = "cccccccc-0000-0000-0000-000000000006";
const DOS_USER = "cccccccc-0000-0000-0000-000000000007";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const UNO = "7a0c0e00-0000-4000-8000-000000000002";
const DOS = "7a0c0e00-0000-4000-8000-000000000003";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const setRequired = (on: boolean) => db.exec(`update platform_settings set courier_terms_required = ${on}`);
const accept = (user: string, version = 1) => call(user, `select public.courier_accept_terms(${version})`);

async function envio() {
  const zone = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 2 }]);
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', 'delivery', 'efectivo', null, '${items}'::jsonb,
       p_delivery_zone => '${zone}'::uuid, p_customer_phone => '3515551234',
       p_delivery_address => 'Av. Siempre Viva 742') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  await openSearch(db, o.id);
  return o.id;
}

const courierOf = async (orderId: string) =>
  (await db.query<{ courier_id: string | null }>("select courier_id from orders where id = $1", [orderId])).rows[0]
    .courier_id;

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "offers", courierTerms: true });

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: UNO_USER, email: "uno@x.com" });
  await createUser(db, { id: DOS_USER, email: "dos@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo, courier_delivery) values
      ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true, true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published, address) values ('${NEG_ANA}', true, 'San Martín 100');
    insert into categories (id, business_id, name, active) values
      ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas', true);
    insert into products (id, business_id, category_id, name, price, active) values
      ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000, true);
    insert into couriers (id, name, whatsapp, active) values
      ('${UNO}', 'Uno Express', '5493510000099', true),
      ('${DOS}', 'Dos Express', '5493510000098', true);
    insert into courier_users (courier_id, user_id) values ('${UNO}', '${UNO_USER}'), ('${DOS}', '${DOS_USER}');
    insert into courier_zone_coverage (courier_id, zone_id)
      select c, id from delivery_zones, (values ('${UNO}'::uuid), ('${DOS}'::uuid)) v(c) where name = 'Cantera';
    delete from business_delivery_zones;
    insert into business_delivery_zones (business_id, zone_id)
      select '${NEG_ANA}', id from delivery_zones where name = 'Cantera';
  `);
}, 60_000);

beforeEach(async () => {
  // El freno de 20 pedidos por minuto.
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await db.exec("update platform_settings set courier_terms_version = 1");
  await db.exec("delete from courier_terms_acceptances");
  await setRequired(true);
});

afterAll(async () => {
  await db.close();
});

describe("el aviso de pedido nuevo — ENVIO-186", () => {
  const eligible = async () => {
    const r = await asService(db, `select public.courier_push_eligible(array['${UNO}', '${DOS}']::uuid[]) as ids`);
    if (!r.ok) throw new Error(r.error);
    return (r.rows[0].ids as string[]).sort();
  };

  it("no le llega a quien no aceptó la versión vigente", async () => {
    expect(await eligible()).toEqual([]);
    await accept(UNO_USER);
    expect(await eligible()).toEqual([UNO]);
  });

  it("subir la versión lo saca hasta que acepte la nueva", async () => {
    await accept(UNO_USER);
    await db.exec("update platform_settings set courier_terms_version = 2");
    expect(await eligible()).toEqual([]);
    await accept(UNO_USER, 2);
    expect(await eligible()).toEqual([UNO]);
  });

  it("con el interruptor apagado les llega a todos", async () => {
    await setRequired(false);
    expect(await eligible()).toEqual([UNO, DOS].sort());
  });

  it("solo la clave de servicio la puede llamar", async () => {
    const r = await call(UNO_USER, `select public.courier_push_eligible(array['${UNO}']::uuid[])`);
    expect(r.ok).toBe(false);
  });
});

describe("la elección automática — ENVIO-187", () => {
  async function conOfertas() {
    await accept(UNO_USER);
    await accept(DOS_USER);
    const id = await envio();
    // DOS es más barato; UNO ofertó al precio de lista.
    expect((await offer(db, UNO_USER, id)).ok).toBe(true);
    const list = (await db.query<{ p: string }>("select delivery_fee_list as p from orders where id = $1", [id])).rows[0]
      .p;
    expect((await offer(db, DOS_USER, id, Number(list) - 10, "Voy cerca")).ok).toBe(true);
    // Se sube la versión con las ofertas abiertas; solo UNO acepta la nueva.
    await db.exec("update platform_settings set courier_terms_version = 2");
    await accept(UNO_USER, 2);
    await db.exec(`
      update courier_offers set created_at = created_at - interval '10 minutes' where order_id = '${id}';
      update orders set offered_at = offered_at - interval '10 minutes' where id = '${id}';
    `);
    return id;
  }

  it("ignora la oferta de quien no aceptó la versión vigente", async () => {
    const id = await conOfertas();
    await db.query("select public.settle_courier_offers($1)", [id]);
    expect(await courierOf(id)).toBe(UNO);
  });

  it("con el interruptor apagado elige la más barata", async () => {
    const id = await conOfertas();
    await setRequired(false);
    await db.query("select public.settle_courier_offers($1)", [id]);
    expect(await courierOf(id)).toBe(DOS);
  });
});

describe("la asignación a mano — ENVIO-188", () => {
  const assign = (id: string, courier: string) => call(ANA, `select public.business_assign_courier('${id}', '${courier}')`);

  it("no deja asignar a quien no aceptó (P0026); después de aceptar, sí", async () => {
    const id = await envio();

    const sin = await assign(id, UNO);
    expect(!sin.ok && sin.code).toBe("P0026");
    expect(await courierOf(id)).toBeNull();

    await accept(UNO_USER);
    expect((await assign(id, UNO)).ok).toBe(true);
    expect(await courierOf(id)).toBe(UNO);
  });

  it("con el interruptor apagado asigna igual", async () => {
    await setRequired(false);
    const id = await envio();
    expect((await assign(id, DOS)).ok).toBe(true);
  });

  it("la lista para elegir solo trae a quien aceptó", async () => {
    await accept(UNO_USER);
    const names = async () => {
      const r = await call(ANA, "select public.business_delivery_options() as o");
      if (!r.ok) throw new Error(r.error);
      return ((r.rows[0].o as { couriers: { id: string }[] }).couriers ?? []).map((c) => c.id).sort();
    };

    expect(await names()).toEqual([UNO]);
    await setRequired(false);
    // Además de los dos de la prueba está el repartidor por defecto de la plataforma.
    expect(await names()).toEqual(expect.arrayContaining([UNO, DOS]));
  });
});
