import type { Metadata } from "next";

import NewCourierForm from "../components/NewCourierForm";
import { listBusinessChoices } from "@/lib/db/couriers";

export const metadata: Metadata = { title: "Nuevo repartidor" };

export default async function NewCourierPage() {
  const businesses = await listBusinessChoices();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand">Nuevo repartidor</h1>
        <p className="mt-2 text-stone-500">
          Se crea la cuenta del repartidor con una contraseña temporal, que se muestra una sola vez. No se envía
          ningún mail. Después marca sus zonas en &ldquo;Mis zonas&rdquo;.
        </p>
      </section>

      <div className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <NewCourierForm businesses={businesses} />
      </div>
    </div>
  );
}
