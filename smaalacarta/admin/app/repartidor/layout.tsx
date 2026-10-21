import { headers } from "next/headers";
import { Suspense } from "react";

import CourierBottomNav from "@/components/layout/CourierBottomNav";
import DashboardShell from "@/components/layout/DashboardShell";
import { courierLinks } from "@/components/layout/nav-links";
import { requireCourier } from "@/lib/auth/courier";
import { courierPanelTitle } from "@/lib/courier/panel";
import { getCourierName } from "@/lib/db/couriers";
import { getCourierTermsStatus } from "@/lib/db/courier-terms";
import { mustAccept, pickLang } from "@/lib/courier/terms";
import { loadTerms } from "@/lib/courier/terms-file";
import { listCourierOrders } from "@/lib/db/courier";
import { courierOrderState } from "@/lib/courier/settlements";
import AvailabilityToggle from "./components/AvailabilityToggle";
import TermsGate from "./components/TermsGate";
import TutorialProvider from "./components/TutorialProvider";
import { getTutorialStatus } from "@/lib/db/courier-tutorial";
import { getCourierAvailability } from "@/lib/db/availability";
import { pickAvailabilityLang } from "@/lib/courier/availability";

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  // Sin sesión va a /login; quien no es repartidor, a su panel (ENVIO-30).
  const { user, courierId } = await requireCourier();
  const [name, orders, terms, availability, tutorial] = await Promise.all([
    getCourierName(courierId),
    listCourierOrders(),
    // Si esta consulta falla no se cae todo el panel: la base exige los términos igual al ver, tomar y ofertar.
    getCourierTermsStatus().catch(() => null),
    // Sin este dato no se muestra el estado, pero el panel anda igual (ENVIO-189).
    getCourierAvailability().catch(() => null),
    // Sin este dato no hay tutorial, pero el panel anda igual (ENVIO-213).
    getTutorialStatus().catch(() => null),
  ]);
  // Sin aceptar los términos vigentes no hay panel (ENVIO-183): la base tampoco le da pedidos (ENVIO-182).
  const gated = terms !== null && mustAccept(terms);
  const toSettleCount = orders.filter((item) => courierOrderState(item) === "to_settle").length;

  return (
    <DashboardShell
      title={courierPanelTitle(name)}
      subtitle="Pedidos con envío"
      sidebarSubtitle="Panel del repartidor"
      userEmail={user.email ?? ""}
      links={courierLinks}
      showAppControls
      statusSlot={
        !gated && availability?.enabled ? (
          <AvailabilityToggle
            status={availability}
            lang={pickAvailabilityLang((await headers()).get("accept-language"))}
          />
        ) : undefined
      }
      bottomNav={
        gated ? undefined : (
          <Suspense fallback={null}>
            <CourierBottomNav toSettleCount={toSettleCount} />
          </Suspense>
        )
      }
    >
      {gated ? (
        <TermsGate
          body={loadTerms().body}
          version={terms!.version}
          lang={pickLang((await headers()).get("accept-language"))}
        />
      ) : tutorial ? (
        <TutorialProvider mode={tutorial.mode} zonePrice={tutorial.zonePrice} autoStart={!tutorial.seen}>
          {children}
        </TutorialProvider>
      ) : (
        children
      )}
    </DashboardShell>
  );
}
