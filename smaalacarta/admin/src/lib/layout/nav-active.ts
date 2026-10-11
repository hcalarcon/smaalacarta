import type { NavLink } from "@/components/layout/nav-links";

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// El link activo es el de la ruta más específica que coincide: así
// /superadmin/repartidores/nuevo marca Repartidores y no Negocios, aunque
// /superadmin sea prefijo de todas. Las raíces (/dashboard, /superadmin) solo
// coinciden por sí solas; el resto de sus rutas se declara en `alsoActiveOn`.
export function activeHref(pathname: string, links: NavLink[]): string | null {
  let best: { href: string; length: number } | null = null;

  for (const link of links) {
    const prefixes = [link.href, ...(link.alsoActiveOn ?? [])];

    for (const prefix of prefixes) {
      const isRoot = prefix === link.href && ROOTS.includes(prefix);
      const hit = isRoot ? pathname === prefix : matches(pathname, prefix);

      if (hit && (!best || prefix.length > best.length)) {
        best = { href: link.href, length: prefix.length };
      }
    }
  }

  return best?.href ?? null;
}

const ROOTS = ["/dashboard", "/superadmin", "/repartidor"];
