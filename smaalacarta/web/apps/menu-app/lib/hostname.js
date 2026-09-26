// Qué negocio abre cada subdominio (RUTAS-1 y 2): `<slug>.smaalacarta.com.ar` es el
// menú del negocio con ese slug, sin declararlo en el código. Cualquier subdominio
// nuevo funciona apenas el negocio existe y está publicado.

export const BASE_DOMAINS = ["smaalacarta.com.ar", "smaalacarta.online"];

// Estos abren su demo (datos en /data/demos).
export const DEMO_SLUGS = ["moderno", "clasico", "minimal"];

// Nombres que usa la plataforma: no son negocios. La misma lista está en la base de
// datos (restricción `businesses_slug_reserved`) y en el admin (`RESERVED_SLUGS`).
export const RESERVED_SUBDOMAINS = [
  "www", "app", "admin", "api", "demo", "demos", "mail", "static", "assets",
  "cdn", "dev", "staging", "panel", "login", "landing",
];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Devuelve `{ type, slug }` o null si el host no es el de un negocio ni el de una
// demo (localhost, el dominio raíz, previews de Vercel, subdominios anidados…).
export function resolveBusinessFromHost(hostname, baseDomains = BASE_DOMAINS) {
  const host = String(hostname ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

  for (const base of baseDomains) {
    if (!host.endsWith(`.${base}`)) continue;

    const subdomain = host.slice(0, -(base.length + 1));

    // Un solo nivel: `a.b.smaalacarta.com.ar` no es un negocio.
    if (subdomain.includes(".") || !SLUG.test(subdomain)) return null;

    if (DEMO_SLUGS.includes(subdomain)) return { type: "demo", slug: subdomain };
    if (RESERVED_SUBDOMAINS.includes(subdomain)) return null;

    return { type: "cliente", slug: subdomain };
  }

  return null;
}
