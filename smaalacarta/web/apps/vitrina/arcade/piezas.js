// Las piezas de HTML del tema Arcade, sin tocar el DOM (WEB-VITRINA-09 y 13): todo texto del negocio
// pasa por `escapeHtml`. `tema.js` las pone en la página.

import { escapeHtml } from "../../menu-app/lib/html.js";

export const TEXTO = {
  es: { toca: "TOCÁ PARA EMPEZAR", legendario: "ÍTEM LEGENDARIO", mundo: "MUNDO", over: "GAME OVER", opciones: "OPCIONES" },
  en: { toca: "TAP TO START", legendario: "LEGENDARY ITEM", mundo: "WORLD", over: "GAME OVER", opciones: "OPTIONS" },
  pt: { toca: "TOQUE PARA COMEÇAR", legendario: "ITEM LENDÁRIO", mundo: "MUNDO", over: "GAME OVER", opciones: "OPÇÕES" },
};

export function textos(lang) {
  return TEXTO[lang] ?? TEXTO.es;
}

export function foto(producto) {
  if (!producto.imagen) return `<div class="foto sin-foto" aria-hidden="true"></div>`;
  return `<div class="foto"><img src="${escapeHtml(producto.imagen)}" alt="${escapeHtml(producto.nombre)}" width="400" height="300" loading="lazy" decoding="async"></div>`;
}

function opciones(producto, t) {
  if (producto.opciones.length === 0) return "";
  const lineas = producto.opciones.map((linea) => `<li>${escapeHtml(linea)}</li>`).join("");
  return `<ul class="opciones" aria-label="${escapeHtml(t.opciones)}">${lineas}</ul>`;
}

const precio = (producto, extra = "") =>
  `<span class="moneda" aria-hidden="true"></span>$${escapeHtml(producto.precio)}${extra}`;

export function tarjeta(producto, t) {
  const over = producto.agotado ? ` <span class="over">${escapeHtml(t.over)}</span>` : "";
  return `<article class="prod${producto.agotado ? " agotado" : ""}">
    ${foto(producto)}
    <div class="prod-info">
      <h3>${escapeHtml(producto.nombre)}</h3>
      ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
      ${opciones(producto, t)}
      <p class="precio">${precio(producto, over)}</p>
    </div>
  </article>`;
}

export function boss(producto, t) {
  if (!producto) return "";
  return `<section class="boss" aria-labelledby="boss-nombre">
    <p class="boss-etiqueta">★ ${escapeHtml(t.legendario)} ★</p>
    ${foto(producto)}
    <h2 id="boss-nombre">${escapeHtml(producto.nombre)}</h2>
    ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
    ${opciones(producto, t)}
    <p class="precio precio-boss">${precio(producto)}</p>
  </section>`;
}

export function mundo(cat, numero, t) {
  const id = escapeHtml(cat.id);
  return `<section class="mundo" id="${id}" aria-labelledby="${id}-t">
      <p class="mundo-etiqueta">${escapeHtml(t.mundo)} ${Number(numero)}</p>
      <h2 id="${id}-t">${escapeHtml(cat.nombre)}</h2>
      <div class="rejilla">${cat.items.map((producto) => tarjeta(producto, t)).join("")}</div>
    </section>`;
}

export function enlaceMundo(cat, numero) {
  return `<a href="#${escapeHtml(cat.id)}"><span class="mundo-n">${Number(numero)}</span> ${escapeHtml(cat.nombre)}</a>`;
}
