import { redirect } from "next/navigation";

import SuspendedBanner from "@/components/dashboard/SuspendedBanner";
import DashboardShell from "@/components/layout/DashboardShell";
import { dashboardLinks } from "@/components/layout/nav-links";
import { getSuperAdminStatus } from "@/lib/auth/superadmin";
import { countPendingOrders } from "@/lib/db/summary";
import { resolveAccess } from "@/lib/get-current-business";
import { menuLinks, primaryMenuLink } from "@/lib/menu-url";

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

  // La más completa que tenga el negocio, según su plan (RUTAS-4); sin ninguna
  // (caso raro: un negocio sin plan cargado) no se muestra el botón.
  const menuHref = primaryMenuLink(
    menuLinks(current!.business!.slug, {
      planPdf: current!.business!.plan_pdf,
      planWeb: current!.business!.plan_web,
      planCompleto: current!.business!.plan_completo,
    }),
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
      menuLink={menuHref ? { href: menuHref, label: "Ver mi menú" } : undefined}
      showChangePassword={false}
      banner={current!.business!.active ? undefined : <SuspendedBanner />}
    >
      {children}
    </DashboardShell>
  );
}
