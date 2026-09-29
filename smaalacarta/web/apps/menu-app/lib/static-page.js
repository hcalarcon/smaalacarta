// El menú estático (Etapa 6e, plan "Menú Web"): la misma información que el menú
// interactivo (`public_menu`), pero como HTML de solo lectura, sin carrito ni
// pedidos. Reusa las plantillas del menú interactivo (mismas clases, mismo CSS)
// para verse igual; solo cambia que no hay JS de carrito ni formulario.
// Todo texto del negocio se escapa (PUBLICO-9): nunca se interpola sin pasar por
// `escapeHtml` o `safeHttpUrl`.

import { brandVariables } from "./colors.js";
import { cssUrl, escapeHtml, safeHttpUrl } from "./html.js";
import {
  closedNotice,
  headerBackground,
  mapsUrl,
  reopenText,
  socialIconPath,
  socialLinks,
} from "./info.js";
import { DEFAULT_LANG, normalizeLang, t } from "./i18n.js";
import { buildEnhancedMenu } from "./menu.js";
import { isOpenNow, nextOpening, openingText } from "./schedule.js";

const TEMPLATES = ["moderno", "clasico", "minimal"];
const COLOR = /^#[0-9a-fA-F]{6}$/;

function safeColor(value, fallback) {
  return typeof value === "string" && COLOR.test(value) ? value : fallback;
}

function slugify(text) {
  return String(text ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

function socialIconSvg(key) {
  const path = socialIconPath(key);
  return path
    ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`
    : "";
}

function productCard(item) {
  const image = safeHttpUrl(item?.imagen);
  // Igual que el interactivo: la plantilla dibuja la etiqueta de la promo desde el atributo.
  const promo = item?.promo ? ` data-promo="${escapeHtml(item.promo)}"` : "";

  return `<article class="producto"${promo}>
    ${image ? `<img src="${escapeHtml(image)}" alt="">` : ""}
    <div class="producto-info">
      <h3>${escapeHtml(item?.nombre)}</h3>
      <p>${escapeHtml(item?.descripcion || "")}</p>
      ${item?.precioAnterior ? `<span class="precio-anterior">$${escapeHtml(item.precioAnterior)}</span>` : ""}
      <div class="producto-precio">$${escapeHtml(item?.precio)}</div>
    </div>
  </article>`;
}

function categorySection(cat) {
  const items = Array.isArray(cat?.items) ? cat.items : [];
  if (items.length === 0) return "";

  const id = slugify(cat.nombre);
  const tipo = cat.tipo ? ` categoria-${escapeHtml(cat.tipo)}` : "";

  return `<section class="categoria${tipo}" id="${escapeHtml(id)}">
    <h2 class="categoria-titulo">${escapeHtml(cat.nombre)}</h2>
    <div class="categoria-grid">${items.map(productCard).join("")}</div>
  </section>`;
}

function categoryNav(categorias) {
  const links = categorias
    .filter((cat) => Array.isArray(cat.items) && cat.items.length > 0)
    .map((cat) => `<a href="#${escapeHtml(slugify(cat.nombre))}">${escapeHtml(cat.nombre)}</a>`)
    .join("");

  return links ? `<nav class="categorias">${links}</nav>` : "";
}

function closedBanner(config, lang) {
  const cierre = closedNotice(config);
  if (cierre) {
    const text = [t("closed.temporary", lang), cierre.message, reopenText(cierre.reopensOn, lang)]
      .filter(Boolean)
      .join(" · ");
    return { html: `<div class="cierre-temporal" role="status">${escapeHtml(text)}</div>`, abierto: false };
  }

  if (!isOpenNow(config?.horarios)) {
    const text = [t("closed.now", lang), openingText(nextOpening(config?.horarios), lang)].filter(Boolean).join(" · ");
    return { html: `<div class="cierre-temporal" role="status">${escapeHtml(text)}</div>`, abierto: false };
  }

  return { html: "", abierto: true };
}

function footer(config) {
  const parts = [];
  const mapa = mapsUrl(config?.direccion);

  if (mapa) {
    parts.push(
      `<p><a class="direccion" href="${escapeHtml(mapa)}" target="_blank" rel="noopener noreferrer">📍 ${escapeHtml(config?.direccion)}</a></p>`,
    );
  }

  const links = socialLinks(config);
  if (links.length > 0) {
    const redes = links
      .map(
        (link) =>
          `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(link.name)}" title="${escapeHtml(link.name)}">${socialIconSvg(link.key)}</a>`,
      )
      .join("");
    parts.push(`<div class="pie-redes">${redes}</div>`);
  }

  return parts.length > 0 ? `<footer class="pie-negocio">${parts.join("")}</footer>` : "";
}

