import DashboardShell from "@/components/layout/DashboardShell";
import { courierLinks } from "@/components/layout/nav-links";
import PushToggle from "@/components/pwa/PushToggle";
import { requireCourier } from "@/lib/auth/courier";

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  // Sin sesión va a /login; quien no es repartidor, a su panel (ENVIO-30).
  const { user } = await requireCourier();

  return (
    <DashboardShell
      title="Repartos al Toque"
      subtitle="Pedidos con envío"
      sidebarSubtitle="Panel del repartidor"
      userEmail={user.email ?? ""}
      links={courierLinks}
      showAppControls
    >
      {/* Para el repartidor, enterarse de los pedidos es todo el negocio (ADMIN-PWA-15). */}
      <PushToggle variant="banner" />
      {children}
    </DashboardShell>
  );
}
