import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import PromotionEditor from "../components/PromotionEditor";
import { getPromotion, listProductsForPromotions } from "@/lib/db/promotions";
import { requireBusiness } from "@/lib/get-current-business";
import { hasDigitalMenu } from "@/lib/plan-access";

export const metadata: Metadata = { title: "Editar promoción" };

export default async function EditPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Un id que no es un UUID haría fallar la consulta: se trata como inexistente.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

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

  const [promotion, products] = await Promise.all([
    getPromotion(business.id, id),
    listProductsForPromotions(business.id),
  ]);

  if (!promotion) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/promotions"
          className="text-sm font-medium text-accent hover:text-accent-hover"
        >
          ← Promociones
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-brand">Editar promoción</h1>
      </div>

      <PromotionEditor
        products={products}
        initial={{
          id: promotion.id,
          name: promotion.name,
          description: promotion.description ?? "",
          type: promotion.type,
          discountPercent: Number(promotion.discount_percent),
          price: promotion.price == null ? null : Number(promotion.price),
          active: promotion.active,
          productIds: promotion.promotion_items.map((item) => item.product_id),
        }}
      />
    </div>
  );
}
