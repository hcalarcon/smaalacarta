"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavLink } from "./nav-links";

// La raíz de cada sección (/dashboard, /superadmin) solo es activa en su propia
// página; el resto también en sus subrutas.
function isActive(pathname: string, href: string, roots: string[]) {
  return roots.includes(href)
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNav({
  links,
  onNavigate,
}: {
  links: NavLink[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const roots = ["/dashboard", "/superadmin"];

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {links.map((link) => {
        const active = isActive(pathname, link.href, roots);

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
          </Link>
        );
      })}
    </nav>
  );
}
