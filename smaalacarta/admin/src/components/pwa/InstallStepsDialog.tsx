"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Los pasos para instalar en iPhone y iPad (Compartir → Agregar a inicio). Va en un portal al <body>: el
// header tiene `backdrop-blur`, que ata a los `fixed` de adentro a su propio recuadro.
export default function InstallStepsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-steps-title"
        className="relative m-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="install-steps-title" className="font-display text-lg font-semibold text-brand">
          Instalar la app
        </h2>

        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-700">
          <li>
            Tocá <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en la barra de Safari.
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
          onClick={onClose}
          className="mt-5 min-h-11 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
        >
          Entendido
        </button>
      </div>
    </div>,
    document.body,
  );
}
