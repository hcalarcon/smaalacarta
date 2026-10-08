// Datos del negocio que el menú muestra además de los productos: cierre temporal,
// dirección y redes (PUBLICO-8 y 9). Toman lo que llega en `config` (ver
// `public-menu.js`) y lo dejan listo para pintar.

import { safeHttpUrl } from "./html.js";
import { t } from "./i18n.js";

// Si el negocio está cerrado temporalmente, el aviso con su mensaje y la fecha en
// que reabre; si no, null. Un cierre sin mensaje ni fecha también es un aviso.
export function closedNotice(config) {
  if (!config || !config.cierre || typeof config.cierre !== "object") return null;

  return {
    message: typeof config.cierre.mensaje === "string" ? config.cierre.mensaje : "",
    reopensOn: typeof config.cierre.hasta === "string" ? config.cierre.hasta : null,
  };
}

// "2030-01-15" → "Reabrimos el 15/01". Vacío si no hay una fecha válida.
export function reopenText(reopensOn, lang) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reopensOn ?? "");
  if (!match) return "";

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return valid ? t("reopen", lang, { date: `${match[3]}/${match[2]}` }) : "";
}

const NETWORKS = [
  { key: "instagram", name: "Instagram", host: /^https:\/\/(www\.)?instagram\.com\//i },
  { key: "facebook", name: "Facebook", host: /^https:\/\/(www\.)?facebook\.com\//i },
];

// El trazo del ícono de cada red (24x24), para pintarlo tanto en el menú
// interactivo (SVG armado con el DOM) como en el estático (SVG como texto).
const SOCIAL_ICON_PATHS = {
  instagram:
    "M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5a4.25 4.25 0 0 0 4.25 4.25h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5a4.25 4.25 0 0 0-4.25-4.25zM12 7.25a4.75 4.75 0 1 1 0 9.5 4.75 4.75 0 0 1 0-9.5zm0 1.5a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5zM17.25 5.75a1 1 0 1 1 0 2 1 1 0 0 1 0-2z",
  facebook:
    "M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.95.3-1.6 1.7-1.6h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.3h2.9V22z",
};

export function socialIconPath(key) {
  return SOCIAL_ICON_PATHS[key] ?? "";
}

// Enlaces a las redes cargadas. Solo direcciones https de esa red: lo que llegue de
// otro sitio (o con otro protocolo) se descarta.
export function socialLinks(config) {
  const redes = config && typeof config.redes === "object" ? config.redes : null;
  if (!redes) return [];

  return NETWORKS.flatMap((network) => {
    const url = safeHttpUrl(redes[network.key]);
    return url && network.host.test(url) ? [{ key: network.key, name: network.name, url }] : [];
  });
}

export function mapsUrl(address) {
  const query = String(address ?? "").trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

// Fondo del encabezado (PUBLICO-10): degradé de los colores del negocio, con la imagen
// arriba si la subió. `minimal` es blanco por diseño, así que sin imagen no se pinta.
// Devuelve el valor de `background-image`, o "" si no hay nada que pintar.
export function headerBackground(config, cssUrl) {
  const image = typeof config?.header?.imagen === "string" ? config.header.imagen : "";
  const colors = config?.colores ?? {};
  const hasColors = Boolean(colors.primary || colors.secondary);

  const gradient =
    "linear-gradient(135deg, var(--color-primary, #463AE5), var(--color-secondary, #9A6CE0))";

  if (image) return `${cssUrl(image)}, ${gradient}`;
  if (hasColors && config.template !== "minimal") return gradient;
  return "";
}

// Punto de enfoque de la imagen de cabecera (PUBLICO-50): "x% y%" para `background-position`.
// Solo salen enteros de 0 a 100; cualquier otra cosa (texto, decimales, fuera de rango) da ""
// y la cabecera queda centrada. Nunca se copia texto del dato al estilo.
export function headerPosition(config) {
  return positionText(config?.header?.posicion);
}

export function positionText(posicion) {
  const valid = (n) => Number.isInteger(n) && n >= 0 && n <= 100;
  return valid(posicion?.x) && valid(posicion?.y) ? `${posicion.x}% ${posicion.y}%` : "";
}

// Lo que es solo de las demos (PUBLICO-11): el aviso "¿Querés este menú en tu negocio?"
// y el botón "Volver" a la landing.
export function isDemoMenu(type) {
  return type === "demo";
}
