// Las piezas de HTML del tema Floral, sin tocar el DOM (WEB-VITRINA-09 y 14): todo texto del negocio
// pasa por `escapeHtml`. `tema.js` las pone en la página. Las flores son símbolos SVG definidos en el
// `index.html` (`#f-rosa`, `#f-margarita`…), un separador distinto por categoría.

import { escapeHtml } from "../../menu-app/lib/html.js";

export const TEXTO = {
  es: { casa: "Menú de la casa", chef: "Sugerencia del chef", opciones: "Opciones" },
  en: { casa: "House menu", chef: "Chef's suggestion", opciones: "Options" },
  pt: { casa: "Cardápio da casa", chef: "Sugestão do chef", opciones: "Opções" },
};

export const FLORES = ["f-rosa", "f-margarita", "f-anemona", "f-tulipan", "f-lavanda", "f-hojas"];

export function textos(lang) {
  return TEXTO[lang] ?? TEXTO.es;
}

export function florDeLaCategoria(indice) {
  return FLORES[indice % FLORES.length];
}

export function separador(indice) {
  return `<div class="separador" aria-hidden="true"><span class="linea"></span><svg class="flor" viewBox="0 0 40 40" width="56" height="56" focusable="false"><use href="#${florDeLaCategoria(indice)}"/></svg><span class="linea"></span></div>`;
}

function retrato(producto, clase) {
  if (!producto.imagen) return `<div class="${clase} sin-foto" aria-hidden="true"></div>`;
  return `<figure class="${clase}"><img src="${escapeHtml(producto.imagen)}" alt="${escapeHtml(producto.nombre)}" width="160" height="200" loading="lazy" decoding="async"></figure>`;
}

function opciones(producto, t) {
  if (producto.opciones.length === 0) return "";
  const lineas = producto.opciones.map((linea) => `<li>${escapeHtml(linea)}</li>`).join("");
  return `<ul class="opc" aria-label="${escapeHtml(t.opciones)}">${lineas}</ul>`;
}

export function plato(producto, t) {
  return `<article class="plato${producto.agotado ? " agotado" : ""}">
    <div class="plato-texto">
      <h3><span class="nombre">${escapeHtml(producto.nombre)}</span><span class="puntos" aria-hidden="true"></span><span class="precio">$${escapeHtml(producto.precio)}</span></h3>
      ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
      ${opciones(producto, t)}
    </div>
    ${retrato(producto, "oval")}
  </article>`;
}

export function chef(producto, t) {
  if (!producto) return "";
  return `<section class="chef" aria-labelledby="chef-nombre">
    <svg class="sello" viewBox="0 0 80 80" width="76" height="76" aria-hidden="true" focusable="false"><use href="#sello"/></svg>
    <p class="adorno chef-etiqueta">${escapeHtml(t.chef)}</p>
    ${retrato(producto, "oval oval-grande")}
    <h2 id="chef-nombre">${escapeHtml(producto.nombre)}</h2>
    ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
    ${opciones(producto, t)}
    <p class="precio precio-chef">$${escapeHtml(producto.precio)}</p>
  </section>`;
}

export function seccion(cat, indice, t) {
  const id = escapeHtml(cat.id);
  return `<section class="categoria" id="${id}" aria-labelledby="${id}-t">
      ${separador(indice)}
      <h2 id="${id}-t">${escapeHtml(cat.nombre)}</h2>
      <div class="platos">${cat.items.map((producto) => plato(producto, t)).join("")}</div>
    </section>`;
}

export function enlaceCategoria(cat) {
  return `<a href="#${escapeHtml(cat.id)}">${escapeHtml(cat.nombre)}</a>`;
}
