import {
  getRecord,
  getRecords,
  insertRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/db/resources";
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
  await insertRecord("products", toProductInsert(businessId, payload));
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

export async function deleteProduct(businessId: string, id: string) {
  await deleteRecord("products", businessId, id);
}
