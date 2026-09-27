// Manifest de la app instalable (PWA-1 y 2). Un negocio pide `/api/manifest?slug=<slug>`;
// sin slug (demos, otros sitios) devuelve el general. El slug va en la dirección y no en
// el `Host` para que la caché de Vercel no mezcle negocios.
import { fetchPublicMenu, isSupabaseConfigured } from "../apps/menu-app/lib/public-menu.js";
import { buildManifest } from "../apps/menu-app/lib/manifest.js";
import { SUPABASE } from "../apps/menu-app/supabase-config.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export default async function handler(req, res) {
  const slug = String(req.query?.slug ?? "");
  let config = null;

  if (SLUG.test(slug) && isSupabaseConfigured(SUPABASE)) {
    try {
      const remote = await fetchPublicMenu({ ...SUPABASE, slug });
      config = remote?.config ?? null;
    } catch {
      // Sin datos, el manifest general: instalar sigue funcionando.
    }
  }

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  // Cinco minutos en el borde y una hora de gracia: un logo o color nuevo llega enseguida.
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(JSON.stringify(buildManifest(config)));
}
