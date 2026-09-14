"use server";

import { createProduct, updateProduct, deleteProduct } from "@/lib/db/products";

export async function createProductAction(
  businessId: string,
  data: {
    category_id: string;
    name: string;
    description?: string;
    price: number;
    active: boolean;
  },
) {
  await createProduct(businessId, data);
}

export async function updateProductAction(
  businessId: string,
  id: string,
  data: {
    category_id: string;
    name: string;
    description?: string;
    price: number;
    active: boolean;
  },
) {
  await updateProduct(businessId, id, data);
}

export async function deleteProductAction(businessId: string, id: string) {
  await deleteProduct(businessId, id);
}
