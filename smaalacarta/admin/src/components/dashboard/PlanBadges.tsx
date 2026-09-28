import type { BusinessPlan } from "@/lib/menu-url";

const PLAN_LABELS = [
  { key: "planPdf", label: "QR + PDF" },
  { key: "planWeb", label: "Menú Web" },
  { key: "planCompleto", label: "Subdominio Completo" },
] as const;

// Los planes de un negocio (ADMIN-CONFIG-10), de solo lectura: solo el
// superadmin los cambia, desde /superadmin.
export default function PlanBadges({ plan }: { plan: BusinessPlan }) {
  const active = PLAN_LABELS.filter((p) => plan[p.key]);

  if (active.length === 0) {
    return (
      <span className="text-sm text-stone-500">
        Todavía no tenés ningún plan asignado: pedile a SMA a la Carta que te lo active.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map((p) => (
        <span
          key={p.key}
          className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600"
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}
