import {
  getRecord,
  getRecords,
  insertRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/db/resources";

import { Database } from "@/types/database";
import { sortByOrder } from "@/lib/menu/ordering";
import { createClient } from "@/lib/supabase-server";

type Category = Database["public"]["Tables"]["categories"]["Row"];

export async function getCategories(businessId: string) {
  return getRecords<Category>("categories", businessId);
}

// Categorías con sus productos, en el orden del negocio (ADMIN-MENU-3).
export async function getCategoriesWithProducts(businessId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select(
      `
      *,
      products (*)
    `,
    )
    .eq("business_id", businessId);

  if (error) {
    throw new Error(error.message);
  }

  return sortByOrder(data ?? []).map((category) => ({
    ...category,
    products: sortByOrder(category.products ?? []),
  }));
}

export async function getCategory(businessId: string, id: string) {
  return getRecord<Category>("categories", businessId, id);
}

export async function createCategory(
  businessId: string,
  payload: { name: string; description?: string; active?: boolean },
) {
  await insertRecord("categories", {
    business_id: businessId,
    name: payload.name,
    description: payload.description || null,
    active: payload.active ?? true,
  });
}

export async function updateCategory(
  businessId: string,
  id: string,
  payload: { name: string; description?: string; active?: boolean },
) {
  await updateRecord("categories", id, businessId, {
    name: payload.name,
    description: payload.description || null,
    active: payload.active ?? true,
  });
}

export async function deleteCategory(businessId: string, id: string) {
  await deleteRecord("categories", businessId, id);
}
