import type { Metadata } from "next";
import Link from "next/link";

import { listCouriers } from "@/lib/db/couriers";

export const metadata: Metadata = { title: "Repartidores" };

export default async function CouriersPage() {
  const couriers = await listCouriers();

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand">Repartidores</h1>
          <p className="mt-2 text-stone-500">
            {couriers.length === 1 ? "1 repartidor dado de alta." : `${couriers.length} repartidores dados de alta.`}
          </p>
        </div>

        <Link
          href="/superadmin/repartidores/nuevo"
          className="rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          + Nuevo repartidor
        </Link>
      </section>

      {couriers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-white p-10 text-center text-stone-500">
          Todavía no hay repartidores. Creá el primero con &ldquo;Nuevo repartidor&rdquo;.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {couriers.map((courier) => (
            <li key={courier.id}>
              <Link
                href={`/superadmin/repartidores/${courier.id}`}
                className="block h-full rounded-3xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-brand">{courier.name}</h2>
                  {!courier.active ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      Inactivo
                    </span>
                  ) : null}
                </div>

                <dl className="mt-4 space-y-1 text-sm text-stone-600">
                  <div className="flex gap-2">
                    <dt className="text-stone-400">WhatsApp:</dt>
                    <dd>{courier.whatsapp ?? "sin cargar"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-stone-400">Zonas:</dt>
                    <dd>
                      {courier.zoneCount === 0
                        ? "ninguna todavía"
                        : courier.zoneCount === 1
                          ? "1 zona"
                          : `${courier.zoneCount} zonas`}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-stone-400">Cuenta:</dt>
                    <dd className="truncate">{courier.email ?? "sin cuenta"}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
