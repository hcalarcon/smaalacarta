import {
  getRecord,
  getRecords,
  insertRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/db/resources";

export type Product = {
  id: string;
  business_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
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
  payload: {
    category_id: string;
    name: string;
    description?: string;
    price: number;
    active?: boolean;
  },
) {
  await insertRecord("products", {
    business_id: businessId,
    category_id: payload.category_id,
    name: payload.name,
    description: payload.description || null,
    price: payload.price,
    active: payload.active ?? true,
  });
}

export async function updateProduct(
  businessId: string,
  id: string,
  payload: {
    category_id: string;
    name: string;
    description?: string;
    price: number;
    active?: boolean;
  },
) {
  await updateRecord("products", id, businessId, {
    category_id: payload.category_id,
    name: payload.name,
    description: payload.description || null,
    price: payload.price,
    active: payload.active ?? true,
  });
}

export async function deleteProduct(businessId: string, id: string) {
  await deleteRecord("products", businessId, id);
}