// Reusa `.btn-cta` (ya con los colores de marca, en los tres templates) en vez
// de inventar una clase propia sin estilo en este contexto. El mensaje va siempre en
// español, porque lo lee el negocio (IDIOMA-5); solo el botón se traduce.
function whatsappContact(config, lang) {
  const phone = String(config?.telefono ?? "").replace(/\D/g, "");
  if (!phone) return "";

  const message = `Hola, consulto por el menú de ${config?.nombre ?? ""}`;
  return `<div class="contacto-estatico"><a class="btn-cta" href="https://api.whatsapp.com/send?phone=${escapeHtml(phone)}&text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("static.whatsapp", lang))}</a></div>`;
}

// El HTML completo del menú estático de un negocio, a partir de lo mismo que
// devuelve `public_menu` (`{ config, menu }`) y el idioma de `?lang=` (IDIOMA-6).
export function renderStaticMenuPage({ config, menu, lang: requestedLang } = {}) {
  const lang = normalizeLang(requestedLang) ?? DEFAULT_LANG;
  // Las mismas secciones que el interactivo: Destacados y Ofertas antes de las categorías.
  const enhanced = buildEnhancedMenu(menu, lang);
  const categorias = Array.isArray(enhanced?.categorias) ? enhanced.categorias : [];
  const template = TEMPLATES.includes(config?.template) ? config.template : "moderno";
  const tema = config?.tema === "oscuro" ? "oscuro" : "claro";
  const primary = safeColor(config?.colores?.primary, "#5a4a3a");
  const secondary = safeColor(config?.colores?.secondary, "#d97706");
  // Los colores y el texto que se lee sobre ellos: solo salen hex y rgba() calculados.
  const brandCss = Object.entries(brandVariables({ primary, secondary }))
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

  const { html: aviso, abierto } = closedBanner(config, lang);
  // `cssUrl` devuelve `url("…")`, con comillas adentro: hay que escaparlas para
  // que no corten el atributo `style="…"` a la mitad (rompía toda la cabecera).
  const headerImage = headerBackground(config, cssUrl);
  const headerStyle = headerImage
    ? ` style="background-image: ${escapeHtml(headerImage)}"`
    : "";
  const logo = safeHttpUrl(config?.logo);

  return `<!doctype html>
<html lang="${lang}" data-template="${template}" data-tema="${tema}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(config?.nombre || "Menú")}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<style>:root{${brandCss}}</style>
<link rel="stylesheet" href="/apps/menu-app/base.css">
<link rel="stylesheet" href="/templates/carrito/${template}/styles.css">
<link rel="stylesheet" href="/apps/menu-app/desktop.css" media="(min-width: 1024px)">
</head>
<body class="menu-estatico">
<header class="header"${headerStyle}>
  <div class="header-top">
    <span class="badge-estado"><span class="dot" style="background:${abierto ? "#4ade80" : "#ef4444"}"></span>${escapeHtml(t(abierto ? "status.open" : "status.closed", lang))}</span>
  </div>
  ${logo ? `<img class="logo-negocio" src="${escapeHtml(logo)}" alt="">` : ""}
  <h1>${escapeHtml(config?.nombre)}</h1>
  <p>${escapeHtml(config?.descripcion || "")}</p>
</header>
${aviso}
${categoryNav(categorias)}
<main class="menu-container" id="menu">${categorias.map(categorySection).join("")}</main>
${footer(config)}
${whatsappContact(config, lang)}
</body>
</html>`;
}
