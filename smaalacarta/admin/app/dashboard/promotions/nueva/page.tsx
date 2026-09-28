import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import PromotionEditor from "../components/PromotionEditor";
import { listProductsForPromotions } from "@/lib/db/promotions";
import { requireBusiness } from "@/lib/get-current-business";
import { hasDigitalMenu } from "@/lib/plan-access";

export const metadata: Metadata = { title: "Nueva promoción" };

export default async function NewPromotionPage() {
  const { business } = await requireBusiness();

  if (
    !hasDigitalMenu({
      planPdf: business.plan_pdf,
      planWeb: business.plan_web,
      planCompleto: business.plan_completo,
    })
  ) {
    redirect("/dashboard");
  }

  const products = await listProductsForPromotions(business.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/promotions"
          className="text-sm font-medium text-accent hover:text-accent-hover"
        >
          ← Promociones
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-brand">Nueva promoción</h1>
      </div>

      <PromotionEditor products={products} />
    </div>
  );
}
