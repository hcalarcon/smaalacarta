"use server";

import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/db/categories";

export async function createCategoryAction(
  businessId: string,
  data: {
    name: string;
    description?: string;
    active: boolean;
  },
) {
  await createCategory(businessId, data);
}

export async function updateCategoryAction(
  businessId: string,
  id: string,
  data: {
    name: string;
    description?: string;
    active: boolean;
  },
) {
  await updateCategory(businessId, id, data);
}

export async function deleteCategoryAction(businessId: string, id: string) {
  await deleteCategory(businessId, id);
}
