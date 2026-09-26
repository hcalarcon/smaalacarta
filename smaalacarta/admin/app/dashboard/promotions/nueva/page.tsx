import type { Metadata } from "next";
import Link from "next/link";

import PromotionEditor from "../components/PromotionEditor";
import { listProductsForPromotions } from "@/lib/db/promotions";
import { requireBusiness } from "@/lib/get-current-business";

export const metadata: Metadata = { title: "Nueva promoción" };

export default async function NewPromotionPage() {
  const { business } = await requireBusiness();
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
