// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { DAYS, localClock } from "../../../../web/apps/menu-app/lib/schedule.js";
import { preorderWindow } from "../../../../web/apps/menu-app/lib/preorders.js";

// ADMIN-CONFIG-18, ADMIN-PEDIDOS-16, PUBLICO-31 y 32 y SEGUIMIENTO-19 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const setup = (sql: string) => db.exec(`update business_settings set ${sql} where business_id = '${NEG_ANA}'`);
const json = (value: unknown) => `'${JSON.stringify(value)}'::jsonb`;

// La base usa la hora real (no se puede "atrasar"): el escenario se arma con el día de mañana
// como único día de venta, así que ahora siempre está cerrado y la próxima apertura es mañana
// a las 12:00. El corte "de hoy a las 00:00" ya pasó; el "de mañana a las 00:00" todavía no.
const today = () => localClock(new Date()).day;
const tomorrowKey = () => DAYS[(today() + 1) % 7];
const todayKey = () => DAYS[today()];
const sellTomorrow = () => json({ [tomorrowKey()]: ["12:00-23:00"] });
const cutoffTomorrow = () => json({ [tomorrowKey()]: { dia: tomorrowKey(), hora: "00:00" } });
const cutoffPassed = () => json({ [tomorrowKey()]: { dia: todayKey(), hora: "00:00" } });

// Las asignaciones de `sql` ("columna = valor, ...") pisan las del escenario base.
async function scenario(sql = "") {
  const assignments: Record<string, string> = {
    preorders_enabled: "true",
    temporarily_closed: "false",
    reopens_on: "null",
    schedule: sellTomorrow(),
    preorder_cutoffs: cutoffTomorrow(),
  };
  for (const part of sql.split(/,\s*(?=\w+ =)/).filter(Boolean)) {
    const [column, ...value] = part.split(" = ");
    assignments[column.trim()] = value.join(" = ").trim();
  }
  await setup(Object.entries(assignments).map(([column, value]) => `${column} = ${value}`).join(", "));
}

function order(preorder: boolean | undefined, scheduledFor?: string) {
  const extra =
    (scheduledFor ? `, p_scheduled_for => '${scheduledFor}'::timestamptz` : "") +
    (preorder === undefined ? "" : `, p_preorder => ${preorder}`);
  return asUser(
    db,
    null,
    `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null,
       '[{"id":"${CAFE}","kind":"product","quantity":1}]'::jsonb${extra}) as result`,
  );
}

const code = (r: Awaited<ReturnType<typeof order>>) => (r.ok ? (r.rows[0].result as { code: string }).code : "");
const stored = async (orderCode: string) =>
  (await db.query<{ preorder: boolean; scheduled_for: Date | null }>(
    `select preorder, scheduled_for from orders where code = '${orderCode}'`,
  )).rows[0];
const countOrders = async () => Number((await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n);

const config = async () => {
  const r = await asUser(db, null, "select public.public_menu('ana') as m");
  return r.ok ? (r.rows[0].m as { config: Record<string, unknown> }).config : null;
};

const tomorrowWindow = () =>
  preorderWindow(
    { [tomorrowKey()]: ["12:00-23:00"] },
    { [tomorrowKey()]: { dia: tomorrowKey(), hora: "00:00" } },
    new Date(),
  );

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: ANA, email: "ana@x.com" });

  await db.exec(`
    insert into businesses (id, name, slug, whatsapp, plan_completo) values ('${NEG_ANA}', 'Ana Resto', 'ana', '5493510000001', true);
    insert into business_users (business_id, user_id) values ('${NEG_ANA}', '${ANA}');
    insert into business_settings (business_id, published) values ('${NEG_ANA}', true);
    insert into categories (id, business_id, name) values ('c1000000-0000-0000-0000-000000000001', '${NEG_ANA}', 'Bebidas');
    insert into products (id, business_id, category_id, name, price) values ('${CAFE}', '${NEG_ANA}', 'c1000000-0000-0000-0000-000000000001', 'Café', 1000);
  `);
}, 60_000);

