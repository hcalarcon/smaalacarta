"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import InstallStepsDialog from "./InstallStepsDialog";
import { promptInstall, start, usePwa } from "./pwa-store";
import Logo from "@/components/brand/Logo";

// Aviso "Instalá SMA a la Carta" al entrar al panel en el celular (ADMIN-MOVIL-4 a 6). Qué se puede
// instalar lo decide `installControl()`; acá solo se pinta y se recuerda "Ahora no" durante la visita
// (`sessionStorage`: la próxima vez que entre, vuelve a aparecer; al cambiar de página, no).
const DISMISSED_KEY = "sma-install-prompt-dismissed";

const listeners = new Set<() => void>();

function isDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Sin sessionStorage no se puede recordar: mejor no insistir en cada página.
    return true;
  }
}

function dismiss() {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Nada que hacer: se cierra igual en esta página.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export default function InstallPrompt() {
  const { installControl } = usePwa();
  // En el servidor cuenta como cerrado: el aviso nace en el navegador, ya medido.
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);
  const [stepsOpen, setStepsOpen] = useState(false);

  useEffect(() => {
    start();
  }, []);

  if (installControl === "hidden" || dismissed) return null;

  if (stepsOpen) {
    return (
      <InstallStepsDialog
        onClose={() => {
          setStepsOpen(false);
          dismiss();
        }}
      />
    );
  }

  const install = () => {
    if (installControl === "prompt") {
      void promptInstall();
      dismiss();
    } else {
      setStepsOpen(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={dismiss}
        className="absolute inset-0 bg-stone-900/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-prompt-title"
        className="relative w-full rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl"
      >
        <Logo compact />

        <h2 id="install-prompt-title" className="mt-4 font-display text-xl font-bold text-brand">
          Instalá SMA a la Carta
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Recibís los avisos de pedidos y abrís el panel con un toque, como cualquier app.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={install}
            className="min-h-11 w-full rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-action-hover"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 w-full rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-brand transition hover:bg-brand-soft"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
