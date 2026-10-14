"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import InstallAppButton from "@/components/pwa/InstallAppButton";
import PushEndpointField from "@/components/pwa/PushEndpointField";
import PushToggle from "@/components/pwa/PushToggle";
import { signOutAction } from "../../../app/(auth)/actions";

const itemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-stone-800 transition hover:bg-brand-soft";

// El menú "⋯" del header en el celular (ADMIN-MOVIL-1 a 3): junta lo que en escritorio se ve suelto en el
// header. Se cierra con Escape y al tocar afuera.
export default function MobileMenu({
  quickLinks,
  switchLink,
  showChangePassword,
  showAppControls,
}: {
  quickLinks?: { href: string; label: string; short: string }[];
  switchLink?: { href: string; label: string };
  showChangePassword: boolean;
  showAppControls: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: Event) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Más opciones"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-xl font-bold text-brand transition hover:bg-brand-soft"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-2 shadow-xl"
        >
          {quickLinks?.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className={itemClass}
            >
              {link.label}
            </a>
          ))}

          {showAppControls ? (
            <>
              <PushToggle variant="menu" />
              <InstallAppButton variant="menu" />
            </>
          ) : null}

          {switchLink ? (
            <Link href={switchLink.href} role="menuitem" className={itemClass}>
              {switchLink.label}
            </Link>
          ) : null}

          {showChangePassword ? (
            <Link href="/cambiar-contrasena" role="menuitem" className={itemClass}>
              Cambiar contraseña
            </Link>
          ) : null}

          <form action={signOutAction} className="mt-1 border-t border-line pt-1">
            {showAppControls ? <PushEndpointField /> : null}
            <button type="submit" role="menuitem" className={`${itemClass} text-red-700`}>
              Salir
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