describe("la configuración — ADMIN-CONFIG-18", () => {
  const row = async () =>
    (await db.query<{ preorders_enabled: boolean; preorder_cutoffs: unknown }>(
      `select preorders_enabled, preorder_cutoffs from business_settings where business_id = '${NEG_ANA}'`,
    )).rows[0];

  it("por defecto los pedidos anticipados están apagados y sin cortes", async () => {
    expect(await row()).toEqual({ preorders_enabled: false, preorder_cutoffs: {} });
  });

  it("acepta cortes con la forma {dia, hora}", async () => {
    const cutoffs = { sabado: { dia: "viernes", hora: "20:00" }, domingo: { dia: "sabado", hora: "09:30" } };
    await setup(`preorder_cutoffs = ${json(cutoffs)}`);
    expect((await row()).preorder_cutoffs).toEqual(cutoffs);
    await setup("preorder_cutoffs = '{}'::jsonb");
  });

  it.each([
    ["una hora mal escrita", { sabado: { dia: "viernes", hora: "8:00" } }],
    ["una hora que no existe", { sabado: { dia: "viernes", hora: "24:00" } }],
    ["un día de corte desconocido", { sabado: { dia: "viernez", hora: "20:00" } }],
    ["un día de venta desconocido", { festivo: { dia: "viernes", hora: "20:00" } }],
    ["un corte sin hora", { sabado: { dia: "viernes" } }],
    ["un corte que no es un objeto", { sabado: "viernes 20:00" }],
    ["campos de más", { sabado: { dia: "viernes", hora: "20:00", extra: 1 } }],
  ])("rechaza %s", async (_name, cutoffs) => {
    await expect(setup(`preorder_cutoffs = ${json(cutoffs)}`)).rejects.toThrow();
  });

  it("rechaza un valor que no es un objeto", async () => {
    await expect(setup(`preorder_cutoffs = '[]'::jsonb`)).rejects.toThrow();
    await expect(setup(`preorder_cutoffs = 'null'::jsonb`)).rejects.toThrow();
  });
});

describe("preorder_window — PUBLICO-32", () => {
  it("la base y el menú web calculan igual (grilla de instantes, varios horarios y cortes)", async () => {
    const cutoffs = {
      sabado: { dia: "viernes", hora: "20:00" },
      domingo: { dia: "sabado", hora: "09:30" },
      martes: { dia: "martes", hora: "08:00" },
      jueves: { dia: "jueves", hora: "23:00" }, // mismo día, después de abrir: cuenta de la semana anterior
      miercoles: { dia: "lunes", hora: "00:00" },
    };
    const schedules = [
      { sabado: ["12:00-23:00"], domingo: ["20:00-02:00"], martes: ["10:00-14:00"] },
      { sabado: ["12:00-15:00", "20:00-23:00"], jueves: ["09:00-13:00"], miercoles: ["18:00-00:00"] },
      { domingo: ["12:00-00:00"], sabado: ["22:00-04:00"], viernes: [], martes: ["00:00-00:00", "basura"] },
      {},
    ];

    for (const schedule of schedules) {
      // Cada 45 minutos durante 15 días: cruza todos los días, los cortes y las aperturas.
      const start = Date.UTC(2026, 0, 4, 3, 0, 0);
      const instants = Array.from({ length: 15 * 32 }, (_, i) => new Date(start + i * 45 * 60_000).toISOString());
      const r = await db.query<{ at: string; opens: string | null; cutoff: string | null }>(
        `select t as at, w.opens_at as opens, w.cutoff_at as cutoff
         from unnest(array[${instants.map((i) => `'${i}'`).join(",")}]::text[]) as t
         left join lateral public.preorder_window(${json(schedule)}, ${json(cutoffs)}, t::timestamptz) w on true`,
      );

      for (const row of r.rows) {
        const expected = preorderWindow(schedule, cutoffs, new Date(row.at));
        const label = `${JSON.stringify(schedule)} ${new Date(row.at).toISOString()}`;
        expect(row.opens ? new Date(row.opens).toISOString() : null, label).toBe(expected ? expected.opensAt.toISOString() : null);
        expect(row.cutoff ? new Date(row.cutoff).toISOString() : null, label).toBe(expected ? expected.cutoffAt.toISOString() : null);
      }
    }
  }, 120_000);
});

