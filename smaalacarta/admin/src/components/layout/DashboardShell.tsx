"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import DashboardNav from "./DashboardNav";
import type { NavLink } from "./nav-links";
import Logo from "@/components/brand/Logo";
import { signOutAction } from "../../../app/(auth)/actions";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  sidebarSubtitle: string;
  userEmail: string;
  links: NavLink[];
  // Enlace para pasar entre el panel de un negocio y /superadmin.
  switchLink?: { href: string; label: string };
  children: React.ReactNode;
};

export default function DashboardShell({
  title,
  subtitle,
  sidebarSubtitle,
  userEmail,
  links,
  switchLink,
  children,
}: DashboardShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape cierra el menú móvil.
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-cream text-stone-900">
      {/* Escritorio: barra lateral fija. */}
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-white lg:flex">
        <div className="border-b border-line p-6">
          <Logo />
          <p className="mt-2 text-sm text-stone-500">{sidebarSubtitle}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <DashboardNav links={links} />
        </div>
      </aside>

      {/* Móvil: el mismo menú en un cajón. */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-stone-900/50"
          />

          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line p-5">
              <Logo />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="rounded-lg p-2 text-stone-500 hover:bg-brand-soft"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <DashboardNav links={links} onNavigate={() => setMenuOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Abrir menú"
                aria-expanded={menuOpen}
                className="rounded-lg p-2 text-brand hover:bg-brand-soft lg:hidden"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-brand">
                  {title}
                </h2>
                <p className="hidden text-sm text-stone-500 sm:block">
                  {subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden max-w-[16rem] truncate text-sm text-stone-600 md:block">
                {userEmail}
              </span>

              {switchLink ? (
                <Link
                  href={switchLink.href}
                  className="rounded-xl bg-brand-soft px-4 py-2 text-sm font-medium text-brand transition hover:bg-line"
                >
                  {switchLink.label}
                </Link>
              ) : null}

              <Link
                href="/cambiar-contrasena"
                className="hidden text-sm font-medium text-stone-500 hover:text-brand sm:block"
              >
                Cambiar contraseña
              </Link>

              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
