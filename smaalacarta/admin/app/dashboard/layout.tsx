import { redirect } from "next/navigation";

import SuspendedBanner from "@/components/dashboard/SuspendedBanner";
import DashboardShell from "@/components/layout/DashboardShell";
import { dashboardLinks } from "@/components/layout/nav-links";
import { getSuperAdminStatus } from "@/lib/auth/superadmin";
import { countPendingOrders } from "@/lib/db/summary";
import { resolveAccess } from "@/lib/get-current-business";
import { menuLinks } from "@/lib/menu-url";
import { hasDigitalMenu, hasOrders } from "@/lib/plan-access";

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

  const plan = {
    planPdf: current!.business!.plan_pdf,
    planWeb: current!.business!.plan_web,
    planCompleto: current!.business!.plan_completo,
  };
  const digitalMenu = hasDigitalMenu(plan);
  const orders = hasOrders(plan);

  // Menú y Promociones solo tienen sentido con un menú digital; Pedidos, solo
  // con carrito (plan_completo) — ver src/lib/plan-access.ts.
  const HIDDEN_WITHOUT_DIGITAL_MENU = ["/dashboard/menu", "/dashboard/promotions"];
  let links = dashboardLinks.filter(
    (link) =>
      (digitalMenu || !HIDDEN_WITHOUT_DIGITAL_MENU.includes(link.href)) &&
      (orders || link.href !== "/dashboard/orders"),
  );

  if (orders) {
    // Pedidos nuevos: el contador junto a "Pedidos" (ADMIN-RESUMEN-3).
    const pending = await countPendingOrders(current!.business!.id);
    links = links.map((link) =>
      link.href === "/dashboard/orders" ? { ...link, badge: pending } : link,
    );
  }

  // Un botón por cada servicio que el negocio realmente tenga (RUTAS-4): el
  // que no tiene plan_completo no ve "Ver carrito", etc.
  const { interactivo, estatico, pdf } = menuLinks(current!.business!.slug, plan);
  const quickLinks = [
    interactivo ? { href: interactivo, label: "Ver carrito", short: "Carrito" } : null,
    estatico ? { href: estatico, label: "Ver menú", short: "Menú" } : null,
    pdf ? { href: pdf, label: "Ver QR", short: "QR" } : null,
  ].filter((link) => link !== null);

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
      quickLinks={quickLinks}
      showChangePassword={false}
      banner={current!.business!.active ? undefined : <SuspendedBanner />}
    >
      {children}
    </DashboardShell>
  );
}
