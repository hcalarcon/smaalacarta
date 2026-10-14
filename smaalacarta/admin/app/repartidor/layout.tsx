import { Suspense } from "react";

import CourierBottomNav from "@/components/layout/CourierBottomNav";
import DashboardShell from "@/components/layout/DashboardShell";
import { courierLinks } from "@/components/layout/nav-links";
import PushToggle from "@/components/pwa/PushToggle";
import { requireCourier } from "@/lib/auth/courier";
import { courierPanelTitle } from "@/lib/courier/panel";
import { getCourierName } from "@/lib/db/couriers";
import { listCourierOrders } from "@/lib/db/courier";
import { courierOrderState } from "@/lib/courier/settlements";

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  // Sin sesión va a /login; quien no es repartidor, a su panel (ENVIO-30).
  const { user, courierId } = await requireCourier();
  const [name, orders] = await Promise.all([getCourierName(courierId), listCourierOrders()]);
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
        <Suspense fallback={null}>
          <CourierBottomNav toSettleCount={toSettleCount} />
        </Suspense>
      }
    >
      {/* Para el repartidor, enterarse de los pedidos es todo el negocio (ADMIN-PWA-15). */}
      <PushToggle variant="banner" />
      {children}
    </DashboardShell>
  );
}
