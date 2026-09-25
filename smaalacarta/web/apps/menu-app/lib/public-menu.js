// Trae el menú de un negocio desde Supabase (función `public_menu`, sin sesión) y
// lo deja en el formato que ya entiende el menú: `{ config, menu }`, igual que los
// JSON de `data/clientes/<slug>/`. Si algo falla devuelve null y el menú usa esos
// JSON como hasta ahora (PUBLICO-6).

export function isSupabaseConfigured(cfg) {
  return Boolean(cfg && cfg.url && cfg.url.trim() && cfg.key && cfg.key.trim());
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Completa lo que falte para que el menú nunca reciba categorías o ítems sin lista
// (PUBLICO-7). Devuelve null si lo que llegó no es un menú.
export function normalizePublicMenu(data) {
  if (!isObject(data) || !isObject(data.config)) return null;

  const categorias = Array.isArray(data.menu?.categorias) ? data.menu.categorias : [];

  return {
    config: data.config,
    menu: {
      ...(isObject(data.menu) ? data.menu : {}),
      categorias: categorias
        .filter((cat) => isObject(cat) && typeof cat.nombre === "string" && cat.nombre)
        .map((cat) => ({
          ...cat,
          items: (Array.isArray(cat.items) ? cat.items : []).flatMap((item) => {
            if (!isObject(item) || typeof item.nombre !== "string" || !item.nombre) return [];

            const precio = Number(item.precio);
            return Number.isFinite(precio) ? [{ ...item, precio }] : [];
          }),
        })),
    },
  };
}

export async function fetchPublicMenu({ url, key, slug, fetchImpl = globalThis.fetch }) {
  if (!isSupabaseConfigured({ url, key }) || !slug) return null;

  const headers = { apikey: key, "Content-Type": "application/json" };
  // Las claves nuevas (sb_publishable_…) van solo en `apikey`; las viejas, que son
  // JWT, también como Authorization.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(`${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_menu`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_slug: slug }),
      // Un menú que no responde no puede dejar la pantalla en blanco.
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(8000)
          : undefined,
    });

    if (!res.ok) {
      console.error(`Supabase respondió ${res.status} al pedir el menú`);
      return null;
    }

    return normalizePublicMenu(await res.json());
  } catch (err) {
    console.error("No se pudo pedir el menú a Supabase:", err);
    return null;
  }
}
