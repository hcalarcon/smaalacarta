// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";
import { localClock } from "../../../../web/apps/menu-app/lib/schedule.js";
import { scheduledSlots } from "../../../../web/apps/menu-app/lib/scheduled-slots.js";

// ADMIN-CONFIG-16, ADMIN-PEDIDOS-14, PUBLICO-28, PUBLICO-29 y SEGUIMIENTO-17 y 18 contra Postgres real.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const NEG_ANA = "a1a1a1a1-0000-0000-0000-000000000001";
const CAFE = "d1000000-0000-0000-0000-000000000001";

let db: TestDb;

const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const allDays = (ranges: string[]) => Object.fromEntries(DAYS.map((d) => [d, ranges]));

const setup = (sql: string) => db.exec(`update business_settings set ${sql} where business_id = '${NEG_ANA}'`);
const setSchedule = (schedule: object) => setup(`schedule = '${JSON.stringify(schedule)}'::jsonb`);

// Los tests con la hora real (la base no se puede "atrasar") necesitan margen en el día:
// una hora a 45 minutos de ahora no debe caer en mañana, ni el hueco de un horario.
const arMinutes = () => localClock(new Date()).minutes;
const hasRoomToday = () => arMinutes() >= 15 && arMinutes() <= 23 * 60 - 60;

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function order(scheduledFor: string | null | undefined) {
  const arg = scheduledFor === undefined ? "" : `, ${scheduledFor === null ? "null" : `'${scheduledFor}'`}::timestamptz`;
  return asUser(
    db,
    null,
    `select public.create_public_order('ana', 'Cliente', 'retiro', 'efectivo', null,
       '[{"id":"${CAFE}","kind":"product","quantity":1}]'::jsonb${arg}) as result`,
  );
}

const code = (r: Awaited<ReturnType<typeof order>>) => (r.ok ? (r.rows[0].result as { code: string }).code : "");

async function storedFor(orderCode: string) {
  const r = await db.query<{ scheduled_for: Date | null }>(`select scheduled_for from orders where code = '${orderCode}'`);
  return r.rows[0].scheduled_for;
}

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

describe("el menú público lo entrega — PUBLICO-28", () => {
  const config = async () => {
    const r = await asUser(db, null, "select public.public_menu('ana') as m");
    return r.ok ? (r.rows[0].m as { config: Record<string, unknown> }).config : null;
  };

  it("por defecto acepta pedidos programados con 30 minutos de anticipación", async () => {
    expect(await config()).toMatchObject({ programados: true, anticipacionMin: 30 });
  });

  it("entrega lo que el negocio eligió, incluso cuando no los acepta", async () => {
    await setup("allow_scheduled_orders = false, scheduled_lead_minutes = 120");
    expect(await config()).toMatchObject({ programados: false, anticipacionMin: 120 });
    await setup("allow_scheduled_orders = true, scheduled_lead_minutes = 30");
  });
});

