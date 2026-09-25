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

export async function getBusinessSummary(businessId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [categories, products, promotions, ordersToday] = await Promise.all([
    count("categories", businessId),
    count("products", businessId, (q) => q.eq("active", true)),
    count("promotions", businessId, (q) => q.eq("active", true)),
    count("orders", businessId, (q) =>
      q.gte("created_at", startOfToday.toISOString()),
    ),
  ]);

  return { categories, products, promotions, ordersToday };
}
