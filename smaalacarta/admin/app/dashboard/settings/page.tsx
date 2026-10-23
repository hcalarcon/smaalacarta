import type { Metadata } from "next";

import ResetPasswordForm from "../../(auth)/components/ResetPasswordForm";
import BusinessProfileForm from "./components/BusinessProfileForm";
import DeliveryPricingSection from "./components/DeliveryPricingSection";
import DeliverySection from "./components/DeliverySection";
import SettingsForm from "./components/SettingsForm";
import SettingsLayout from "./components/SettingsLayout";
import SettingsSaveProvider from "./components/SettingsSaveProvider";
import MercadoPagoSection from "./components/MercadoPagoSection";
import ShareSection from "./components/ShareSection";
import Section from "@/components/ui/Section";
import { getBusinessDeliveryPricing } from "@/lib/db/delivery-pricing";
import { getDeliveryOptions } from "@/lib/db/delivery-zones";
import { getSettings } from "@/lib/db/settings";
import { requireBusiness } from "@/lib/get-current-business";
import { getMpConnectionStatus, hasMercadoPago, mpOauthAvailable } from "@/lib/mp/oauth-status";
import { hasDigitalMenu, hasPdf } from "@/lib/plan-access";
import { settingsSections } from "@/lib/settings/sections";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string }>;
}) {
  const { business, role } = await requireBusiness();
  const { mp } = await searchParams;
  const settings = await getSettings(business.id, business.whatsapp);
  // "Envíos" solo con el envío con repartidor habilitado por el superadmin (ENVIO-58).
  const deliveryOptions = business.courier_delivery ? await getDeliveryOptions() : null;
  // Precios del envío según el tipo que le puso el superadmin (ENVIO-227).
  const deliveryPricing = business.courier_delivery ? await getBusinessDeliveryPricing(business.id) : null;
  // "Mercado Pago" solo con los dos interruptores prendidos: el global y el del negocio (MP-15).
  const mercadoPago = mpOauthAvailable(business);
  const mpStatus = mercadoPago ? await getMpConnectionStatus(business.id) : "none";
  // Para el texto de ayuda del medio de pago: sirve también sin la tarjeta de conexión (MP-23).
  const mercadoPagoReady = await hasMercadoPago(business.id);
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
        <h1 className="text-2xl font-bold text-brand sm:text-3xl">Configuración</h1>
        <p className="mt-1 text-stone-500">
          {digitalMenu
            ? `Apariencia, horarios y contacto del menú de ${business.name}.`
            : `El PDF del menú de ${business.name}.`}
        </p>
      </section>

      <SettingsSaveProvider initialName={business.name} initialSlug={business.slug}>
        <SettingsLayout sections={settingsSections({
            digitalMenu,
            pdfService,
            courierDelivery: deliveryOptions !== null,
            mercadoPago,
          })}>
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
            mercadoPagoReady={mercadoPagoReady}
          />

          {deliveryOptions ? <DeliverySection options={deliveryOptions} /> : null}

          {deliveryPricing ? <DeliveryPricingSection pricing={deliveryPricing} /> : null}

          {mercadoPago ? (
            <MercadoPagoSection
              status={mpStatus}
              isOwner={role === "owner"}
              result={mp === "connected" || mp === "error" ? mp : null}
            />
          ) : null}

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
