"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  // Solo íconos, con el nombre en el tooltip (ADMIN-PEDIDOS-55).
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const current = activeHref(pathname, links);

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
            title={collapsed ? link.label : undefined}
            aria-label={collapsed ? link.label : undefined}
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
    </nav>
  );
}
