import { redirect } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import { accessState } from "@/lib/auth/access";
import { getCurrentBusiness } from "@/lib/get-current-business";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentBusiness();

  const state = accessState({
    user: current?.user ?? null,
    business: current?.business ?? null,
  });

  if (state === "login") redirect("/login");
  if (state === "sin-negocio") redirect("/sin-negocio");

  return (
    <DashboardShell
      businessName={current!.business!.name}
      userEmail={current!.user.email ?? ""}
    >
      {children}
    </DashboardShell>
  );
}
