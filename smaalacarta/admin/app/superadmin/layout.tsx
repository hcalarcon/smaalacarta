import DashboardShell from "@/components/layout/DashboardShell";
import { superAdminLinks } from "@/components/layout/nav-links";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { resolveAccess } from "@/lib/get-current-business";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sin sesión va a /login; un usuario común, a su panel (ADMIN-SUPER-7).
  const user = await requireSuperAdmin();

  // Un superadmin que además tiene negocio puede pasar a su panel.
  const { current } = await resolveAccess();

  return (
    <DashboardShell
      title="Superadmin"
      subtitle="Alta de negocios y cuentas"
      sidebarSubtitle="Equipo de SMA a la Carta"
      userEmail={user.email ?? ""}
      links={superAdminLinks}
      switchLink={
        current?.business
          ? { href: "/dashboard", label: "Mi panel" }
          : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
