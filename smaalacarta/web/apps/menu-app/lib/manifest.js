// El manifest de la app instalable (PWA-1 y 2): el nombre y los colores del negocio y su
// logo como ícono; sin datos del negocio, el manifest general de SMA a la Carta. Lo arma
// la función `web/api/manifest.js`. Todo se valida: el manifest es un JSON, pero el nombre
// y el logo los escribe el negocio.

import { safeHttpsUrl } from "./html.js";

export const DEFAULT_NAME = "SMA a la Carta";
export const DEFAULT_THEME = "#5a4a3a";
const BACKGROUND = "#faf8f3";

export const GENERAL_ICONS = [
  { src: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/assets/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
];

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

const cleanText = (value, max) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
        .trim()
    : "";

// Íconos del negocio: su logo (si cargó uno https), o los generales.
export function manifestIcons(logo) {
  const url = safeHttpsUrl(logo);
  if (!url) return GENERAL_ICONS;

  const extension = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(url)?.[1]?.toLowerCase();
  const type = MIME[extension];

  return [192, 512].map((size) => ({
    src: url,
    sizes: `${size}x${size}`,
    ...(type ? { type } : {}),
    purpose: "any",
  }));
}

export function buildManifest(config) {
  const name = cleanText(config?.nombre, 45) || DEFAULT_NAME;
  const primary = config?.colores?.primary;
  const theme = typeof primary === "string" && /^#[0-9a-fA-F]{6}$/.test(primary) ? primary : DEFAULT_THEME;
  const description = cleanText(config?.descripcion, 130);

  return {
    name,
    short_name: cleanText(name, 12) || DEFAULT_NAME,
    ...(description ? { description } : {}),
    lang: "es-AR",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: theme,
    background_color: BACKGROUND,
    icons: manifestIcons(config?.logo),
  };
}
