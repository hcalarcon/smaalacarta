// Las piezas de HTML del tema Futurista, sin tocar el DOM (WEB-VITRINA-09 y 15): todo texto del negocio
// pasa por `escapeHtml`. `tema.js` las pone en la página.

import { escapeHtml } from "../../menu-app/lib/html.js";

export const TEXTO = {
  es: { sector: "SECTOR", composicion: "COMPOSICIÓN", creditos: "CRÉDITOS", prioridad: "OBJETIVO PRIORITARIO", opciones: "MÓDULOS OPCIONALES", agotado: "SIN STOCK" },
  en: { sector: "SECTOR", composicion: "COMPOSITION", creditos: "CREDITS", prioridad: "PRIORITY TARGET", opciones: "OPTIONAL MODULES", agotado: "OUT OF STOCK" },
  pt: { sector: "SETOR", composicion: "COMPOSIÇÃO", creditos: "CRÉDITOS", prioridad: "ALVO PRIORITÁRIO", opciones: "MÓDULOS OPCIONAIS", agotado: "SEM ESTOQUE" },
};

export function textos(lang) {
  return TEXTO[lang] ?? TEXTO.es;
}

// Las líneas que se "escriben" al entrar, como en una terminal.
export function lineasDeArranque(lang) {
  const lineas = {
    es: ["INICIANDO SISTEMA…", "CARGANDO CARTA: SANTA JULIA", "ESCANEO COMPLETO. BIENVENIDO."],
    en: ["BOOTING SYSTEM…", "LOADING MENU: SANTA JULIA", "SCAN COMPLETE. WELCOME."],
    pt: ["INICIANDO SISTEMA…", "CARREGANDO CARDÁPIO: SANTA JULIA", "SCAN COMPLETO. BEM-VINDO."],
  };
  return (lineas[lang] ?? lineas.es).map((linea) => `> ${linea}`);
}

function foto(producto) {
  if (!producto.imagen) return `<div class="holo sin-foto" aria-hidden="true"></div>`;
  return `<div class="holo"><img src="${escapeHtml(producto.imagen)}" alt="${escapeHtml(producto.nombre)}" width="400" height="300" loading="lazy" decoding="async"></div>`;
}

function modulos(producto, t) {
  if (producto.opciones.length === 0) return "";
  const lineas = producto.opciones.map((linea) => `<li>${escapeHtml(linea)}</li>`).join("");
  return `<ul class="modulos" aria-label="${escapeHtml(t.opciones)}">${lineas}</ul>`;
}

export function ficha(producto, t) {
  return `<article class="ficha${producto.agotado ? " agotado" : ""}">
    ${foto(producto)}
    <div class="ficha-datos">
      <h3>${escapeHtml(producto.nombre)}</h3>
      ${producto.descripcion ? `<p class="dato"><span class="clave">${escapeHtml(t.composicion)}</span> ${escapeHtml(producto.descripcion)}</p>` : ""}
      ${modulos(producto, t)}
      <p class="creditos"><span class="clave">${escapeHtml(t.creditos)}</span> <strong>$${escapeHtml(producto.precio)}</strong>${producto.agotado ? ` <span class="alerta">${escapeHtml(t.agotado)}</span>` : ""}</p>
    </div>
  </article>`;
}

export function objetivo(producto, t) {
  if (!producto) return "";
  return `<section class="objetivo" aria-labelledby="objetivo-nombre">
    <p class="etiqueta parpadea-lento">◆ ${escapeHtml(t.prioridad)} ◆</p>
    ${foto(producto)}
    <h2 id="objetivo-nombre">${escapeHtml(producto.nombre)}</h2>
    ${producto.descripcion ? `<p class="dato"><span class="clave">${escapeHtml(t.composicion)}</span> ${escapeHtml(producto.descripcion)}</p>` : ""}
    ${modulos(producto, t)}
    <p class="creditos creditos-grande"><span class="clave">${escapeHtml(t.creditos)}</span> <strong>$${escapeHtml(producto.precio)}</strong>${producto.agotado ? ` <span class="alerta">${escapeHtml(t.agotado)}</span>` : ""}</p>
  </section>`;
}

export function sector(cat, numero, t) {
  const id = escapeHtml(cat.id);
  return `<section class="sector" id="${id}" aria-labelledby="${id}-t">
      <p class="etiqueta">${escapeHtml(t.sector)} ${String(Number(numero)).padStart(2, "0")}</p>
      <h2 id="${id}-t">${escapeHtml(cat.nombre)}</h2>
      <div class="fichas">${cat.items.map((producto) => ficha(producto, t)).join("")}</div>
    </section>`;
}

export function enlaceSector(cat, numero) {
  return `<a href="#${escapeHtml(cat.id)}"><span class="n">${String(Number(numero)).padStart(2, "0")}</span> ${escapeHtml(cat.nombre)}</a>`;
}
