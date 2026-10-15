// Configuración pública de Supabase según el entorno del deploy (WEB-ENTORNO). La lee
// `apps/menu-app/supabase-config.js` en el navegador. Solo URL y publishable key.
import { resolveSupabase } from "../apps/menu-app/lib/supabase-env.js";

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Corta, para que un cambio de variables llegue enseguida.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
  res.status(200).send(JSON.stringify(resolveSupabase(process.env)));
}
