import { createClient } from "@/lib/supabase-server";
import type { MetricOrder } from "@/lib/orders/metrics";

const PAGE_SIZE = 1000; // Supabase corta en 1000 filas por consulta.
const MAX_ORDERS = 5000;

// Los pedidos del negocio desde `sinceIso`, del más nuevo al más viejo, con lo mínimo que
// necesitan las métricas. Se lee de a páginas hasta MAX_ORDERS; si hay más, `truncated` avisa
// (ADMIN-METRICAS-5 y 6). Mismo RLS y filtro por negocio que `listOrders`.
export async function listOrdersForMetrics(
  businessId: string,
  sinceIso: string,
): Promise<{ orders: MetricOrder[]; truncated: boolean }> {
  const supabase = await createClient();

  async function page(from: number, to: number): Promise<MetricOrder[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("status, total, source, created_at, order_items(name, quantity)")
      .eq("business_id", businessId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as unknown as MetricOrder[];
  }

  const orders: MetricOrder[] = [];

  while (orders.length < MAX_ORDERS) {
    const rows = await page(orders.length, orders.length + PAGE_SIZE - 1);
    orders.push(...rows);
    if (rows.length < PAGE_SIZE) {
      return { orders, truncated: false };
    }
  }

  // Llegamos al tope con páginas llenas: una fila más dice si había más pedidos.
  const extra = await page(MAX_ORDERS, MAX_ORDERS);
  return { orders, truncated: extra.length > 0 };
}
