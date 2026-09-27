import type { Metadata } from "next";

import ResetPasswordForm from "../../(auth)/components/ResetPasswordForm";
import BusinessProfileForm from "./components/BusinessProfileForm";
import SettingsForm from "./components/SettingsForm";
import ShareSection from "./components/ShareSection";
import Section from "@/components/ui/Section";
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

      <BusinessProfileForm
        initialName={business.name}
        initialSlug={business.slug}
      />

      <ShareSection name={business.name} slug={business.slug} />

      <SettingsForm businessId={business.id} initial={settings} />

      <Section
        title="Contraseña"
        description="Cambiá la contraseña de tu cuenta."
      >
        <ResetPasswordForm />
      </Section>
    </div>
  );
}
