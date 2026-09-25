import type { Metadata } from "next";
import Link from "next/link";

import PromotionsClient from "./components/PromotionsClient";
import { listPromotions } from "@/lib/db/promotions";
import { requireBusiness } from "@/lib/get-current-business";

export const metadata: Metadata = { title: "Promociones" };

export default async function PromotionsPage() {
  const { business } = await requireBusiness();
  const promotions = await listPromotions(business.id);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand">Promociones</h1>
          <p className="mt-2 text-stone-500">
            Armá ofertas con productos de tu menú.
          </p>
        </div>

        <Link
          href="/dashboard/promotions/nueva"
          className="rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          + Nueva promoción
        </Link>
      </section>

      <PromotionsClient promotions={promotions} />
    </div>
  );
}
