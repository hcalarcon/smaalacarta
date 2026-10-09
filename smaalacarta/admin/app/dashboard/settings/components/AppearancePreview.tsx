"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import MenuPreviewFrame from "./MenuPreviewFrame";
import type { Focus } from "@/lib/settings/header-focus";
import {
  fetchMenuPreview,
  mergePreviewConfig,
  previewPayload,
  type MenuPreviewResult,
  type PreviewDraft,
} from "@/lib/settings/live-preview";
import { createClient } from "@/lib/supabase-browser";
import { THEMES } from "@/lib/settings/validation";

type Format = "celular" | "escritorio";

// Tamaños reales de cada formato: el menú se dibuja con el ancho de un celular o de una pantalla de
// escritorio (desktop.css entra desde 1024 px) y se achica para que entre.
const FORMATS: Record<Format, { label: string; width: number; height: number }> = {
  celular: { label: "Celular", width: 390, height: 640 },
  escritorio: { label: "Escritorio", width: 1120, height: 620 },
};

// Cuánto de la parte de arriba del menú se ve en la vista compacta (cabecera, categorías y primer producto).
const COMPACT = { width: 390, height: 640, crop: 300 };

const pill = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
    active ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-stone-700 hover:bg-brand-soft"
  }`;

// Un valor que sigue al del formulario hasta que se lo cambia a mano acá; cuando el formulario cambia
// el suyo, vuelve a seguirlo.
function useFollowed<T>(source: T) {
  const [state, setState] = useState({ source, value: source });
  if (state.source !== source) setState({ source, value: source });
  return [state.value, (value: T) => setState({ source, value })] as const;
}

type Saved = Extract<MenuPreviewResult, { ok: true }>;

const hasNoCategories = (saved: Saved) => {
  const categorias = (saved.menu as { categorias?: unknown }).categorias;
  return !Array.isArray(categorias) || categorias.length === 0;
};

// Vista previa de Apariencia con el menú real (ADMIN-CONFIG-40 a 47): compacta y siempre a la vista junto
// a los controles; "Ampliar" abre la misma vista en grande, en un modal, con los formatos Celular y
// Escritorio y el cambio de tema. Las dos reflejan en vivo lo que hay en el formulario sin guardar. Quien
// la use le da el lugar fijo (sticky) con `className`.
export default function AppearancePreview({
  businessId,
  draft,
  onFocusChange,
  className = "",
}: {
  businessId: string;
  draft: PreviewDraft;
  onFocusChange: (focus: Focus) => void;
  className?: string;
}) {
  // En celular se puede colapsar; en escritorio no hace falta, así que el cuerpo nunca se esconde ahí.
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // El menú guardado del negocio (productos, imágenes, opciones…): se pide una vez.
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{ attempt: number; result: MenuPreviewResult } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMenuPreview(createClient(), businessId).then((result) => {
      if (!cancelled) setFetched({ attempt, result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, attempt]);
  const result = fetched?.attempt === attempt ? fetched.result : null;
  const saved = result?.ok ? result : null;

  // Contra un menú local, el menú necesita saber de qué origen aceptar los mensajes del panel.
  const adminOrigin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => undefined,
  );

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
          disabled={!saved}
          className="rounded-lg border border-line-strong bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-brand-soft disabled:opacity-50"
        >
          Ampliar
        </button>
      </div>

      <div className={`mt-2 ${open ? "" : "max-lg:hidden"}`}>
        {saved ? (
          <>
            <MenuPreviewFrame
              title="Vista previa compacta del menú"
              payload={previewPayload(mergePreviewConfig(saved.config, draft), saved.menu)}
              imageUrl={draft.imageUrl}
              focus={draft.focus}
              onFocusChange={onFocusChange}
              width={COMPACT.width}
              height={COMPACT.height}
              cropHeight={COMPACT.crop}
              adminOrigin={adminOrigin}
            />
            {hasNoCategories(saved) ? (
              <p className="mt-2 text-xs text-stone-500">
                Todavía no cargaste productos: la vista previa muestra solo la cabecera.
              </p>
            ) : null}
          </>
        ) : result ? (
          <div role="alert" className="space-y-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
            <p>No pudimos cargar tu menú para la vista previa.</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <p role="status" className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
            Cargando vista previa…
          </p>
        )}
      </div>

      {expanded && saved ? (
        <PreviewModal onClose={() => setExpanded(false)}>
          <ExpandedPreview saved={saved} draft={draft} onFocusChange={onFocusChange} adminOrigin={adminOrigin} />
        </PreviewModal>
      ) : null}
    </aside>
  );
}

// La vista grande: el mismo menú, con el formato (celular o escritorio) y el tema a elección.
function ExpandedPreview({
  saved,
  draft,
  onFocusChange,
  adminOrigin,
}: {
  saved: Saved;
  draft: PreviewDraft;
  onFocusChange: (focus: Focus) => void;
  adminOrigin: string | undefined;
}) {
  const [format, setFormat] = useState<Format>("celular");
  const [theme, setTheme] = useFollowed(draft.theme);

  const payload = useMemo(
    () => previewPayload(mergePreviewConfig(saved.config, { ...draft, theme }), saved.menu),
    [saved, draft, theme],
  );
  const spec = FORMATS[format];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex gap-1.5" role="group" aria-label="Formato de la vista previa">
          {(Object.keys(FORMATS) as Format[]).map((key) => (
            <button key={key} type="button" onClick={() => setFormat(key)} aria-pressed={format === key} className={pill(format === key)}>
              {FORMATS[key].label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Tema de la vista previa">
          {THEMES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setTheme(option.key)}
              aria-pressed={theme === option.key}
              className={pill(theme === option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <MenuPreviewFrame
        title="Vista previa del menú"
        payload={payload}
        imageUrl={draft.imageUrl}
        focus={draft.focus}
        onFocusChange={onFocusChange}
        width={spec.width}
        height={spec.height}
        adminOrigin={adminOrigin}
      />

      <p className="text-sm text-stone-500">
        Así ven tus clientes el menú, con lo que tenés en pantalla aunque todavía no lo hayas guardado.
        {draft.imageUrl.trim() ? " Arrastrá la cabecera para elegir qué parte de la imagen se ve." : ""}
      </p>
    </div>
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
