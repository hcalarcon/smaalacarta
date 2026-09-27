// El menú estático (Etapa 6e, plan "Menú Web"): `/:cliente/menu.html` pide acá.
// Mismo dato que el menú interactivo (`public_menu`, sin sesión) pero como HTML
// de solo lectura, armado en el momento — sin build ni JS de carrito.
import { fetchPublicMenu, isSupabaseConfigured } from "../apps/menu-app/lib/public-menu.js";
import { renderStaticMenuPage } from "../apps/menu-app/lib/static-page.js";
import { SUPABASE } from "../apps/menu-app/supabase-config.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export default async function handler(req, res) {
  const slug = String(req.query?.slug ?? "");

  if (!SLUG.test(slug) || !isSupabaseConfigured(SUPABASE)) {
    res.status(404).send("<!doctype html><title>Menú no encontrado</title><h1>No encontramos este menú.</h1>");
    return;
  }

  let remote = null;
  try {
    remote = await fetchPublicMenu({ ...SUPABASE, slug });
  } catch {
    remote = null;
  }

  if (!remote) {
    res.status(404).send("<!doctype html><title>Menú no encontrado</title><h1>No encontramos este menú.</h1>");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Poco tiempo en el borde: un cambio en Configuración se ve rápido.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).send(renderStaticMenuPage(remote));
}
