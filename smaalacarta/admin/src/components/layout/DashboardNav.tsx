"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { activeHref } from "@/lib/layout/nav-active";
import { navBadgeLabel } from "@/lib/layout/nav-badge";

import type { NavLink } from "./nav-links";

export default function DashboardNav({
  links,
  onNavigate,
  collapsed = false,
}: {
  links: NavLink[];
  onNavigate?: () => void;
  // Solo íconos, con el nombre en un tooltip al pasar el mouse o al enfocar con el teclado (ADMIN-PEDIDOS-55 y 56).
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const current = activeHref(pathname, links);
  // El tooltip va con `position: fixed` y no dentro del enlace: la lista del menú hace scroll y recortaría lo que
  // sobresale. Es solo una ayuda visual (`aria-hidden`): el nombre accesible ya está en el `aria-label` del enlace.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);

  function showTip(label: string, element: HTMLElement) {
    const box = element.getBoundingClientRect();
    setTip({ label, top: box.top + box.height / 2 });
  }

  // Escape lo cierra (WCAG 1.4.13) y al expandir el menú no queda uno colgado.
  useEffect(() => {
    if (!tip) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTip(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tip]);

  const visibleTip = collapsed ? tip : null;

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {links.map((link) => {
        const active = link.href === current;

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            onMouseEnter={collapsed ? (event) => showTip(link.label, event.currentTarget) : undefined}
            onMouseLeave={collapsed ? () => setTip(null) : undefined}
            onFocus={collapsed ? (event) => showTip(link.label, event.currentTarget) : undefined}
            onBlur={collapsed ? () => setTip(null) : undefined}
            aria-label={
              collapsed
                ? `${link.label}${navBadgeLabel(link.badge) ? `, ${link.badge} pendientes` : ""}`
                : undefined
            }
            className={`relative flex items-center rounded-xl text-sm font-medium transition ${
              collapsed ? "justify-center py-3" : "gap-3 px-4 py-3"
            } ${
              active
                ? "bg-brand text-white shadow-sm"
                : "text-stone-700 hover:bg-brand-soft hover:text-brand"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={link.icon} />
            </svg>
            {collapsed ? null : link.label}
            {navBadgeLabel(link.badge) ? (
              <span
                className={`rounded-full text-xs font-bold ${
                  collapsed ? "absolute right-1 top-1 px-1.5 text-[10px]" : "ml-auto px-2 py-0.5"
                } ${active && !collapsed ? "bg-white text-brand" : "bg-accent text-white"}`}
                aria-label={`${link.badge} pendientes`}
              >
                {navBadgeLabel(link.badge)}
              </span>
            ) : null}
          </Link>
        );
      })}

      {visibleTip ? (
        <span
          aria-hidden="true"
          data-testid="nav-tooltip"
          style={{ top: visibleTip.top }}
          className="pointer-events-none fixed left-[4.25rem] z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {visibleTip.label}
        </span>
      ) : null}
    </nav>
  );
}
