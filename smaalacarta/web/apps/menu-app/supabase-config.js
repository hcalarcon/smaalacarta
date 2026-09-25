// De dónde el menú público lee los negocios. Estos dos valores son públicos por
// diseño (los ve cualquiera que abra el menú): la dirección del proyecto de
// Supabase y su "publishable key". La clave de servicio NUNCA va acá.
//
// Se completan en Supabase → Project Settings → API. Vacío, el menú usa solo los
// JSON de `data/clientes/` como hasta ahora.
export const SUPABASE = {
  url: "",
  key: "",
};
