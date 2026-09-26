// Redes del negocio (ADMIN-CONFIG-5). El menú las muestra como enlaces, así que solo
// se aceptan direcciones de la propia red: se acepta escribir `@usuario`, el usuario a
// secas o la dirección completa, y se guarda siempre la dirección `https` canónica.
// Devuelve "" si está vacío (es opcional) y null si no es válido.

const INSTAGRAM_USER = /^[A-Za-z0-9._]{1,30}$/;
const FACEBOOK_USER = /^[A-Za-z0-9._-]{1,80}$/;

// Separa "instagram.com/usuario/…" en dominio y primer tramo del camino, sin
// protocolo, "www.", parámetros ni ancla. Sin dominio ("usuario"), devuelve solo el
// nombre.
function parse(input: string) {
  const value = input.trim().replace(/^@/, "");

  const withoutProtocol = value.replace(/^https?:\/\//i, "");
  const clean = withoutProtocol.split(/[?#]/)[0].replace(/\/+$/, "");

  if (!clean.includes("/") && !/^(www\.)?[a-z0-9-]+\.(com|net)$/i.test(clean) && !value.match(/^https?:\/\//i)) {
    return { host: null, path: clean.split("/") };
  }

  const [host, ...path] = clean.replace(/^www\./i, "").split("/");
  return { host: host.toLowerCase(), path };
}

export function normalizeInstagram(input: string): string | null {
  if (!input.trim()) return "";

  const { host, path } = parse(input);

  if (host !== null && host !== "instagram.com") return null;

  const user = host === null ? path[0] : path[0];
  if (path.length > 1 || !user || !INSTAGRAM_USER.test(user)) return null;

  return `https://www.instagram.com/${user}`;
}

export function normalizeFacebook(input: string): string | null {
  if (!input.trim()) return "";

  const { host, path } = parse(input);

  if (host !== null && host !== "facebook.com" && host !== "fb.com") return null;

  const user = path[0];
  // `profile.php` (perfiles por número) y las rutas de varios tramos no se aceptan.
  if (path.length > 1 || !user || user.toLowerCase() === "profile.php") return null;
  if (!FACEBOOK_USER.test(user)) return null;

  return `https://www.facebook.com/${user}`;
}
