import type { Metadata } from "next";

import ResetPasswordForm from "../../(auth)/components/ResetPasswordForm";
import BusinessProfileForm from "./components/BusinessProfileForm";
import SettingsForm from "./components/SettingsForm";
import SettingsLayout from "./components/SettingsLayout";
import SettingsSaveProvider from "./components/SettingsSaveProvider";
import ShareSection from "./components/ShareSection";
import Section from "@/components/ui/Section";
import { getSettings } from "@/lib/db/settings";
import { requireBusiness } from "@/lib/get-current-business";
import { hasDigitalMenu, hasPdf } from "@/lib/plan-access";
import { settingsSections } from "@/lib/settings/sections";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const { business } = await requireBusiness();
  const settings = await getSettings(business.id, business.whatsapp);
  const plan = {
    planPdf: business.plan_pdf,
    planWeb: business.plan_web,
    planCompleto: business.plan_completo,
  };
  const digitalMenu = hasDigitalMenu(plan);
  // "Menú en PDF" solo con plan_pdf: plan_completo solo no habilita ese servicio (ADMIN-PLAN-4).
  const pdfService = hasPdf(plan);

  return (
    // Un poco más ancho y con menos relleno que el resto del panel (ADMIN-CONFIG-39): los márgenes
    // negativos le devuelven ancho al contenido solo en esta pantalla.
    <div className="mx-auto max-w-6xl space-y-4 lg:-mx-3 xl:mx-auto">
      <section>
        <h1 className="text-3xl font-bold text-brand">Configuración</h1>
        <p className="mt-1 text-stone-500">
          {digitalMenu
            ? `Apariencia, horarios y contacto del menú de ${business.name}.`
            : `El PDF del menú de ${business.name}.`}
        </p>
      </section>

      <SettingsSaveProvider initialName={business.name} initialSlug={business.slug}>
        <SettingsLayout sections={settingsSections({ digitalMenu, pdfService })}>
          <BusinessProfileForm />

          <ShareSection
            name={business.name}
            slug={business.slug}
            planPdf={business.plan_pdf}
            planWeb={business.plan_web}
            planCompleto={business.plan_completo}
          />

          <SettingsForm
            businessId={business.id}
            initial={settings}
            digitalMenu={digitalMenu}
            pdfService={pdfService}
          />

          <Section
            id="contrasena"
            title="Contraseña"
            description="Cambiá la contraseña de tu cuenta."
          >
            <ResetPasswordForm />
          </Section>
        </SettingsLayout>
      </SettingsSaveProvider>
    </div>
  );
}
