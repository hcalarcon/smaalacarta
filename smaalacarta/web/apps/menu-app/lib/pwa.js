// Lo que la página le dice al navegador para ser instalable (PWA-1 a 3): el manifest del
// negocio, su ícono, el color de la barra y el nombre. Se aplica cuando el menú ya cargó.

import { safeHttpsUrl } from "./html.js";

export const GENERAL_FAVICON = "/assets/pwa/favicon-96x96.png";
export const GENERAL_TOUCH_ICON = "/assets/pwa/apple-touch-icon.png";
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

// Un negocio pide su propio manifest; las demos y cualquier otra cosa, el general.
export function manifestHref(type, slug) {
  return type === "cliente" && SLUG.test(String(slug ?? "")) ? `/api/manifest?slug=${slug}` : "/api/manifest";
}

function setLink(doc, rel, attrs) {
  doc.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => el.remove());
  const link = doc.createElement("link");
  link.rel = rel;
  Object.entries(attrs).forEach(([name, value]) => link.setAttribute(name, value));
  doc.head.appendChild(link);
}

function setMeta(doc, name, content) {
  let meta = doc.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = doc.createElement("meta");
    meta.name = name;
    doc.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

export function applyPwa(doc, { type, slug, config }) {
  const name = typeof config?.nombre === "string" ? config.nombre.trim() : "";
  const logo = safeHttpsUrl(config?.logo);
  const primary = config?.colores?.primary;

  if (name) doc.title = name;

  setLink(doc, "manifest", { href: manifestHref(type, slug) });
  setLink(doc, "icon", { href: logo || GENERAL_FAVICON });
  setLink(doc, "apple-touch-icon", { href: logo || GENERAL_TOUCH_ICON });

  if (typeof primary === "string" && /^#[0-9a-fA-F]{6}$/.test(primary)) setMeta(doc, "theme-color", primary);
  setMeta(doc, "apple-mobile-web-app-capable", "yes");
  setMeta(doc, "mobile-web-app-capable", "yes");
  if (name) setMeta(doc, "apple-mobile-web-app-title", name.slice(0, 12).trim());
}
