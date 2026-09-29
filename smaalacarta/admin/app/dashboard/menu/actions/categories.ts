"use server";

import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/db/categories";
import type { Translations } from "@/lib/menu/translations";
import { saveOrder } from "@/lib/db/ordering";

export async function createCategoryAction(
  businessId: string,
  data: {
    name: string;
    description?: string;
    active: boolean;
  } & Translations,
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
  } & Translations,
) {
  await updateCategory(businessId, id, data);
}

export async function deleteCategoryAction(businessId: string, id: string) {
  await deleteCategory(businessId, id);
}

export async function reorderCategoriesAction(
  businessId: string,
  orderedIds: string[],
) {
  await saveOrder("categories", businessId, orderedIds);
}
