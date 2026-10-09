"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import HeaderPreview from "./HeaderPreview";

type Props = Omit<React.ComponentProps<typeof HeaderPreview>, "compact">;

// Vista previa de Apariencia (ADMIN-CONFIG-40 a 42): compacta y siempre a la vista junto a los
// controles; "Ampliar" abre la vista completa (HeaderPreview) en un modal que sigue los cambios en
// vivo. Quien la use le da el lugar fijo (sticky) con `className`.
export default function AppearancePreview({ className = "", ...props }: Props & { className?: string }) {
  // En celular se puede colapsar; en escritorio no hace falta, así que el cuerpo nunca se esconde ahí.
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      aria-label="Vista previa compacta"
      className={`rounded-2xl border border-line-strong bg-white p-2.5 shadow-md lg:shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-medium text-brand lg:pointer-events-none"
        >
          Vista previa
          <span aria-hidden className={`text-xs transition lg:hidden ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-lg border border-line-strong bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-brand-soft"
        >
          Ampliar
        </button>
      </div>

      <div className={`mt-2 ${open ? "" : "max-lg:hidden"}`}>
        <HeaderPreview compact {...props} />
      </div>

      {expanded ? (
        <PreviewModal onClose={() => setExpanded(false)}>
          <HeaderPreview {...props} />
        </PreviewModal>
      ) : null}
    </aside>
  );
}

function PreviewModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // El cierre llega como función nueva en cada render; el efecto no tiene que rearmarse por eso
  // (volvería a llevarse el foco al diálogo).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Esc cierra; mientras está abierto la página de atrás no se desplaza, y el foco vuelve al botón
  // que lo abrió.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close.current();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  // En el body: el aside es sticky y arma su propio contexto de apilado, y desde ahí el modal quedaba
  // por debajo del encabezado del panel.
  return createPortal(
    <div
      data-testid="preview-backdrop"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Vista previa del menú"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl focus:outline-none sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand">Vista previa del menú</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line-strong px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
