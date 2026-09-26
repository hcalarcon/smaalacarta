import { redirect } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import { dashboardLinks } from "@/components/layout/nav-links";
import { getSuperAdminStatus } from "@/lib/auth/superadmin";
import { countPendingOrders } from "@/lib/db/summary";
import { resolveAccess } from "@/lib/get-current-business";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { current, state } = await resolveAccess();

  if (state === "login") redirect("/login");
  if (state === "superadmin") redirect("/superadmin");
  if (state === "sin-negocio") redirect("/sin-negocio");

  // Un superadmin que además tiene negocio puede pasar a /superadmin.
  const { isSuperAdmin } = await getSuperAdminStatus();

  // Pedidos nuevos: el contador junto a "Pedidos" (ADMIN-RESUMEN-3).
  const pending = await countPendingOrders(current!.business!.id);
  const links = dashboardLinks.map((link) =>
    link.href === "/dashboard/orders" ? { ...link, badge: pending } : link,
  );

  return (
    <DashboardShell
      title={current!.business!.name}
      subtitle="Administración del negocio"
      sidebarSubtitle="Panel administrador"
      userEmail={current!.user.email ?? ""}
      links={links}
      switchLink={
        isSuperAdmin ? { href: "/superadmin", label: "Superadmin" } : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
