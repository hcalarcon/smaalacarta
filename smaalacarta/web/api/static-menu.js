// El menú estático (Etapa 6e, plan "Menú Web"): `<slug>.smaalacarta.com.ar/menu.html`
// pide acá, igual que un negocio sin `plan_completo` por el rewrite externo desde
// `landing/` (`smaalacarta.com.ar/<slug>/menu.html?ruta=<slug>`, RUTAS-4). Mismo
// dato que el menú interactivo (`public_menu`, sin sesión) pero como HTML de solo
// lectura, armado en el momento — sin build ni JS de carrito.
import { normalizeLang } from "../apps/menu-app/lib/i18n.js";
import { getDemoMenu } from "../apps/menu-app/lib/demo-menu.js";
import { fetchPublicMenu, isSupabaseConfigured } from "../apps/menu-app/lib/public-menu.js";
import { resolveTarget } from "../apps/menu-app/lib/hostname.js";
import { renderStaticMenuPage } from "../apps/menu-app/lib/static-page.js";
import { SUPABASE } from "../apps/menu-app/supabase-config.js";

const NOT_FOUND =
  "<!doctype html><title>Menú no encontrado</title><h1>No encontramos este menú.</h1>";

export default async function handler(req, res) {
  const url = new URL(req.url ?? "", "http://internal");
  const target = resolveTarget({ hostname: req.headers?.host, search: url.search });

  if (!target) {
    res.status(404).send(NOT_FOUND);
    return;
  }

  // Las demos salen de los mismos JSON que el interactivo (ESTATICO-6), sin
  // pasar por Supabase ni por el plan: no son negocios reales.
  let remote = null;
  if (target.type === "demo") {
    remote = getDemoMenu(target.slug);
  } else if (isSupabaseConfigured(SUPABASE)) {
    try {
      remote = await fetchPublicMenu({ ...SUPABASE, slug: target.slug, viaPath: target.viaPath });
    } catch {
      remote = null;
    }
  }

  if (!remote) {
    res.status(404).send(NOT_FOUND);
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Poco tiempo en el borde: un cambio en Configuración se ve rápido.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).send(renderStaticMenuPage({ ...remote, lang: normalizeLang(url.searchParams.get("lang")) }));
}
