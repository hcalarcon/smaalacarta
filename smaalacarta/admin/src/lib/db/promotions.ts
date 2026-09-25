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
  created_at: string;
  updated_at: string;
  promotion_items: PromotionItem[];
};

const SELECT =
  "*, promotion_items(product_id, sort_order, products(id, name, price, active))";

function withOrderedItems(promotion: Promotion): Promotion {
  return {
    ...promotion,
    promotion_items: [...(promotion.promotion_items ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  };
}

export async function listPromotions(businessId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("promotions")
    .select(SELECT)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as Promotion[]).map(withOrderedItems);
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

  return data ? withOrderedItems(data as unknown as Promotion) : null;
}

// Todos los productos del negocio, para armar promociones: en el orden del menú
// (categorías y productos como los ordenó el negocio).
export async function listProductsForPromotions(businessId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, sort_order, created_at, products(id, name, price, active, sort_order, created_at)")
    .eq("business_id", businessId);

  if (error) {
    throw new Error(error.message);
  }

  return sortByOrder(data ?? []).flatMap((category) =>
    sortByOrder(category.products ?? []).map((product) => ({
      id: product.id as string,
      name: product.name as string,
      price: Number(product.price),
      active: product.active as boolean,
      categoryName: category.name as string,
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
