// Carga del menú de Santa Julia para la vitrina: Supabase (`public_menu`) con respaldo en los JSON de
// `data/clientes/santa-julia-resto/`, igual que el menú de siempre. Solo en el navegador.

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

async function desdeJson() {
  const base = `/data/clientes/${SLUG}`;
  const [config, menu] = await Promise.all(
    ["config.json", "menu.json"].map((archivo) =>
      fetch(`${base}/${archivo}`).then((res) => {
        if (!res.ok) throw new Error(`${archivo}: ${res.status}`);
        return res.json();
      }),
    ),
  );
  const datos = normalizePublicMenu({ config, menu });
  if (!datos) throw new Error("menu.json no es un menú");
  return datos;
}

export async function cargarMenu() {
  return (await desdeSupabase()) ?? (await desdeJson());
}
