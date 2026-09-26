"use server";

import {
  createProduct,
  updateProduct,
  deleteProduct,
  setProductActive,
} from "@/lib/db/products";
import { saveOrder } from "@/lib/db/ordering";

export async function createProductAction(
  businessId: string,
  data: {
    category_id: string;
    name: string;
    description?: string;
    price: number;
    active: boolean;
    image_url?: string | null;
  },
) {
  await createProduct(businessId, data);
}

export async function updateProductAction(
  businessId: string,
  id: string,
  data: {
    // Si no se indica, el producto conserva su categoría (ADMIN-MENU-2).
    category_id?: string;
    name: string;
    description?: string;
    price: number;
    active: boolean;
    image_url?: string | null;
  },
) {
  await updateProduct(businessId, id, data);
}

export async function deleteProductAction(businessId: string, id: string) {
  await deleteProduct(businessId, id);
}

export async function setProductActiveAction(
  businessId: string,
  id: string,
  active: boolean,
) {
  await setProductActive(businessId, id, active);
}

// `orderedIds` son los productos de una categoría, en el orden nuevo.
export async function reorderProductsAction(
  businessId: string,
  orderedIds: string[],
) {
  await saveOrder("products", businessId, orderedIds);
}
