// Datos del negocio que el menú muestra además de los productos: cierre temporal,
// dirección y redes (PUBLICO-8 y 9). Toman lo que llega en `config` (ver
// `public-menu.js`) y lo dejan listo para pintar.

import { safeHttpUrl } from "./html.js";

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
export function reopenText(reopensOn) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reopensOn ?? "");
  if (!match) return "";

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return valid ? `Reabrimos el ${match[3]}/${match[2]}` : "";
}

const NETWORKS = [
  { key: "instagram", name: "Instagram", host: /^https:\/\/(www\.)?instagram\.com\//i },
  { key: "facebook", name: "Facebook", host: /^https:\/\/(www\.)?facebook\.com\//i },
];

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

// Lo que es solo de las demos (PUBLICO-11): el aviso "¿Querés este menú en tu negocio?"
// y el botón "Volver" a la landing.
export function isDemoMenu(type) {
  return type === "demo";
}
