"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  // Trazo de un ícono de 24x24 (estilo outline).
  icon: string;
};

const links: NavLink[] = [
  {
    href: "/dashboard",
    label: "Resumen",
    icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
  },
  {
    href: "/dashboard/menu",
    label: "Menú",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    href: "/dashboard/orders",
    label: "Pedidos",
    icon: "M6 6h15l-1.5 9h-12L6 3H3M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z",
  },
  {
    href: "/dashboard/promotions",
    label: "Promociones",
    icon: "M7 7h.01M3 12V5a2 2 0 012-2h7l9 9a2 2 0 010 2.8l-6.2 6.2a2 2 0 01-2.8 0L3 12z",
  },
  {
    href: "/dashboard/settings",
    label: "Configuración",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  },
];

// "/dashboard" solo es activo en su propia página; el resto también en subrutas.
function isActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNav({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {links.map((link) => {
        const active = isActive(pathname, link.href);

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
