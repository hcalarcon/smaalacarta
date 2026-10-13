import { listRequiredGroupProductIds } from "@/lib/db/options";
import { deleteRecord, updateRecord } from "@/lib/db/resources";
import { sortByOrder } from "@/lib/menu/ordering";
import type { PromotionType } from "@/lib/promotions/validation";
import { createClient } from "@/lib/supabase-server";

export type PromotionItem = {
  product_id: string;
  sort_order: number;
  products: {
    id: string;
    name: string;
    price: number;
    active: boolean;
    image_url: string | null;
  } | null;
};

export type Promotion = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  discount_percent: number;
  price: number | null;
  active: boolean;
  image_url: string | null;
  image_product_id: string | null;
  // Imagen y vigencia (ADMIN-PROMO-1 a 12).
  valid_until: string | null;
  stock: number | null;
  created_at: string;
  updated_at: string;
  promotion_items: PromotionItem[];
};

// Lo vendido y lo que queda de una promoción con stock (nulo en `remaining` si no tiene).
export type PromotionStock = { sold: number; remaining: number | null };

export type PromotionWithStock = Promotion & { stats: PromotionStock };

const SELECT =
  "*, promotion_items(product_id, sort_order, products(id, name, price, active, image_url))";

function withOrderedItems(promotion: Promotion): Promotion {
  return {
    ...promotion,
    promotion_items: [...(promotion.promotion_items ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  };
}

// Vendidas y restantes de cada promoción del negocio (ADMIN-PROMO-10). Si la lectura falla, la lista se
// muestra igual, sin los números.
export async function getPromotionStats(businessId: string): Promise<Map<string, PromotionStock>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("promotion_stock_stats", { p_business_id: businessId });

  const stats = new Map<string, PromotionStock>();
  if (error) return stats;

  for (const row of data ?? []) {
    stats.set(row.promotion_id, {
      sold: Number(row.sold),
      remaining: row.remaining == null ? null : Number(row.remaining),
    });
  }

  return stats;
}

export async function listPromotions(businessId: string): Promise<PromotionWithStock[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("promotions")
    .select(SELECT)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const stats = await getPromotionStats(businessId);

  return ((data ?? []) as unknown as Promotion[]).map((promotion) => ({
    ...withOrderedItems(promotion),
    stats: stats.get(promotion.id) ?? { sold: 0, remaining: null },
  }));
}

export async function getPromotion(businessId: string, id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("promotions")
    .select(SELECT)
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const stats = await getPromotionStats(businessId);

  return {
    ...withOrderedItems(data as unknown as Promotion),
    stats: stats.get(id) ?? { sold: 0, remaining: null },
  } satisfies PromotionWithStock;
}

// Todos los productos del negocio, para armar promociones: en el orden del menú
// (categorías y productos como los ordenó el negocio).
export async function listProductsForPromotions(businessId: string) {
  const supabase = await createClient();

  const [{ data, error }, requiredGroupProducts] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "id, name, sort_order, created_at, products(id, name, price, active, sort_order, created_at, image_url)",
      )
      .eq("business_id", businessId),
    listRequiredGroupProductIds(businessId),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  return sortByOrder(data ?? []).flatMap((category) =>
    sortByOrder(category.products ?? []).map((product) => ({
      id: product.id as string,
      name: product.name as string,
      price: Number(product.price),
      active: product.active as boolean,
      // Para elegir la foto de la promoción (ADMIN-PROMO-3).
      imageUrl: (product.image_url as string | null) ?? null,
      categoryName: category.name as string,
      // Un producto con opciones obligatorias no puede estar en una promoción (ADMIN-OPCIONES-14).
      hasRequiredGroup: requiredGroupProducts.has(product.id as string),
    })),
  );
}

export type SavePromotionInput = {
  id: string | null;
  name: string;
  description: string;
  type: PromotionType;
  discountPercent: number;
  price: number | null;
  active: boolean;
  productIds: string[];
  imageUrl: string | null;
  imageProductId: string | null;
  validUntil: string | null;
  stock: number | null;
};

// Guarda la promoción y sus productos en un solo paso (ADMIN-PROMOS-3). Los
// errores de la base vuelven como `{ error }` para poder traducirlos.
export async function savePromotion(
  businessId: string,
  input: SavePromotionInput,
): Promise<{ id: string } | { error: { code?: string; message?: string } }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("save_promotion", {
    p_id: input.id,
    p_business_id: businessId,
    p_name: input.name,
    p_description: input.description,
    p_type: input.type,
    p_discount_percent: input.discountPercent,
    p_price: input.price,
    p_active: input.active,
    p_product_ids: input.productIds,
    // Las funciones aceptan nulo ("sin imagen", "sin fin", "sin tope"); los tipos generados no lo reflejan.
    p_image_url: input.imageUrl as string,
    p_image_product_id: input.imageProductId as string,
    p_valid_until: input.validUntil as string,
    p_stock: input.stock as number,
  });

  if (error) {
    return { error: { code: error.code, message: error.message } };
  }

  return { id: data as string };
}

export async function setPromotionActive(
  businessId: string,
  id: string,
  active: boolean,
) {
  await updateRecord("promotions", id, businessId, { active });
}

export async function deletePromotion(businessId: string, id: string) {
  await deleteRecord("promotions", businessId, id);
}
