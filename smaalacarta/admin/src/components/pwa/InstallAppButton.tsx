"use client";

import { useEffect, useState } from "react";

import InstallStepsDialog from "./InstallStepsDialog";
import { promptInstall, start, usePwa } from "./pwa-store";

// "Instalar app" (ADMIN-PWA-12). Chrome, Edge y Android ofrecen instalar con un toque; iPhone y iPad no:
// ahí se explica el camino por Compartir. Una vez instalada, deja de verse. Solo pinta: qué mostrar lo decide
// `installControl()` en `src/lib/push/install.ts`. `variant="menu"` es el ítem del menú ⋯ del celular.
export default function InstallAppButton({ variant = "header" }: { variant?: "header" | "menu" }) {
  const { installControl } = usePwa();
  const [stepsOpen, setStepsOpen] = useState(false);

  useEffect(() => {
    start();
  }, []);

  if (installControl === "hidden") return null;

  const className =
    variant === "menu"
      ? "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-stone-800 transition hover:bg-brand-soft"
      : "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand transition hover:bg-line sm:px-4";

  return (
    <>
      <button
        type="button"
        role={variant === "menu" ? "menuitem" : undefined}
        onClick={() => (installControl === "prompt" ? void promptInstall() : setStepsOpen(true))}
        className={className}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        <span>Instalar app</span>
      </button>

      {stepsOpen ? <InstallStepsDialog onClose={() => setStepsOpen(false)} /> : null}
    </>
  );
}
