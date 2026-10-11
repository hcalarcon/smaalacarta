"use client";

import { useEffect, useState } from "react";

import { promptInstall, start, usePwa } from "./pwa-store";

// "Instalar app" (ADMIN-PWA-12). Chrome, Edge y Android ofrecen instalar con un toque; iPhone y iPad no:
// ahí se explica el camino por Compartir. Una vez instalada, deja de verse. Solo pinta: qué mostrar lo decide
// `installControl()` en `src/lib/push/install.ts`.
export default function InstallAppButton() {
  const { installControl } = usePwa();
  const [stepsOpen, setStepsOpen] = useState(false);

  useEffect(() => {
    start();
  }, []);

  useEffect(() => {
    if (!stepsOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStepsOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepsOpen]);

  if (installControl === "hidden") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (installControl === "prompt" ? void promptInstall() : setStepsOpen(true))}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand transition hover:bg-line sm:px-4"
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

      {stepsOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setStepsOpen(false)}
            className="absolute inset-0 bg-stone-900/50"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-steps-title"
            className="relative m-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="install-steps-title" className="text-lg font-semibold text-brand">
              Instalar la app
            </h2>

            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-700">
              <li>
                Tocá <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en la barra de
                Safari.
              </li>
              <li>
                Elegí <strong>Agregar a inicio</strong>.
              </li>
              <li>Abrí la app desde el ícono nuevo de tu pantalla de inicio.</li>
            </ol>

            <p className="mt-3 text-xs text-stone-500">
              Para recibir avisos en iPhone, la app tiene que estar instalada.
            </p>

            <button
              type="button"
              onClick={() => setStepsOpen(false)}
              className="mt-5 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
