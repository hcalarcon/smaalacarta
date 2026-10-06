import { redirect } from "next/navigation";

import MenuClient from "./components/MenuClient";

import { requireBusiness } from "@/lib/get-current-business";
import { getCategoriesWithProducts } from "@/lib/db/categories";
import {
  listOptionGroups,
  listProductGroupLinks,
  listProductIdsInPromotions,
} from "@/lib/db/options";
import type { Product } from "@/lib/db/products";
import { hasDigitalMenu } from "@/lib/plan-access";

export default async function MenuPage() {
  const current = await requireBusiness();

  // Categorías y productos solo tienen sentido con un menú digital
  // (plan_web o plan_completo); un negocio solo con plan_pdf no tiene uno.
  if (
    !hasDigitalMenu({
      planPdf: current.business.plan_pdf,
      planWeb: current.business.plan_web,
      planCompleto: current.business.plan_completo,
    })
  ) {
    redirect("/dashboard");
  }

  const [categories, optionGroups, productGroupLinks, productIdsInPromotions] =
    await Promise.all([
      getCategoriesWithProducts(current.business.id),
      listOptionGroups(current.business.id),
      listProductGroupLinks(current.business.id),
      listProductIdsInPromotions(current.business.id),
    ]);

  // Cuántos productos usa cada grupo.
  const groupUsage: Record<string, number> = {};
  for (const groupIds of Object.values(productGroupLinks)) {
    for (const id of groupIds) groupUsage[id] = (groupUsage[id] ?? 0) + 1;
  }

  // Cada producto sabe si tiene opciones, para el chip "Con opciones" (ADMIN-OPCIONES-13).
  const withOptionFlags = categories.map((category) => ({
    ...category,
    products: category.products.map((product: Product) => ({
      ...product,
      has_options: (productGroupLinks[product.id]?.length ?? 0) > 0,
    })),
  }));

  return (
    <MenuClient
      businessId={current.business.id}
      initialCategories={withOptionFlags}
      optionGroups={optionGroups}
      productGroupLinks={productGroupLinks}
      groupUsage={groupUsage}
      productIdsInPromotions={productIdsInPromotions}
    />
  );
}
