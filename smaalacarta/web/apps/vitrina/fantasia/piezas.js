// Las piezas de HTML del tema Fantasía, sin tocar el DOM (WEB-VITRINA-09 y 17): todo texto del negocio
// pasa por `escapeHtml`. `tema.js` las pone en la página. Las categorías son lugares de un mapa con un
// nombre de fantasía (el nombre real siempre queda a la vista) y el precio va en monedas de oro y en pesos.

import { escapeHtml } from "../../menu-app/lib/html.js";

// Cuántos pesos vale una moneda de oro. Se avisa en pantalla, para que nadie confunda el juego con el precio.
export const PESOS_POR_MONEDA = 1000;

export const TEXTO = {
  es: {
    mapa: "El mapa del reino",
    viaje: "Tocá un lugar para viajar hasta él",
    tesoro: "El tesoro de la casa",
    opciones: "Opciones",
    monedas: "monedas de oro",
    equivalencia: `1 moneda de oro = $${PESOS_POR_MONEDA.toLocaleString("es-AR")}`,
    agotado: "Agotado",
    toca: "Tocá el libro para abrirlo",
    libro: "Abrir el libro",
    taberna: "Taberna · Carta",
  },
  en: {
    mapa: "The map of the realm",
    viaje: "Tap a place to travel there",
    tesoro: "The treasure of the house",
    opciones: "Options",
    monedas: "gold coins",
    equivalencia: `1 gold coin = $${PESOS_POR_MONEDA.toLocaleString("es-AR")}`,
    agotado: "Sold out",
    toca: "Tap the book to open it",
    libro: "Open the book",
    taberna: "Tavern · Menu",
  },
  pt: {
    mapa: "O mapa do reino",
    viaje: "Toque num lugar para viajar até ele",
    tesoro: "O tesouro da casa",
    opciones: "Opções",
    monedas: "moedas de ouro",
    equivalencia: `1 moeda de ouro = $${PESOS_POR_MONEDA.toLocaleString("es-AR")}`,
    agotado: "Esgotado",
    toca: "Toque no livro para abri-lo",
    libro: "Abrir o livro",
    taberna: "Taberna · Cardápio",
  },
};

export function textos(lang) {
  return TEXTO[lang] ?? TEXTO.es;
}

// Lugares del mapa. Se reconocen por una palabra del nombre de la categoría en cualquiera de los 3 idiomas.
const LUGARES = [
  { clave: /hamburg|burger|hambúrg/, es: "La Forja de las Hamburguesas", en: "The Burger Forge", pt: "A Forja dos Hambúrgueres" },
  { clave: /pizza/, es: "El Horno de los Magos", en: "The Wizards' Oven", pt: "O Forno dos Magos" },
  { clave: /entrada|starter|appetizer|entrante|aperitiv/, es: "La Posada de los Comienzos", en: "The Inn of Beginnings", pt: "A Pousada dos Começos" },
  { clave: /pasta|massa|fideo|ñoqui|noqui/, es: "El Molino de los Sabios", en: "The Sages' Mill", pt: "O Moinho dos Sábios" },
  { clave: /postre|dessert|sobremesa|dulce|helado/, es: "La Cueva de los Dulces", en: "The Sweet Cavern", pt: "A Caverna dos Doces" },
  { clave: /bebida|drink|beverage|cerveza|vino/, es: "La Fuente Encantada", en: "The Enchanted Fountain", pt: "A Fonte Encantada" },
  { clave: /ensalada|salad|salada|vegano|vegan/, es: "El Huerto de las Hadas", en: "The Fairy Garden", pt: "O Jardim das Fadas" },
  { clave: /parrilla|carne|grill|steak|churrasco|asado/, es: "El Fogón del Dragón", en: "The Dragon's Hearth", pt: "O Fogão do Dragão" },
];
const GENERICO = { es: "Las Tierras de", en: "The Lands of", pt: "As Terras de" };

