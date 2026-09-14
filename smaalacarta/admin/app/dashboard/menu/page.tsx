import { redirect } from "next/navigation";

import MenuClient from "./components/MenuClient";

import { getCurrentBusiness } from "@/lib/get-current-business";
import { getCategoriesWithProducts } from "@/lib/db/categories";

export default async function MenuPage() {
  const current = await getCurrentBusiness();

  if (!current) {
    redirect("/login");
  }

  const categories = await getCategoriesWithProducts(current.business.id);

  return (
    <MenuClient
      businessId={current.business.id}
      initialCategories={categories}
    />
  );
}