describe("el menú público lo entrega — PUBLICO-31", () => {
  it("con todo en regla trae anticipados con la próxima apertura y el corte", async () => {
    await scenario();
    const c = (await config()) as { anticipados: { activo: boolean; proximaApertura: string; corte: string } };
    const expected = tomorrowWindow()!;

    expect(c.anticipados.activo).toBe(true);
    expect(new Date(c.anticipados.proximaApertura).toISOString()).toBe(expected.opensAt.toISOString());
    expect(new Date(c.anticipados.corte).toISOString()).toBe(expected.cutoffAt.toISOString());
  });

  it.each([
    ["el negocio no los acepta", "preorders_enabled = false"],
    ["el corte ya pasó", `preorder_cutoffs = ${cutoffPassed()}`],
    ["ese día no tiene corte", "preorder_cutoffs = '{}'::jsonb"],
    ["el negocio está abierto todo el tiempo (sin horarios)", "schedule = '{}'::jsonb"],
    ["hay un cierre temporal", "temporarily_closed = true"],
  ])("no trae la clave si %s", async (_name, sql) => {
    await scenario(sql);
    expect(await config()).not.toHaveProperty("anticipados");
  });

  it("un cierre temporal que ya venció no lo apaga", async () => {
    await scenario("temporarily_closed = true, reopens_on = current_date - 1");
    expect(await config()).toHaveProperty("anticipados");
  });
});

describe("crear un pedido anticipado — SEGUIMIENTO-19 y ADMIN-PEDIDOS-16", () => {
  it("guarda preorder y la apertura como fecha del pedido", async () => {
    await scenario();
    const r = await order(true);
    expect(r.ok).toBe(true);

    const s = await stored(code(r));
    expect(s.preorder).toBe(true);
    expect(s.scheduled_for?.toISOString()).toBe(tomorrowWindow()!.opensAt.toISOString());
  });

  it("el pedido anticipado entra en la lista del negocio como cualquier otro", async () => {
    const r = await asUser(db, ANA, "select preorder from orders where preorder");
    expect(r.ok && r.rows.length).toBeGreaterThan(0);
  });

  it.each([
    ["el negocio no los acepta", "preorders_enabled = false"],
    ["el corte ya pasó", `preorder_cutoffs = ${cutoffPassed()}`],
    ["ese día no tiene corte", "preorder_cutoffs = '{}'::jsonb"],
    ["el negocio está abierto", "schedule = '{}'::jsonb"],
  ])("rechaza con P0013 si %s, y no guarda nada", async (_name, sql) => {
    await scenario(sql);
    const antes = await countOrders();
    const r = await order(true);

    expect(!r.ok && r.code).toBe("P0013");
    expect(await countOrders()).toBe(antes);
  });

  it("un cierre temporal manda: P0005", async () => {
    await scenario("temporarily_closed = true");
    const r = await order(true);
    expect(!r.ok && r.code).toBe("P0005");
  });

  it("no se combina con una hora programada: 22023", async () => {
    await scenario();
    const r = await order(true, new Date(Date.now() + 3600_000).toISOString());
    expect(!r.ok && r.code).toBe("22023");
  });

  it("sin p_preorder, cerrado sigue siendo P0006 aunque haya anticipados", async () => {
    await scenario();
    const sinParametro = await order(undefined);
    expect(!sinParametro.ok && sinParametro.code).toBe("P0006");
    const enFalso = await order(false);
    expect(!enFalso.ok && enFalso.code).toBe("P0006");
  });

  it("un pedido normal queda con preorder en falso", async () => {
    await setup("preorders_enabled = true, schedule = '{}'::jsonb, temporarily_closed = false");
    const r = await order(undefined);
    expect(r.ok).toBe(true);
    expect((await stored(code(r))).preorder).toBe(false);
  });
});
