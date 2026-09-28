"use client";

import { useState } from "react";

import { saveBusinessProfileAction } from "../actions";
import ShareQrCode from "./ShareQrCode";
import CopyLinkButton from "@/components/dashboard/CopyLinkButton";
import PlanBadges from "@/components/dashboard/PlanBadges";
import Section from "@/components/ui/Section";
import { menuLinks } from "@/lib/menu-url";
import { slugify } from "@/lib/superadmin/validation";

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
        <PlanBadges plan={plan} />
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
