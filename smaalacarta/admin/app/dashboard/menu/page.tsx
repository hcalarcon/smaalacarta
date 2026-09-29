import { redirect } from "next/navigation";

import MenuClient from "./components/MenuClient";

import { requireBusiness } from "@/lib/get-current-business";
import { getCategoriesWithProducts } from "@/lib/db/categories";
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

  const categories = await getCategoriesWithProducts(current.business.id);

  return (
    <MenuClient
      businessId={current.business.id}
      initialCategories={categories}
    />
  );
}