const sinTildes = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// El nombre de fantasía de una categoría; si no se reconoce, "Las Tierras de <nombre>".
export function nombreDeFantasia(nombre, lang) {
  const idioma = TEXTO[lang] ? lang : "es";
  const buscado = sinTildes(nombre);
  const lugar = LUGARES.find((l) => l.clave.test(buscado));
  return lugar ? lugar[idioma] : `${GENERICO[idioma]} ${nombre}`;
}

// El precio en monedas de oro: nunca menos de una.
export function monedas(valor) {
  const pesos = Number(valor);
  // Sin precio (0, vacío o texto) no se inventa una moneda.
  return Number.isFinite(pesos) && pesos > 0 ? Math.max(1, Math.round(pesos / PESOS_POR_MONEDA)) : 0;
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

// Monedas de oro y pesos reales, juntos. Los pesos son el precio de verdad.
function precio(producto, t) {
  const oro = monedas(producto.valor);
  return `<p class="precio">${oro > 0 ? `<span class="oro"><span class="moneda" aria-hidden="true"></span>${oro} <span class="oro-texto">${escapeHtml(t.monedas)}</span></span>` : ""}<strong class="pesos">$${escapeHtml(producto.precio)}</strong>${producto.agotado ? ` <span class="agotado-tag">${escapeHtml(t.agotado)}</span>` : ""}</p>`;
}

export function provision(producto, t) {
  return `<article class="provision${producto.agotado ? " agotado" : ""}">
    ${foto(producto, "foto")}
    <div class="provision-texto">
      <h3>${escapeHtml(producto.nombre)}</h3>
      ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
      ${opciones(producto, t)}
      ${precio(producto, t)}
    </div>
  </article>`;
}

export function tesoro(producto, t) {
  if (!producto) return "";
  return `<section class="tesoro" aria-labelledby="tesoro-nombre">
    <svg class="lacre-tesoro" viewBox="0 0 40 40" width="54" height="54" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="17" fill="#8c2f39" stroke="#5d1a22" stroke-width="2"/><path d="M20 9l3 8h8l-6.5 5 2.5 8-7-5-7 5 2.5-8L9 17h8z" fill="#f3c9ce"/></svg>
    <p class="cartel">${escapeHtml(t.tesoro)}</p>
    ${foto(producto, "foto foto-grande")}
    <div class="provision-texto">
      <h2 id="tesoro-nombre">${escapeHtml(producto.nombre)}</h2>
      ${producto.descripcion ? `<p class="desc">${escapeHtml(producto.descripcion)}</p>` : ""}
      ${opciones(producto, t)}
      ${precio(producto, t)}
    </div>
  </section>`;
}

// El mapa: una ruta en zigzag, un lugar por categoría.
export function mapa(categorias, lang, t) {
  if (categorias.length === 0) return "";
  const lugares = categorias
    .map(
      (cat, i) =>
        `<li><a href="#${escapeHtml(cat.id)}"><span class="pin" aria-hidden="true">${i + 1}</span><span class="lugar"><span class="lugar-fantasia">${escapeHtml(nombreDeFantasia(cat.nombre, lang))}</span><span class="lugar-real">${escapeHtml(cat.nombre)}</span></span></a></li>`,
    )
    .join("");
  return `<nav class="mapa" id="mapa" aria-labelledby="mapa-titulo">
    <h2 id="mapa-titulo">${escapeHtml(t.mapa)}</h2>
    <p class="viaje">${escapeHtml(t.viaje)}</p>
    <ol>${lugares}</ol>
    <p class="equivalencia">${escapeHtml(t.equivalencia)}</p>
  </nav>`;
}

export function lugar(cat, lang, t) {
  const id = escapeHtml(cat.id);
  return `<section class="reino" id="${id}" aria-labelledby="${id}-t">
      <h2 id="${id}-t"><span class="reino-fantasia">${escapeHtml(nombreDeFantasia(cat.nombre, lang))}</span><span class="reino-real">${escapeHtml(cat.nombre)}</span></h2>
      <div class="provisiones">${cat.items.map((producto) => provision(producto, t)).join("")}</div>
    </section>`;
}
