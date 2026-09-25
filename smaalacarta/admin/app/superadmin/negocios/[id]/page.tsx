import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AddMemberForm from "../../components/AddMemberForm";
import RemoveMemberButton from "../../components/RemoveMemberButton";
import ResetPasswordButton from "../../components/ResetPasswordButton";
import { getBusinessWithMembers } from "@/lib/db/superadmin";

export const metadata: Metadata = { title: "Negocio" };

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  staff: "Equipo",
};

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Un id que no es un UUID haría fallar la consulta: se trata como inexistente.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const business = await getBusinessWithMembers(id);
  if (!business) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href="/superadmin"
          className="text-sm font-medium text-accent hover:text-accent-hover"
        >
          ← Todos los negocios
        </Link>
      </div>

      <section>
        <h1 className="text-3xl font-bold text-brand">{business.name}</h1>
        <p className="mt-2 text-stone-500">
          {business.slug}
          {business.whatsapp ? ` · WhatsApp ${business.whatsapp}` : ""}
        </p>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-brand">Miembros</h2>

        {business.business_users.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">
            Este negocio no tiene miembros. Asigná una cuenta abajo.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {business.business_users.map((member) => {
              const label = member.profiles?.email ?? member.user_id;

              return (
                <li key={member.user_id} className="space-y-2 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-900">
                        {label}
                      </p>
                      <p className="text-sm text-stone-500">
                        {member.profiles?.full_name
                          ? `${member.profiles.full_name} · `
                          : ""}
                        {ROLE_LABELS[member.role] ?? member.role}
                      </p>
                    </div>

                    <RemoveMemberButton
                      businessId={business.id}
                      userId={member.user_id}
                      label={label}
                    />
                  </div>

                  <ResetPasswordButton
                    businessId={business.id}
                    userId={member.user_id}
                    label={label}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-brand">Asignar una cuenta</h2>
        <div className="mt-4">
          <AddMemberForm businessId={business.id} />
        </div>
      </section>
    </div>
  );
}
