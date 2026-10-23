// Las piezas de HTML del tema Natural, sin tocar el DOM (WEB-VITRINA-09 y 16): todo texto del negocio
// pasa por `escapeHtml`. `tema.js` las pone en la página. Las categorías son senderos y los productos,
// postales con una etiqueta de madera para el precio.

import { escapeHtml } from "../../menu-app/lib/html.js";

export const TEXTO = {
  es: { sendero: "Sendero", imperdible: "El imperdible del lugar", opciones: "Opciones", agotado: "Sin stock" },
  en: { sendero: "Trail", imperdible: "The one you can't miss", opciones: "Options", agotado: "Out of stock" },
  pt: { sendero: "Trilha", imperdible: "O imperdível do lugar", opciones: "Opções", agotado: "Sem estoque" },
};

export function textos(lang) {
  return TEXTO[lang] ?? TEXTO.es;
}

function foto(producto, clase) {
  if (!producto.imagen) return `<div class="${clase} sin-foto" aria-hidden="true"></div>`;
  return `<div class="${clase}"><img src="${escapeHtml(producto.imagen)}" alt="${escapeHtml(producto.nombre)}" width="400" height="300" loading="lazy" decoding="async"></div>`;
}

function opciones(producto, t) {
  if (producto.opciones.length === 0) return "";
  const lineas = producto.opciones.map((linea) => `<li>${escapeHtml(linea)}</li>`).join("");
  return `<ul class="opciones" aria-label="${escapeHtml(t.opciones)}">${lineas}</ul>`;
}

const etiqueta = (producto, t) =>
  `<p class="etiqueta-precio"><span class="agujero" aria-hidden="true"></span>$${escapeHtml(producto.precio)}${producto.agotado ? ` <span class="sin-stock">${escapeHtml(t.agotado)}</span>` : ""}</p>`;

export function postal(producto, t) {
  return `<article class="postal${producto.agotado ? " agotado" : ""}">
    ${foto(producto, "foto")}
    <div class="postal-texto">
      <h3>${escapeHtml(producto.nombre)}</h3>
      ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
      ${opciones(producto, t)}
      ${etiqueta(producto, t)}
    </div>
  </article>`;
}

export function imperdible(producto, t) {
  if (!producto) return "";
  return `<section class="imperdible" aria-labelledby="imperdible-nombre">
    <p class="cartel">${escapeHtml(t.imperdible)}</p>
    ${foto(producto, "foto foto-grande")}
    <div class="postal-texto">
      <h2 id="imperdible-nombre">${escapeHtml(producto.nombre)}</h2>
      ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
      ${opciones(producto, t)}
      ${etiqueta(producto, t)}
    </div>
  </section>`;
}

export function sendero(cat, numero, t) {
  const id = escapeHtml(cat.id);
  return `<section class="sendero" id="${id}" aria-labelledby="${id}-t">
      <h2 id="${id}-t" class="cartel cartel-sendero"><span class="n">${escapeHtml(t.sendero)} ${Number(numero)}</span> ${escapeHtml(cat.nombre)}</h2>
      <div class="postales">${cat.items.map((producto) => postal(producto, t)).join("")}</div>
    </section>`;
}

export function enlaceSendero(cat, numero) {
  return `<a href="#${escapeHtml(cat.id)}"><span class="n">${Number(numero)}</span> ${escapeHtml(cat.nombre)}</a>`;
}