describe("is_schedulable_at — SEGUIMIENTO-17", () => {
  const can = async (schedule: object, lead: number, at: string, now: string) => {
    const r = await db.query<{ v: boolean }>(
      `select public.is_schedulable_at('${JSON.stringify(schedule)}'::jsonb, ${lead}, '${at}'::timestamptz, '${now}'::timestamptz) as v`,
    );
    return r.rows[0].v;
  };
  // 5 de enero de 2026 es lunes; Argentina es UTC-3.
  const NOW = "2026-01-05T13:00:00Z"; // lunes 10:00
  const lunes = { lunes: ["09:00-13:00", "20:00-02:00"] };

  it("la anticipación mínima se incluye: justo a 30 minutos sí, un minuto menos no", async () => {
    expect(await can(lunes, 30, "2026-01-05T13:30:00Z", NOW)).toBe(true); // 10:30
    expect(await can(lunes, 30, "2026-01-05T13:29:00Z", NOW)).toBe(false); // 10:29
  });

  it("el inicio del rango se incluye y el cierre no", async () => {
    expect(await can(lunes, 15, "2026-01-05T16:00:00Z", NOW)).toBe(false); // 13:00
    expect(await can(lunes, 15, "2026-01-05T15:59:00Z", NOW)).toBe(true); // 12:59
    expect(await can(lunes, 15, "2026-01-05T23:00:00Z", NOW)).toBe(true); // 20:00
  });

  it("entre dos turnos no se puede", async () => {
    expect(await can(lunes, 15, "2026-01-05T19:00:00Z", NOW)).toBe(false); // 16:00
  });

  it("un rango nocturno vale hasta las 23:59 de hoy; la madrugada de mañana ya no es hoy", async () => {
    expect(await can(lunes, 15, "2026-01-06T02:59:00Z", NOW)).toBe(true); // 23:59
    expect(await can(lunes, 15, "2026-01-06T03:00:00Z", NOW)).toBe(false); // martes 00:00
    expect(await can(lunes, 15, "2026-01-06T04:00:00Z", NOW)).toBe(false); // martes 01:00, aunque el rango lo cubra
  });

  it("la madrugada de hoy cuenta con el rango nocturno de ayer", async () => {
    const lunesNoche = { domingo: ["20:00-02:00"] };
    expect(await can(lunesNoche, 15, "2026-01-05T04:30:00Z", "2026-01-05T03:30:00Z")).toBe(true); // lunes 01:30
  });

  it("no se puede programar en el pasado ni para otro día", async () => {
    expect(await can({}, 15, "2026-01-05T12:00:00Z", NOW)).toBe(false); // 09:00, ya pasó
    expect(await can({}, 15, "2026-01-06T13:00:00Z", NOW)).toBe(false); // mañana
  });

  it("sin horarios cargados vale cualquier hora de hoy que quede", async () => {
    expect(await can({}, 15, "2026-01-05T20:00:00Z", NOW)).toBe(true);
  });

  it("la base y el menú web calculan igual (mismas opciones en una grilla de horas y días)", async () => {
    const schedules = [
      {},
      { lunes: ["09:00-13:00", "18:00-23:00"], martes: ["20:00-02:00"], jueves: ["10:00-14:00"] },
      { domingo: ["12:00-00:00"], sabado: ["22:00-04:00"], viernes: [] },
      { lunes: ["00:00-00:00", "basura"], miercoles: ["23:30-00:30"] },
    ];

    for (const schedule of schedules) {
      for (const lead of [15, 30, 240]) {
        for (let day = 0; day < 7; day++) {
          for (let minute = 0; minute < 24 * 60; minute += 105) {
            const now = new Date(Date.UTC(2026, 0, 4 + day, 3, minute, 20));
            const offered = new Set(scheduledSlots(schedule, lead, now).map((s: { iso: string }) => s.iso));

            // Todo instante de la grilla de 15 minutos, hasta dos días adelante.
            const start = Math.floor(now.getTime() / 900_000) * 900_000;
            const instants = Array.from({ length: 4 * 48 }, (_, i) => new Date(start + i * 900_000).toISOString());
            const r = await db.query<{ at: string; v: boolean }>(
              `select t as at, public.is_schedulable_at('${JSON.stringify(schedule)}'::jsonb, ${lead}, t::timestamptz, '${now.toISOString()}'::timestamptz) as v
               from unnest(array[${instants.map((i) => `'${i}'`).join(",")}]::text[]) as t`,
            );
            const accepted = new Set(r.rows.filter((x) => x.v).map((x) => new Date(x.at).toISOString()));

            expect([...offered].sort(), `${JSON.stringify(schedule)} lead=${lead} now=${now.toISOString()}`).toEqual(
              [...accepted].sort(),
            );
          }
        }
      }
    }
  }, 120_000);
});

