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

// La demo que pide el path, si es una: `/moderno`, `/clasico`, `/minimal` (también en
// `demo.smaalacarta.com.ar/moderno`, donde el subdominio `demo` está reservado y no
// dice cuál). Es el último recurso antes del respaldo fijo, para que estas direcciones
// abran la demo que nombran, con las mismas plantillas que un negocio real, y no una
// página aparte. Solo cuenta el primer segmento y solo las demos conocidas.
export function resolveDemoFromPath(pathname, demoSlugs = DEMO_SLUGS) {
  const [first] = String(pathname ?? "").split("/").filter(Boolean);

  return demoSlugs.includes(first) ? { type: "demo", slug: first } : null;
}

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

// El slug de un negocio real leído del primer segmento del path (RUTAS-4): un
// negocio sin `plan_completo` se sirve por `smaalacarta.com.ar/<slug>/pdf` o
// `/menu.html`, vía un rewrite externo desde `landing/` hacia este proyecto. Ni
// demos ni nombres reservados: esos casos ya los resuelve otra ruta.
export function resolveSlugFromPath(pathname) {
  const [first] = String(pathname ?? "").split("/").filter(Boolean);

  if (!first || !SLUG.test(first)) return null;
  if (DEMO_SLUGS.includes(first) || RESERVED_SUBDOMAINS.includes(first)) return null;

  return first;
}

// A quién pedirle el menú o el PDF, y si llegó por el path de la landing —donde
// hay que exigir el plan del servicio y que el negocio no tenga `plan_completo`,
// RUTAS-4— o por el subdominio, como siempre. Orden: `?demo=`/`?cliente=` (para
// probar en local, sin filtrar por plan); `?ruta=` (el rewrite externo de
// `landing/`, ya con el slug resuelto); subdominio.
export function resolveTarget({ hostname, search } = {}) {
  const params = new URLSearchParams(search ?? "");

  if (params.get("demo")) return { type: "demo", slug: params.get("demo"), viaPath: false };
  if (params.get("cliente")) {
    return { type: "cliente", slug: params.get("cliente"), viaPath: false };
  }

  const ruta = params.get("ruta");
  if (ruta) return { type: "cliente", slug: ruta, viaPath: true };

  const fromHost = resolveBusinessFromHost(hostname);
  if (fromHost) return { ...fromHost, viaPath: false };

  return null;
}
