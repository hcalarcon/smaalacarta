// Configuración de Supabase de los menús (WEB-ENTORNO). Sin build, el valor del entorno
// llega por `api/supabase-config.js` (variables del deploy) y, si no hay o falla, se usan
// los de producción. Solo URL y publishable key: la clave de servicio nunca va en `web/`.
export const PRODUCTION_SUPABASE = {
  url: "https://aroxfzrjzvppkzmxfjjk.supabase.co",
  key: "sb_publishable_MXnsFfgbX3KRlagXJYzwtQ_bJxwiHWU",
};

const clean = (value) => (typeof value === "string" ? value.trim() : "");

// Con las dos variables definidas usa esas; si falta alguna, ambas de producción (nunca
// una mezcla de bases).
export function resolveSupabase(env = {}) {
  const url = clean(env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return url && key ? { url, key } : { ...PRODUCTION_SUPABASE };
}

// Lo que devolvió `/api/supabase-config` en el navegador: si no es válido, producción.
export function parseSupabaseResponse(data) {
  const url = clean(data?.url);
  const key = clean(data?.key);
  return url && key ? { url, key } : { ...PRODUCTION_SUPABASE };
}