describe("crear un pedido programado — SEGUIMIENTO-17", () => {
  it("un pedido sin hora queda sin programar (lo antes posible)", async () => {
    const r = await order(undefined);
    expect(r.ok).toBe(true);
    expect(await storedFor(code(r))).toBeNull();
    expect(await storedFor(code(await order(null)))).toBeNull();
  });

  it.skipIf(!hasRoomToday())("guarda la hora de un pedido programado", async () => {
    await setSchedule({});
    const when = inMinutes(45);
    const r = await order(when);

    expect(r.ok).toBe(true);
    expect((await storedFor(code(r)))?.toISOString()).toBe(when);
  });

  it("rechaza con P0011 si el negocio no acepta pedidos programados, y no guarda nada", async () => {
    await setup("allow_scheduled_orders = false");
    const antes = await db.query<{ n: string }>("select count(*) as n from orders");
    const r = await order(inMinutes(45));

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0011");
    expect((await db.query<{ n: string }>("select count(*) as n from orders")).rows[0].n).toBe(antes.rows[0].n);
    // Un pedido "ahora" sigue entrando.
    expect((await order(undefined)).ok).toBe(true);
    await setup("allow_scheduled_orders = true");
  });

  it("rechaza con P0012 una hora que no llega a la anticipación mínima", async () => {
    await setup("scheduled_lead_minutes = 60");
    const r = await order(inMinutes(30));

    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0012");
    await setup("scheduled_lead_minutes = 30");
  });

  it("rechaza con P0012 una hora del pasado y una de otro día", async () => {
    const pasada = await order(inMinutes(-60));
    expect(!pasada.ok && pasada.code).toBe("P0012");
    const manana = await order(inMinutes(26 * 60));
    expect(!manana.ok && manana.code).toBe("P0012");
    const ayer = await order(inMinutes(-26 * 60));
    expect(!ayer.ok && ayer.code).toBe("P0012");
  });

  it.skipIf(!hasRoomToday())("rechaza con P0012 una hora fuera de los rangos abiertos", async () => {
    // Abierto todo el día salvo un hueco de 10 minutos alrededor de la hora pedida.
    const target = new Date(Date.now() + 45 * 60_000);
    const clock = localClock(target).minutes;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    await setSchedule(allDays([`00:00-${hhmm(clock - 5)}`, `${hhmm(clock + 5)}-00:00`]));

    const r = await order(target.toISOString());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("P0012");

    // Una hora dentro de un rango abierto del mismo negocio sí entra.
    expect((await order(inMinutes(45 + 20))).ok).toBe(true);
    await setSchedule({});
  });

  it("el negocio cerrado ahora sigue rechazando con P0006, también si el pedido es programado", async () => {
    await setSchedule(allDays([]));
    const r = await order(inMinutes(45));

    expect(!r.ok && r.code).toBe("P0006");
    await setSchedule({});
  });
});

describe("el seguimiento lo muestra — SEGUIMIENTO-18", () => {
  const tracking = async (orderCode: string) => {
    const r = await asUser(db, null, `select public.public_order_tracking('${orderCode}') as t`);
    return r.ok ? (r.rows[0].t as { pedido: Record<string, unknown> }) : null;
  };

  it.skipIf(!hasRoomToday())("entrega la hora programada en el pedido", async () => {
    const when = inMinutes(45);
    const t = await tracking(code(await order(when)));

    expect(new Date(t!.pedido.programado as string).toISOString()).toBe(when);
  });

  it("un pedido sin hora no trae el campo", async () => {
    const t = await tracking(code(await order(undefined)));

    expect(t!.pedido).not.toHaveProperty("programado");
  });
});

describe("pedido manual — ADMIN-PEDIDOS-14", () => {
  const manual = (extra: string) =>
    asUser(
      db,
      ANA,
      `select public.create_manual_order('${NEG_ANA}', 'Mostrador', 'retiro', 'efectivo', null,
         '[{"name":"Café","unit_price":1000,"quantity":1}]'::jsonb${extra}) as result`,
    );

  it("guarda la hora sin validarla contra los horarios ni la anticipación", async () => {
    await setSchedule(allDays([]));
    await setup("allow_scheduled_orders = false");
    const when = "2026-01-05T14:00:00.000Z";
    const r = await manual(`, '${when}'::timestamptz`);

    expect(r.ok).toBe(true);
    expect((await storedFor(((r.ok ? r.rows[0].result : { code: "" }) as { code: string }).code))?.toISOString()).toBe(when);
    await setSchedule({});
    await setup("allow_scheduled_orders = true");
  });

  it("sin hora queda sin programar", async () => {
    const r = await manual("");

    expect(r.ok).toBe(true);
    expect(await storedFor(((r.ok ? r.rows[0].result : { code: "" }) as { code: string }).code)).toBeNull();
  });
});
