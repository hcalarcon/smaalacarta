"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeHref } from "@/lib/layout/nav-active";
import { navBadgeLabel } from "@/lib/layout/nav-badge";

import type { NavLink } from "./nav-links";

export default function DashboardNav({
  links,
  onNavigate,
}: {
  links: NavLink[];
  onNavigate?: () => void;
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
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
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
            {link.label}
            {navBadgeLabel(link.badge) ? (
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
                  active ? "bg-white text-brand" : "bg-accent text-white"
                }`}
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
