import DashboardShell from "@/components/layout/DashboardShell";
import { courierLinks } from "@/components/layout/nav-links";
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
    >
      {children}
    </DashboardShell>
  );
}
