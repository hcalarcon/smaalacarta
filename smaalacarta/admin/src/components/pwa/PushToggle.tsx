"use client";

import { useEffect } from "react";

import { disablePush, enablePush, start, usePwa } from "./pwa-store";
import { COURIER_BANNER_TEXT, showCourierBanner } from "@/lib/push/install";

// "Activar avisos" (ADMIN-PWA-13 a 15). Dos presentaciones del mismo control:
// - `header`: un botón chico en el encabezado del panel.
// - `banner`: el recuadro del panel del repartidor, mientras no tenga avisos activados.
// Solo pinta: qué mostrar lo decide `pushControl()` en `src/lib/push/install.ts`.

const BLOCKED_TEXT = "Los avisos están bloqueados: habilitalos en los ajustes del navegador";
const INSTALL_FIRST_TEXT = "Instalá la app para recibir avisos";

function BellIcon({ off }: { off?: boolean }) {
  return (
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
      <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" />
      {off ? <path d="M3 3l18 18" /> : null}
    </svg>
  );
}

const buttonClass =
  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand transition hover:bg-line disabled:opacity-60 sm:px-4";

const menuItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-stone-800 transition hover:bg-brand-soft disabled:opacity-60";

export default function PushToggle({ variant = "header" }: { variant?: "header" | "banner" | "menu" }) {
  const { pushControl, busy, error } = usePwa();

  useEffect(() => {
    start();
  }, []);

  if (pushControl === "hidden") return null;

  if (variant === "banner") {
    if (!showCourierBanner(pushControl)) return null;

    return (
      <section
        aria-label="Avisos"
        className="mb-4 flex flex-col gap-3 rounded-2xl border border-accent bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="text-sm text-stone-800">
          <p className="font-semibold">{COURIER_BANNER_TEXT}</p>
          {pushControl === "blocked" ? <p className="mt-1">{BLOCKED_TEXT}</p> : null}
          {pushControl === "install-first" ? <p className="mt-1">{INSTALL_FIRST_TEXT}</p> : null}
          {error ? (
            <p role="alert" className="mt-1 text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        {pushControl === "enable" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void enablePush()}
            className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? "Activando…" : "Activar avisos"}
          </button>
        ) : null}
      </section>
    );
  }

  // Ítem del menú ⋯ del celular: el mismo estado, en una lista en vez de un desplegable.
  if (variant === "menu") {
    return (
      <div>
        {pushControl === "enable" ? (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void enablePush()}
            className={menuItemClass}
          >
            <BellIcon />
            <span>{busy ? "Activando…" : "Activar avisos"}</span>
          </button>
        ) : null}
        {pushControl === "enabled" ? (
          <>
            <p className="flex min-h-11 items-center gap-3 px-3 text-sm text-stone-700">
              <BellIcon />
              <span>Avisos activados</span>
            </p>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void disablePush()}
              className={`${menuItemClass} text-brand underline`}
            >
              {busy ? "Desactivando…" : "Desactivar avisos"}
            </button>
          </>
        ) : null}
        {pushControl === "blocked" ? <p className="px-3 py-2 text-sm text-stone-700">{BLOCKED_TEXT}</p> : null}
        {pushControl === "install-first" ? (
          <p className="px-3 py-2 text-sm text-stone-700">{INSTALL_FIRST_TEXT}</p>
        ) : null}
        {error ? (
          <p role="alert" className="px-3 pb-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (pushControl === "enable") {
    return (
      <div className="flex flex-col items-end">
        <button type="button" disabled={busy} onClick={() => void enablePush()} className={buttonClass}>
          <BellIcon />
          <span>{busy ? "Activando…" : "Activar avisos"}</span>
        </button>
        {error ? (
          <p role="alert" className="mt-1 max-w-[16rem] text-right text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // Activados, bloqueados o a instalar: un desplegable con el estado y, si corresponde, desactivar.
  return (
    <details className="relative">
      <summary className={`${buttonClass} cursor-pointer list-none`}>
        <BellIcon off={pushControl !== "enabled"} />
        <span>{pushControl === "enabled" ? "Avisos activados" : "Avisos"}</span>
      </summary>

      <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-white p-3 text-sm text-stone-700 shadow-lg">
        {pushControl === "enabled" ? (
          <>
            <p>Este aparato recibe avisos de pedidos.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disablePush()}
              className="mt-2 font-medium text-brand underline disabled:opacity-60"
            >
              {busy ? "Desactivando…" : "Desactivar avisos"}
            </button>
          </>
        ) : null}
        {pushControl === "blocked" ? <p>{BLOCKED_TEXT}</p> : null}
        {pushControl === "install-first" ? <p>{INSTALL_FIRST_TEXT}</p> : null}
        {error ? (
          <p role="alert" className="mt-2 text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
