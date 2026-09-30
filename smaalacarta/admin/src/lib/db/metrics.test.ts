// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// ADMIN-METRICAS-5 y 6. Sin base: un cliente falso con filas en memoria que respeta
// eq / gte / order / range como lo hace PostgREST, y cuenta las consultas.
type Row = { business_id: string; created_at: string; status: string; total: number; source: string; order_items: [] };

let rows: Row[] = [];
let calls: { from: number; to: number }[] = [];
let failWith: string | null = null;

function fakeClient() {
  const filters: ((row: Row) => boolean)[] = [];
  let newestFirst = false;
  const query = {
    select: () => query,
    eq: (column: keyof Row, value: string) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    gte: (column: keyof Row, value: string) => {
      filters.push((row) => new Date(String(row[column])).getTime() >= new Date(value).getTime());
      return query;
    },
    order: (_column: string, options: { ascending: boolean }) => {
      newestFirst = !options.ascending;
      return query;
    },
    range: (from: number, to: number) => {
      calls.push({ from, to });
      if (failWith) return Promise.resolve({ data: null, error: { message: failWith } });
      const matching = rows.filter((row) => filters.every((f) => f(row)));
      matching.sort((a, b) => (newestFirst ? b.created_at.localeCompare(a.created_at) : 0));
      return Promise.resolve({ data: matching.slice(from, to + 1), error: null });
    },
  };
  return { from: () => query };
}

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => fakeClient() }));

import { listOrdersForMetrics } from "./metrics";

const ANA = "negocio-ana";
const BETO = "negocio-beto";

function makeRows(businessId: string, count: number, startDay = 1): Row[] {
  // created_at crece con el índice: el más nuevo es el último.
  return Array.from({ length: count }, (_, i) => ({
    business_id: businessId,
    created_at: new Date(Date.UTC(2026, 0, startDay) + i * 1000).toISOString(),
    status: "delivered",
    total: 100,
    source: "web",
    order_items: [],
  }));
}

beforeEach(() => {
  rows = [];
  calls = [];
  failWith = null;
});

describe("listOrdersForMetrics — ADMIN-METRICAS-5", () => {
  it("devuelve solo los pedidos del negocio pedido", async () => {
    rows = [...makeRows(ANA, 3), ...makeRows(BETO, 4)];
    const { orders, truncated } = await listOrdersForMetrics(ANA, "2026-01-01T00:00:00Z");
    expect(orders).toHaveLength(3);
    expect(orders.every((o) => (o as unknown as Row).business_id === ANA)).toBe(true);
    expect(truncated).toBe(false);
  });

  it("respeta la fecha desde y ordena del más nuevo al más viejo", async () => {
    rows = [
      { ...makeRows(ANA, 1)[0], created_at: "2026-01-01T10:00:00Z" },
      { ...makeRows(ANA, 1)[0], created_at: "2026-01-05T10:00:00Z" },
      { ...makeRows(ANA, 1)[0], created_at: "2026-01-09T10:00:00Z" },
    ];
    const { orders } = await listOrdersForMetrics(ANA, "2026-01-03T00:00:00Z");
    expect(orders.map((o) => o.created_at)).toEqual(["2026-01-09T10:00:00Z", "2026-01-05T10:00:00Z"]);
  });

  it("si la consulta falla, lanza el error", async () => {
    failWith = "boom";
    await expect(listOrdersForMetrics(ANA, "2026-01-01T00:00:00Z")).rejects.toThrow("boom");
  });
});

describe("listOrdersForMetrics — ADMIN-METRICAS-6", () => {
  it("con menos de 1000 pedidos hace una sola consulta", async () => {
    rows = makeRows(ANA, 10);
    await listOrdersForMetrics(ANA, "2026-01-01T00:00:00Z");
    expect(calls).toEqual([{ from: 0, to: 999 }]);
  });

  it("pagina de a 1000 y junta todas las filas", async () => {
    rows = makeRows(ANA, 2500);
    const { orders, truncated } = await listOrdersForMetrics(ANA, "2026-01-01T00:00:00Z");
    expect(orders).toHaveLength(2500);
    expect(truncated).toBe(false);
    expect(calls).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
  });

  it("con exactamente 5000 pedidos no marca truncado", async () => {
    rows = makeRows(ANA, 5000);
    const { orders, truncated } = await listOrdersForMetrics(ANA, "2026-01-01T00:00:00Z");
    expect(orders).toHaveLength(5000);
    expect(truncated).toBe(false);
  });

  it("con más de 5000 devuelve los 5000 más nuevos y marca truncado", async () => {
    rows = makeRows(ANA, 5300);
    const { orders, truncated } = await listOrdersForMetrics(ANA, "2026-01-01T00:00:00Z");
    expect(orders).toHaveLength(5000);
    expect(truncated).toBe(true);
    expect(orders[0].created_at).toBe(rows[5299].created_at);
  });
});
