// Lógica pura de la vitrina de menús extraordinarios (WEB-VITRINA): siempre muestra el menú de
// Santa Julia Resto, en solo lectura. Reusa el formato de precios, el idioma y el escape del menú
// de siempre; acá solo se arman las secciones y los textos de la vitrina.

import { escapeHtml, safeHttpUrl } from "../../menu-app/lib/html.js";
import { LANGS, localized, normalizeLang, t } from "../../menu-app/lib/i18n.js";
import { hasOptions } from "../../menu-app/lib/options.js";
import { formatPrice } from "../../menu-app/lib/price.js";

export const SLUG = "santa-julia-resto";
export const WHATSAPP = "5493644277105";
export const LANDING = "https://smaalacarta.com.ar";
export const LOGO = "https://www.smaalacarta.com.ar/assets/logo.png";

// `listo` dice si el tema ya tiene su carpeta; un test lo compara con el disco.
export const TEMAS = [
  { id: "arcade", nombre: "Arcade", lema: "Insertá una moneda y elegí tu nivel", listo: true },
  { id: "floral", nombre: "Floral delicado", lema: "Una carta de casamiento que florece", listo: false },
  { id: "futurista", nombre: "Futurista", lema: "Interfaz de nave espacial", listo: false },
  { id: "natural", nombre: "Natural", lema: "Cordillera y lagos, de día a noche", listo: false },
  { id: "fantasia", nombre: "Fantasía", lema: "La carta de una taberna encantada", listo: false },
];

export function temaPorId(id) {
  return TEMAS.find((tema) => tema.id === id) ?? null;
}

// Textos propios de la vitrina (el resto sale del diccionario del menú).
const TEXTOS = {
  es: {
    barra: "Hecho por",
    quiero: "Quiero uno así para mi local",
    otros: "Ver otros estilos",
    idioma: "Idioma",
    cargando: "No se pudo cargar el menú. Probá de nuevo en un rato.",
  },
  en: {
    barra: "Made by",
    quiero: "I want one like this for my place",
    otros: "See other styles",
    idioma: "Language",
    cargando: "The menu could not be loaded. Please try again later.",
  },
  pt: {
    barra: "Feito por",
    quiero: "Quero um assim para o meu local",
    otros: "Ver outros estilos",
    idioma: "Idioma",
    cargando: "Não foi possível carregar o cardápio. Tente de novo mais tarde.",
  },
};

export function texto(clave, lang) {
  return (TEXTOS[normalizeLang(lang) ?? "es"] ?? TEXTOS.es)[clave] ?? TEXTOS.es[clave] ?? clave;
}

// El WhatsApp de Herni, con el nombre del tema ya escrito (el texto va siempre en español: lo lee él).
export function whatsappLink(nombreTema) {
  const mensaje = `Hola Herni, vi el menú ${nombreTema} y quiero uno así para mi local. Mi local se llama: `;
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
}

// "Elegí guarnición: papas · puré +$500 (elegí 1)", una línea de texto plano por grupo.
export function lineasDeOpciones(item, lang) {
  if (!hasOptions(item)) return [];

  return item.opciones.map((grupo) => {
    const opciones = (grupo.opciones ?? [])
      .map((op) => {
        const extra = Number(op.precio) > 0 ? ` +$${formatPrice(op.precio)}` : "";
        const agotada = op.agotado === true ? ` (${t("item.soldOut", lang)})` : "";
        return `${op.nombre}${extra}${agotada}`;
      })
      .join(" · ");

    const min = Number(grupo.min) || 0;
    const max = Number(grupo.max) || min;
    let regla = "";
    if (min < 1) regla = max > 1 ? t("static.upTo", lang, { max }) : "";
    else if (min === max) regla = t("static.pick", lang, { n: min });
    else regla = t("static.pickRange", lang, { min, max });

    return `${grupo.nombre}: ${opciones}${regla ? ` (${regla})` : ""}`;
  });
}

function idUnico(nombre, usados) {
  const base =
    String(nombre ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "seccion";
  // El prefijo evita chocar con los ids fijos de cada tema (`menu`, `contenido`, `titulo`…).
  let id = `cat-${base}`;
  for (let n = 2; usados.has(id); n += 1) id = `cat-${base}-${n}`;
  usados.add(id);
  return id;
}

function producto(item, lang) {
  const local = localized(item, lang);
  return {
    nombre: String(local.nombre ?? ""),
    descripcion: String(local.descripcion ?? ""),
    precio: formatPrice(local.precio),
    imagen: safeHttpUrl(local.imagen),
    destacado: local.destacado === true,
    agotado: local.agotado === true,
    opciones: lineasDeOpciones(local, lang),
  };
}

// Del menú de `public_menu` a lo que pintan los temas: categorías con id para saltar, productos con el
// precio ya formateado y el destacado aparte. Las categorías sin productos no aparecen.
export function buildSections(menu, lang) {
  const usados = new Set();
  const categorias = (Array.isArray(menu?.categorias) ? menu.categorias : [])
    .map((cat) => {
      const local = localized(cat, lang);
      const items = (Array.isArray(cat.items) ? cat.items : []).map((item) => producto(item, lang));
      return { id: idUnico(local.nombre, usados), nombre: String(local.nombre ?? ""), items };
    })
    .filter((cat) => cat.items.length > 0);

  const destacado = categorias.flatMap((cat) => cat.items).find((item) => item.destacado) ?? null;
  return { categorias, destacado };
}

// Barra chica y fija, igual en todos los temas (WEB-VITRINA-06).
export function barraHtml(tema, lang) {
  return `<footer class="vitrina-barra" data-barra>
    <span class="vitrina-barra-firma">${escapeHtml(texto("barra", lang))} <a href="${LANDING}">SMA a la Carta</a></span>
    <a class="vitrina-barra-otros" href="/vitrina">${escapeHtml(texto("otros", lang))}</a>
    <a class="vitrina-barra-quiero" href="${escapeHtml(whatsappLink(tema.nombre))}" rel="noopener">${escapeHtml(texto("quiero", lang))}</a>
  </footer>`;
}

// Los tres botones de idioma de cada tema; el arranque les da vida (`data-idiomas`).
export function idiomasHtml(lang) {
  const botones = LANGS.map(
    (code) =>
      `<button type="button" data-lang="${code}" lang="${code}" aria-pressed="${code === lang}">${code.toUpperCase()}</button>`,
  ).join("");
  return `<div class="idiomas" data-idiomas role="group" aria-label="${escapeHtml(texto("idioma", lang))}">${botones}</div>`;
}

// Tarjetas de la galería. Un tema sin carpeta sale como "Próximamente" y sin link (WEB-VITRINA-12).
export function galeriaHtml(temas = TEMAS) {
  return temas
    .map((tema) => {
      const cuerpo = `<span class="vista vista-${escapeHtml(tema.id)}" aria-hidden="true"></span>
        <span class="tarjeta-nombre">${escapeHtml(tema.nombre)}</span>
        <span class="tarjeta-lema">${escapeHtml(tema.lema)}</span>`;
      return tema.listo
        ? `<li><a class="tarjeta" href="/vitrina/${escapeHtml(tema.id)}">${cuerpo}<span class="tarjeta-boton">Abrir</span></a></li>`
        : `<li><div class="tarjeta proximamente">${cuerpo}<span class="tarjeta-boton">Próximamente</span></div></li>`;
    })
    .join("");
}
