import type { Metadata } from "next";

import Link from "next/link";

import DashboardCard from "@/components/dashboard/DashboardCard";
import PlanBadges from "@/components/dashboard/PlanBadges";
import { getBusinessSummary } from "@/lib/db/summary";
import { requireBusiness } from "@/lib/get-current-business";
import { hasDigitalMenu, hasOrders } from "@/lib/plan-access";

export const metadata: Metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const { business } = await requireBusiness();
  const summary = await getBusinessSummary(business.id);

  const plan = {
    planPdf: business.plan_pdf,
    planWeb: business.plan_web,
    planCompleto: business.plan_completo,
  };
  const digitalMenu = hasDigitalMenu(plan);
  const orders = hasOrders(plan);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand">Resumen</h1>

        <p className="mt-2 text-stone-500">
          Así está {business.name} en este momento.
        </p>
      </section>

      <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        <p className="text-sm text-stone-500">Tu plan</p>
        <div className="mt-2">
          <PlanBadges plan={plan} />
        </div>
      </section>

      {orders && summary.pendingOrders > 0 ? (
        <Link
          href="/dashboard/orders"
          className="flex items-center justify-between gap-4 rounded-3xl border border-accent/40 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div>
            <p className="text-lg font-bold text-brand">
              {summary.pendingOrders === 1
                ? "Tenés 1 pedido nuevo"
                : `Tenés ${summary.pendingOrders} pedidos nuevos`}
            </p>
            <p className="text-sm text-stone-500">Confirmalos para que tus clientes sepan que los recibiste.</p>
          </div>
          <span className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white">
            Ver pedidos
          </span>
        </Link>
      ) : null}

      {digitalMenu || orders ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {orders ? (
            <DashboardCard
              title="Pedidos hoy"
              value={String(summary.ordersToday)}
              description="Pedidos registrados hoy"
            />
          ) : null}

          {digitalMenu ? (
            <>
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
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
