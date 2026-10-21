"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { courierBarItems, courierTab } from "@/lib/courier/nav";
import { navBadgeLabel } from "@/lib/layout/nav-badge";

// Lo que el tutorial del repartidor señala en la barra (ENVIO-214).
const TOUR_TARGETS: Partial<Record<string, string>> = { zonas: "zones", rendiciones: "settlements" };

// La barra fija de abajo del panel del repartidor en el celular (ADMIN-MOVIL-7). En escritorio no se ve:
// ahí siguen la barra lateral y las pestañas.
export default function CourierBottomNav({ toSettleCount }: { toSettleCount: number }) {
  const pathname = usePathname();
  const tab = courierTab(useSearchParams().get("tab"));
  const items = courierBarItems(pathname, tab, toSettleCount);

  return (
    <nav
      aria-label="Secciones del repartidor"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              data-tour={TOUR_TARGETS[item.key]}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 text-xs font-semibold transition ${
                item.active ? "text-brand" : "text-stone-500 hover:text-brand"
              }`}
            >
              <span className="relative">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={item.active ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
                {navBadgeLabel(item.badge) ? (
                  <span
                    aria-label={`${item.badge} pendientes`}
                    className="absolute -right-3 -top-1.5 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] font-bold leading-5 text-white"
                  >
                    {navBadgeLabel(item.badge)}
                  </span>
                ) : null}
              </span>
              {item.label}
              {item.active ? (
                <span aria-hidden="true" className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand" />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
