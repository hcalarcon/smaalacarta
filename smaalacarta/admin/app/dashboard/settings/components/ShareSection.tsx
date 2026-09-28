"use client";

import { useState } from "react";

import { saveBusinessProfileAction } from "../actions";
import ShareQrCode from "./ShareQrCode";
import CopyLinkButton from "@/components/dashboard/CopyLinkButton";
import Section from "@/components/ui/Section";
import { menuLinks } from "@/lib/menu-url";
import { slugify } from "@/lib/superadmin/validation";

const PLAN_LABELS = [
  { key: "planPdf", label: "QR + PDF" },
  { key: "planWeb", label: "Menú Web" },
  { key: "planCompleto", label: "Subdominio Completo" },
] as const;

const LINK_LABELS = {
  interactivo: "Menú interactivo (con carrito)",
  estatico: "Menú web (solo lectura)",
  pdf: "PDF",
} as const;

export default function ShareSection({
  name,
  slug,
  planPdf,
  planWeb,
  planCompleto,
}: {
  name: string;
  slug: string;
  planPdf: boolean;
  planWeb: boolean;
  planCompleto: boolean;
}) {
  const [currentSlug, setCurrentSlug] = useState(slug);

  // Si el nombre o el slug cambiaron desde afuera (por ejemplo, guardado
  // desde "Datos del negocio"), se sincroniza al renderizar.
  const [syncedFrom, setSyncedFrom] = useState(slug);
  if (syncedFrom !== slug) {
    setSyncedFrom(slug);
    setCurrentSlug(slug);
  }

  const [regenerating, setRegenerating] = useState(false);
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");

  const suggestedSlug = slugify(name);
  const upToDate = !suggestedSlug || suggestedSlug === currentSlug;

  async function handleRegenerate() {
    if (upToDate || regenerating) return;

    setRegenerating(true);
    setStatus("idle");

    try {
      const result = await saveBusinessProfileAction({
        name,
        slug: suggestedSlug,
      });

      if (result.ok) {
        setCurrentSlug(suggestedSlug);
        setStatus("done");
        setTimeout(() => setStatus("idle"), 2500);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setRegenerating(false);
    }
  }

  const plan = { planPdf, planWeb, planCompleto };
  const links = menuLinks(currentSlug, plan);
  const activePlans = PLAN_LABELS.filter((p) => plan[p.key]);
  const activeLinks = (Object.entries(links) as [keyof typeof links, string | null][]).filter(
    (entry): entry is [keyof typeof links, string] => entry[1] !== null,
  );

  return (
    <Section
      title="Compartir"
      description="El código QR de tu menú, para imprimir o pegar en el local."
    >
      <div>
        <span className="mb-1.5 block text-sm font-medium text-brand">Tu plan</span>
        <div className="flex flex-wrap gap-1.5">
          {activePlans.length > 0 ? (
            activePlans.map((p) => (
              <span
                key={p.key}
                className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600"
              >
                {p.label}
              </span>
            ))
          ) : (
            <span className="text-sm text-stone-500">
              Todavía no tenés ningún plan asignado: pedile a SMA a la Carta que te lo active.
            </span>
          )}
        </div>
      </div>

      {activeLinks.length === 0 ? null : (
        <div className="space-y-5">
          {activeLinks.map(([key, url]) => (
            <div key={key}>
              <p className="mb-1.5 text-sm font-medium text-brand">{LINK_LABELS[key]}</p>
              <p className="break-all font-mono text-sm text-stone-600">{url}</p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <ShareQrCode value={url} />
                <CopyLinkButton value={url} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={upToDate || regenerating}
          className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {regenerating
            ? "Regenerando…"
            : upToDate
              ? "La URL ya coincide con el nombre"
              : "Regenerar desde el nombre"}
        </button>

        {status === "done" ? (
          <span role="status" className="ml-3 text-sm font-medium text-emerald-700">
            ¡Listo! Se actualizaron los links y los QR.
          </span>
        ) : null}

        {status === "error" ? (
          <span role="alert" className="ml-3 text-sm font-medium text-red-600">
            No pudimos regenerarla. Probá de nuevo.
          </span>
        ) : null}
      </div>
    </Section>
  );
}
