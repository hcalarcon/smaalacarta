"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import DashboardNav from "./DashboardNav";
import MobileMenu from "./MobileMenu";
import type { NavLink } from "./nav-links";
import Logo from "@/components/brand/Logo";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PushEndpointField from "@/components/pwa/PushEndpointField";
import PushToggle from "@/components/pwa/PushToggle";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import { signOutAction } from "../../../app/(auth)/actions";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  sidebarSubtitle: string;
  userEmail: string;
  links: NavLink[];
  // Enlace para pasar entre el panel de un negocio y /superadmin.
  switchLink?: { href: string; label: string };
  // Acceso rápido a los servicios públicos que tenga el negocio (no aplica a
  // /superadmin): uno por cada uno (carrito, menú, QR), según su plan. `short`
  // es lo que se ve en el celular, donde no entran los tres con el nombre
  // completo (y los tres comparten el mismo ícono).
  quickLinks?: { href: string; label: string; short: string }[];
  // El superadmin no tiene Configuración propia: ahí sigue en el header.
  showChangePassword?: boolean;
  // Aviso de negocio suspendido (ADMIN-SUSPENSION-1): se ve en todo el panel,
  // no aplica a /superadmin.
  banner?: React.ReactNode;
  // Barra fija arriba de todo el panel (ADMIN-PEDIDOS-30): va dentro del header pegajoso para que no se
  // vaya al hacer scroll. Solo la pasa el panel del negocio con pedidos por menú.
  alertBar?: React.ReactNode;
  // "Instalar app" y "Activar avisos" en el header, y el registro del service worker (ADMIN-PWA-16).
  // Los pasan el panel del negocio y el del repartidor; /superadmin no.
  showAppControls?: boolean;
  // Barra fija de abajo en el celular (panel del repartidor, ADMIN-MOVIL-7): reemplaza al cajón, así que
  // sin hamburguesa, y el contenido deja lugar para que no la tape.
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
};

export default function DashboardShell({
  title,
  subtitle,
  sidebarSubtitle,
  userEmail,
  links,
  switchLink,
  quickLinks,
  showChangePassword = true,
  banner,
  alertBar,
  showAppControls = false,
  bottomNav,
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
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-white lg:flex">
        <div className="border-b border-line p-6">
          <Logo />
          <p className="mt-2 text-sm text-stone-500">{sidebarSubtitle}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <DashboardNav links={links} />
        </div>
      </aside>

      {/* Móvil: el mismo menú en un cajón. */}
      {menuOpen && !bottomNav ? (
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
              <DashboardNav
                links={links}
                onNavigate={() => setMenuOpen(false)}
              />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
          {alertBar}
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Abrir menú"
                aria-expanded={menuOpen}
                className={`rounded-lg p-2 text-brand hover:bg-brand-soft lg:hidden ${bottomNav ? "hidden" : ""}`}
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
                <p className="hidden text-sm text-stone-500 lg:block">
                  {subtitle}
                </p>
              </div>
            </div>

            {/* Celular y tableta: un solo botón ⋯ con todo lo demás (ADMIN-MOVIL-1). */}
            <div className="shrink-0 lg:hidden">
              <MobileMenu
                quickLinks={quickLinks}
                switchLink={switchLink}
                showChangePassword={showChangePassword}
                showAppControls={showAppControls}
              />
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              <span className="max-w-[16rem] truncate text-sm text-stone-600">
                {userEmail}
              </span>

              {showAppControls ? (
                <>
                  <InstallAppButton />
                  <PushToggle />
                </>
              ) : null}

              {quickLinks?.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
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
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <path d="M15 3h6v6M10 14L21 3" />
                  </svg>
                  <span className="hidden sm:inline">{link.label}</span>
                  <span className="sm:hidden">{link.short}</span>
                </a>
              ))}

              {switchLink ? (
                <Link
                  href={switchLink.href}
                  className="rounded-xl bg-brand-soft px-4 py-2 text-sm font-medium text-brand transition hover:bg-line"
                >
                  {switchLink.label}
                </Link>
              ) : null}

              {showChangePassword ? (
                <Link
                  href="/cambiar-contrasena"
                  className="text-sm font-medium text-stone-500 hover:text-brand"
                >
                  Cambiar contraseña
                </Link>
              ) : null}

              <form action={signOutAction}>
                {showAppControls ? <PushEndpointField /> : null}
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

        {banner}

        {showAppControls ? (
          <>
            <ServiceWorkerRegister />
            <InstallPrompt />
          </>
        ) : null}

        <main
          className={`p-4 md:p-6 lg:p-8 ${
            bottomNav ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8" : ""
          }`}
        >
          {children}
        </main>

        {bottomNav}
      </div>
    </div>
  );
}
