// Carga del menú de Santa Julia para la vitrina: Supabase (`public_menu`) con respaldo en
// `data/santa-julia.json` (el menú de la vitrina). Solo en el navegador.

import { fetchPublicMenu, isSupabaseConfigured, normalizePublicMenu } from "../../menu-app/lib/public-menu.js";
import { SLUG } from "./vitrina.js";

async function desdeSupabase() {
  try {
    const { SUPABASE } = await import("/apps/menu-app/supabase-config.js");
    if (!isSupabaseConfigured(SUPABASE)) return null;
    return await fetchPublicMenu({ ...SUPABASE, slug: SLUG });
  } catch (err) {
    console.error("Vitrina: no se pudo pedir el menú a Supabase:", err);
    return null;
  }
}

// Respaldo propio de la vitrina: un menú completo (fotos, opciones, ES/EN/PT, precios de 2026) para que
// se vea como una carta real aunque la base no tenga publicado a Santa Julia.
async function desdeJson() {
  const res = await fetch("/apps/vitrina/data/santa-julia.json");
  if (!res.ok) throw new Error(`santa-julia.json: ${res.status}`);
  const datos = normalizePublicMenu(await res.json());
  if (!datos) throw new Error("santa-julia.json no es un menú");
  return datos;
}

export async function cargarMenu() {
  return (await desdeSupabase()) ?? (await desdeJson());
}
