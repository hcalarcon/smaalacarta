import { headers } from "next/headers";
import { Suspense } from "react";

import CourierBottomNav from "@/components/layout/CourierBottomNav";
import DashboardShell from "@/components/layout/DashboardShell";
import { courierLinks } from "@/components/layout/nav-links";
import PushToggle from "@/components/pwa/PushToggle";
import { requireCourier } from "@/lib/auth/courier";
import { courierPanelTitle } from "@/lib/courier/panel";
import { getCourierName } from "@/lib/db/couriers";
import { getCourierTermsStatus } from "@/lib/db/courier-terms";
import { mustAccept, pickLang } from "@/lib/courier/terms";
import { loadTerms } from "@/lib/courier/terms-file";
import { listCourierOrders } from "@/lib/db/courier";
import { courierOrderState } from "@/lib/courier/settlements";
import TermsGate from "./components/TermsGate";

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  // Sin sesión va a /login; quien no es repartidor, a su panel (ENVIO-30).
  const { user, courierId } = await requireCourier();
  const [name, orders, terms] = await Promise.all([
    getCourierName(courierId),
    listCourierOrders(),
    // Si esta consulta falla no se cae todo el panel: la base exige los términos igual al ver, tomar y ofertar.
    getCourierTermsStatus().catch(() => null),
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
      bottomNav={
        gated ? undefined : (
          <Suspense fallback={null}>
            <CourierBottomNav toSettleCount={toSettleCount} />
          </Suspense>
        )
      }
    >
      {/* Para el repartidor, enterarse de los pedidos es todo el negocio (ADMIN-PWA-15). */}
      {gated ? (
        <TermsGate
          body={loadTerms().body}
          version={terms!.version}
          lang={pickLang((await headers()).get("accept-language"))}
        />
      ) : (
        <>
          <PushToggle variant="banner" />
          {children}
        </>
      )}
    </DashboardShell>
  );
}
