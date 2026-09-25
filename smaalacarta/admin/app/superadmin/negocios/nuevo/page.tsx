import type { Metadata } from "next";

import NewBusinessForm from "../../components/NewBusinessForm";

export const metadata: Metadata = { title: "Nuevo negocio" };

export default function NewBusinessPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand">Nuevo negocio</h1>
        <p className="mt-2 text-stone-500">
          Se crea el negocio y su cuenta dueña. Si el email no tiene cuenta, le
          enviamos una invitación por mail para que elija su contraseña.
        </p>
      </section>

      <div className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <NewBusinessForm />
      </div>
    </div>
  );
}
