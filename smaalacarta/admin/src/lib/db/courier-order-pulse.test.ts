// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { openSearch } from "@/test/offers";

// ENVIO-208 y 209 contra Postgres real: el pulso de pedidos del repartidor (`courier_order_pulse`), que le avisa
// por Realtime a cada repartidor que un pedido que le importa cambió, sin abrirle `orders`.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const UNO_USER = "cccccccc-0000-0000-0000-000000000006";
const DOS_USER = "cccccccc-0000-0000-0000-000000000007";
const TRES_USER = "cccccccc-0000-0000-0000-000000000008";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const UNO = "7a0c0e00-0000-4000-8000-000000000002";
const DOS = "7a0c0e00-0000-4000-8000-000000000003";
const TRES = "7a0c0e00-0000-4000-8000-000000000004";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;
let cantera: string;
let alta: string;

const call = (user: string | null, sql: string) => asUser(db, user, sql);
const take = (user: string, id: string) => call(user, `select public.courier_take_order('${id}')`);
const clear = () => db.exec("delete from courier_order_pulse");

async function envio(options: { delivery?: "delivery" | "retiro"; search?: boolean } = {}) {
  const items = JSON.stringify([{ id: CAFE, kind: "product", quantity: 1 }]);
  const delivery = options.delivery ?? "delivery";
  const withZone = delivery === "delivery" ? `p_delivery_zone => '${cantera}'::uuid, p_delivery_address => 'Av. Siempre Viva 742',` : "";
  const r = await call(
    null,
    `select public.create_public_order('ana', 'Cliente Prueba', '${delivery}', 'efectivo', null, '${items}'::jsonb,
       ${withZone} p_customer_phone => '3515551234') as result`,
  );
  if (!r.ok) throw new Error(`no se pudo crear el pedido: ${r.error}`);
  const code = (r.rows[0].result as { code: string }).code;
  const o = (await db.query<{ id: string }>("select id from orders where code = $1", [code])).rows[0];
  if (options.search !== false && delivery === "delivery") await openSearch(db, o.id);
  return o.id;
}

const pulsed = async () =>
  (await db.query<{ courier_id: string; order_id: string }>("select courier_id, order_id from courier_order_pulse")).rows;
const pulsedIds = async () => (await pulsed()).map((row) => row.courier_id).sort();

