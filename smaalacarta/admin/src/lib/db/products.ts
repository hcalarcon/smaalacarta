import {
  getRecord,
  getRecords,
  updateRecord,
  deleteRecord,
} from "@/lib/db/resources";
import { createClient } from "@/lib/supabase-server";
import {
  toProductInsert,
  toProductUpdate,
  type ProductInput,
} from "@/lib/menu/product-fields";

export type Product = {
  id: string;
  business_id: string;
  // Nulo cuando se borra la categoría del producto (ON DELETE SET NULL).
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  image_url: string | null;
  featured: boolean;
  sold_out: boolean;
  // Lo completa la página del menú: el producto tiene algún grupo de opciones (ADMIN-OPCIONES-13).
  has_options?: boolean;
  name_en: string | null;
  name_pt: string | null;
  description_en: string | null;
  description_pt: string | null;
  created_at: string;
  updated_at: string;
};

export async function getProducts(businessId: string) {
  return getRecords<Product>("products", businessId);
}

export async function getProduct(businessId: string, id: string) {
  return getRecord<Product>("products", businessId, id);
}

export async function createProduct(
  businessId: string,
  payload: ProductInput & { category_id: string },
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .insert(toProductInsert(businessId, payload))
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // El id hace falta para asociarle grupos de opciones enseguida (ADMIN-OPCIONES-13).
  return data.id;
}

export async function updateProduct(
  businessId: string,
  id: string,
  payload: ProductInput & { category_id?: string },
) {
  await updateRecord("products", id, businessId, toProductUpdate(payload));
}

// Activar o desactivar un producto sin tocar nada más (ADMIN-MENU-2 mantiene el
// resto de sus datos).
export async function setProductActive(
  businessId: string,
  id: string,
  active: boolean,
) {
  await updateRecord("products", id, businessId, { active });
}

// Marcar o quitar "Sin stock" sin tocar nada más (ADMIN-MENU-8).
export async function setProductSoldOut(
  businessId: string,
  id: string,
  soldOut: boolean,
) {
  await updateRecord("products", id, businessId, { sold_out: soldOut });
}

export async function deleteProduct(businessId: string, id: string) {
  await deleteRecord("products", businessId, id);
}
