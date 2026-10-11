import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CourierProfileForm from "../components/CourierProfileForm";
import ResetPasswordButton from "../../components/ResetPasswordButton";
import { getCourier } from "@/lib/db/couriers";

export const metadata: Metadata = { title: "Repartidor" };

export default async function CourierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Un id que no es un UUID haría fallar la consulta: se trata como inexistente.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const courier = await getCourier(id);
  if (!courier) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/superadmin/repartidores" className="text-sm font-medium text-accent hover:text-accent-hover">
          ← Todos los repartidores
        </Link>
      </div>

      <section>
        <h1 className="text-3xl font-bold text-brand">{courier.name}</h1>
        <p className="mt-2 text-stone-500">
          {courier.zoneCount === 1 ? "Cubre 1 zona" : `Cubre ${courier.zoneCount} zonas`}
          {courier.email ? ` · ${courier.email}` : " · sin cuenta"}
        </p>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-brand">Datos</h2>
        <div className="mt-4">
          <CourierProfileForm
            courierId={courier.id}
            name={courier.name}
            whatsapp={courier.whatsapp ?? ""}
            active={courier.active}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-brand">Cuenta</h2>
        {courier.email ? (
          <div className="mt-4">
            <ResetPasswordButton courierId={courier.id} label={courier.email} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500">Este repartidor no tiene una cuenta para entrar.</p>
        )}
      </section>
    </div>
  );
}