beforeAll(async () => {
  db = await createTestDb({ deliveryMode: "fixed", courierAvailability: true });

  await createUser(db, { id: ANA, email: "ana@x.com" });
  await createUser(db, { id: UNO_USER, email: "uno@x.com" });
  await createUser(db, { id: DOS_USER, email: "dos@x.com" });
  await createUser(db, { id: TRES_USER, email: "tres@x.com" });

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
      ('${DOS}', 'Dos Express', '5493510000098', true),
      ('${TRES}', 'Tres Express', '5493510000097', true);
    insert into courier_users (courier_id, user_id) values
      ('${UNO}', '${UNO_USER}'), ('${DOS}', '${DOS_USER}'), ('${TRES}', '${TRES_USER}');
    delete from business_delivery_zones;
    -- El repartidor que dejan las migraciones no entra en estas cuentas.
    delete from courier_zone_coverage where courier_id not in ('${UNO}', '${DOS}', '${TRES}');
  `);

  cantera = (await db.query<{ id: string }>("select id from delivery_zones where name = 'Cantera'")).rows[0].id;
  alta = (
    await db.query<{ id: string }>("select id from delivery_zones where active and name <> 'Cantera' order by name limit 1")
  ).rows[0].id;

  // Ana envía a Cantera. UNO y DOS la cubren; TRES cubre otra zona.
  await db.exec(`
    insert into business_delivery_zones (business_id, zone_id) values ('${NEG_ANA}', '${cantera}');
    insert into courier_zone_coverage (courier_id, zone_id) values
      ('${UNO}', '${cantera}'), ('${DOS}', '${cantera}'), ('${TRES}', '${alta}');
  `);
}, 60_000);

beforeEach(async () => {
  // El freno de 20 pedidos por minuto.
  await db.exec(
    "update orders set created_at = created_at - interval '5 minutes' where created_at > now() - interval '4 minutes'",
  );
  await clear();
  await db.exec("delete from courier_order_declines");
  await db.exec("update platform_settings set delivery_mode = 'fixed'");
});

afterAll(async () => {
  await db.close();
});

describe("la tabla de pulso — ENVIO-208", () => {
  it("no lleva datos del cliente: solo el repartidor, el pedido y la hora", async () => {
    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'courier_order_pulse' order by column_name",
    );

    expect(columns.rows.map((row) => row.column_name)).toEqual(["courier_id", "order_id", "pulsed_at"]);
  });

  it("cada repartidor lee solo su fila", async () => {
    await envio();
    expect(await pulsedIds()).toEqual([UNO, DOS].sort());

    const uno = await call(UNO_USER, "select courier_id from courier_order_pulse");
    expect(uno.ok && uno.rows.map((row) => row.courier_id)).toEqual([UNO]);

    const tres = await call(TRES_USER, "select courier_id from courier_order_pulse");
    expect(tres.ok && tres.rows).toEqual([]);

    const anon = await call(null, "select courier_id from courier_order_pulse");
    expect(anon.ok && anon.rows).toEqual([]);

    const local = await call(ANA, "select courier_id from courier_order_pulse");
    expect(local.ok && local.rows).toEqual([]);
  });

  it("nadie escribe desde la app: ni insertar, ni cambiar, ni borrar", async () => {
    await envio();
    const before = await pulsed();

    const insert = await call(
      TRES_USER,
      `insert into courier_order_pulse (courier_id, order_id) values ('${TRES}', '${before[0].order_id}')`,
    );
    expect(insert.ok).toBe(false);

    const update = await call(UNO_USER, "update courier_order_pulse set pulsed_at = now() - interval '1 day'");
    expect(update.ok && update.affected).toBe(0);

    const remove = await call(UNO_USER, "delete from courier_order_pulse");
    expect(remove.ok && remove.affected).toBe(0);

    expect(await pulsed()).toEqual(before);
  });

  it("no crece: un solo registro por repartidor, con el último pedido", async () => {
    const first = await envio();
    const second = await envio();

    const rows = await db.query<{ courier_id: string; order_id: string }>(
      "select courier_id, order_id from courier_order_pulse where courier_id = $1",
      [UNO],
    );
    expect(rows.rows).toEqual([{ courier_id: UNO, order_id: second }]);
    expect(first).not.toBe(second);
    expect((await db.query<{ n: number }>("select count(*)::int as n from courier_order_pulse")).rows[0].n).toBe(2);
  });
});

describe("a quién pulsa el trigger de orders — ENVIO-209", () => {
  it("al abrirse la búsqueda, a los que ven el pedido en Disponibles y a nadie más", async () => {
    await envio();

    expect(await pulsedIds()).toEqual([UNO, DOS].sort());
  });

  it("usa la misma regla que Disponibles: el que lo rechazó no recibe el pulso", async () => {
    const id = await envio();
    expect((await call(DOS_USER, `select public.courier_decline_order('${id}')`)).ok).toBe(true);
    await clear();

    await db.exec(`update orders set offered_at = now() where id = '${id}'`);

    expect(await pulsedIds()).toEqual([UNO]);
    // Y lo que ve el panel es lo mismo que lo pulsado.
    const sees = (user: string) =>
      call(
        user,
        `select exists (select 1 from jsonb_array_elements(public.courier_available_orders()) e where e->>'id' = '${id}') as v`,
      );
    expect((await sees(DOS_USER)).ok && (await sees(DOS_USER)).rows[0].v).toBe(false);
    expect((await sees(UNO_USER)).ok && (await sees(UNO_USER)).rows[0].v).toBe(true);
  });

  it("un pedido para retirar no le importa a ningún repartidor", async () => {
    await envio({ delivery: "retiro" });

    expect(await pulsed()).toEqual([]);
  });

  it("cuando uno lo toma, pulsa al que lo tomó y a los que lo veían, para que lo saquen de Disponibles", async () => {
    const id = await envio();
    await clear();

    expect((await take(UNO_USER, id)).ok).toBe(true);

    expect(await pulsedIds()).toEqual([UNO, DOS].sort());
  });

  it("los cambios siguientes (preparación, listo) pulsan solo al repartidor asignado", async () => {
    const id = await envio();
    await take(UNO_USER, id);
    await clear();

    await db.exec(`update orders set status = 'preparing' where id = '${id}'`);

    expect(await pulsedIds()).toEqual([UNO]);
  });

  it("si el local cancela, pulsa al asignado", async () => {
    const id = await envio();
    await take(UNO_USER, id);
    await clear();

    const r = await call(ANA, `select public.set_order_status('${id}', 'cancelled')`);
    expect(r.ok).toBe(true);

    expect(await pulsedIds()).toContain(UNO);
  });

  it("si el que lo tenía lo devuelve, pulsa a quien lo tenía y a los que ahora lo ven", async () => {
    const id = await envio();
    await take(UNO_USER, id);
    await clear();

    const r = await call(UNO_USER, `select public.courier_return_order(p_order_id => '${id}', p_kind => 'other', p_reason => 'Se me complicó')`);
    expect(r.ok).toBe(true);

    expect(await pulsedIds()).toEqual([UNO, DOS].sort());
  });
});
