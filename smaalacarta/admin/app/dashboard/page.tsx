import type { Metadata } from "next";

import DashboardCard from "@/components/dashboard/DashboardCard";
import { getBusinessSummary } from "@/lib/db/summary";
import { requireBusiness } from "@/lib/get-current-business";

export const metadata: Metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const { business } = await requireBusiness();
  const summary = await getBusinessSummary(business.id);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand">Resumen</h1>

        <p className="mt-2 text-stone-500">
          Así está {business.name} en este momento.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          title="Pedidos hoy"
          value={String(summary.ordersToday)}
          description="Pedidos registrados hoy"
        />

        <DashboardCard
          title="Categorías"
          value={String(summary.categories)}
          description="Secciones de tu menú"
        />

        <DashboardCard
          title="Productos"
          value={String(summary.products)}
          description="Productos activos"
        />

        <DashboardCard
          title="Promociones"
          value={String(summary.promotions)}
          description="Promos activas"
        />
      </section>
    </div>
  );
}
