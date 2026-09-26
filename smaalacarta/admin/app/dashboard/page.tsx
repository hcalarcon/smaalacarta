import type { Metadata } from "next";

import Link from "next/link";

import CopyLinkButton from "@/components/dashboard/CopyLinkButton";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { getBusinessSummary } from "@/lib/db/summary";
import { requireBusiness } from "@/lib/get-current-business";
import { menuUrl } from "@/lib/menu-url";

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

      {summary.pendingOrders > 0 ? (
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

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-brand">Tu menú</h2>
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
              summary.published
                ? "bg-emerald-100 text-emerald-700"
                : "bg-line text-stone-600"
            }`}
          >
            {summary.published ? "● Publicado" : "Sin publicar"}
          </span>
        </div>

        <p className="mt-2 break-all font-mono text-sm text-stone-600">
          {menuUrl(business.slug)}
        </p>

        {summary.published ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={menuUrl(business.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Ver mi menú
            </a>
            <CopyLinkButton value={menuUrl(business.slug)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-500">
            Todavía no lo ven tus clientes. Activá <strong>Menú público</strong> en{" "}
            <Link href="/dashboard/settings" className="font-medium text-brand underline">
              Configuración
            </Link>{" "}
            cuando esté listo.
          </p>
        )}
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
