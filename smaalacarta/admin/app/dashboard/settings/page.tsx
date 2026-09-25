import type { Metadata } from "next";

import SettingsForm from "./components/SettingsForm";
import { getSettings } from "@/lib/db/settings";
import { requireBusiness } from "@/lib/get-current-business";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const { business } = await requireBusiness();
  const settings = await getSettings(business.id, business.whatsapp);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand">Configuración</h1>
        <p className="mt-2 text-stone-500">
          Apariencia, horarios y contacto del menú de {business.name}.
        </p>
      </section>

      <SettingsForm slug={business.slug} initial={settings} />
    </div>
  );
}
