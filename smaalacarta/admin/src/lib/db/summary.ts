import { startOfTodayInArgentina } from "@/lib/dates";
import { createClient } from "@/lib/supabase-server";

// Conteos del resumen. `head: true` trae solo el total, sin filas.
async function count(
  table: "categories" | "products" | "promotions" | "orders",
  businessId: string,
  filter?: (query: ReturnType<typeof base>) => ReturnType<typeof base>,
) {
  const supabase = await createClient();
  const query = base(supabase, table, businessId);
  const { count, error } = await (filter ? filter(query) : query);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function base(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "categories" | "products" | "promotions" | "orders",
  businessId: string,
) {
  return supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
}

// Pedidos sin confirmar: lo que el negocio tiene que atender (ADMIN-RESUMEN-3).
export async function countPendingOrders(businessId: string) {
  return count("orders", businessId, (q) => q.eq("status", "pending"));
}

export async function getBusinessSummary(businessId: string) {
  const startOfToday = startOfTodayInArgentina();
  const supabase = await createClient();

  const [categories, products, promotions, ordersToday, pendingOrders, settings] =
    await Promise.all([
      count("categories", businessId),
      count("products", businessId, (q) => q.eq("active", true)),
      count("promotions", businessId, (q) => q.eq("active", true)),
      count("orders", businessId, (q) =>
        q.gte("created_at", startOfToday.toISOString()),
      ),
      countPendingOrders(businessId),
      supabase
        .from("business_settings")
        .select("published")
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);

  return {
    categories,
    products,
    promotions,
    ordersToday,
    pendingOrders,
    published: settings.data?.published ?? false,
  };
}
