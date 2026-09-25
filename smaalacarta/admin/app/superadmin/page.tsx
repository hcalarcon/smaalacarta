import type { Metadata } from "next";
import Link from "next/link";

import { listBusinesses } from "@/lib/db/superadmin";

export const metadata: Metadata = { title: "Negocios" };

export default async function SuperAdminHomePage() {
  const businesses = await listBusinesses();

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand">Negocios</h1>
          <p className="mt-2 text-stone-500">
            {businesses.length === 1
              ? "1 negocio dado de alta."
              : `${businesses.length} negocios dados de alta.`}
          </p>
        </div>

        <Link
          href="/superadmin/negocios/nuevo"
          className="rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          + Nuevo negocio
        </Link>
      </section>

      {businesses.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-white p-10 text-center text-stone-500">
          Todavía no hay negocios. Creá el primero con &ldquo;Nuevo negocio&rdquo;.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {businesses.map((business) => {
            const owners = business.business_users
              .filter((member) => member.role === "owner")
              .map((member) => member.profiles?.email ?? "sin email");

            return (
              <li key={business.id}>
                <Link
                  href={`/superadmin/negocios/${business.id}`}
                  className="block h-full rounded-3xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <h2 className="text-lg font-semibold text-brand">
                    {business.name}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">{business.slug}</p>

                  <dl className="mt-4 space-y-1 text-sm text-stone-600">
                    <div className="flex gap-2">
                      <dt className="text-stone-400">Dueño:</dt>
                      <dd className="truncate">
                        {owners.length ? owners.join(", ") : "sin dueño"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-stone-400">Miembros:</dt>
                      <dd>{business.business_users.length}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
