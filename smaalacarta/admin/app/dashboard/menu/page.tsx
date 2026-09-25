import MenuClient from "./components/MenuClient";

import { requireBusiness } from "@/lib/get-current-business";
import { getCategoriesWithProducts } from "@/lib/db/categories";

export default async function MenuPage() {
  const current = await requireBusiness();

  const categories = await getCategoriesWithProducts(current.business.id);

  return (
    <MenuClient
      businessId={current.business.id}
      initialCategories={categories}
    />
  );
}
