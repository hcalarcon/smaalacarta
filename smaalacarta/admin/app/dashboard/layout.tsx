import { redirect } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import { dashboardLinks } from "@/components/layout/nav-links";
import { getSuperAdminStatus } from "@/lib/auth/superadmin";
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

  return (
    <DashboardShell
      title={current!.business!.name}
      subtitle="Administración del negocio"
      sidebarSubtitle="Panel administrador"
      userEmail={current!.user.email ?? ""}
      links={dashboardLinks}
      switchLink={
        isSuperAdmin ? { href: "/superadmin", label: "Superadmin" } : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
