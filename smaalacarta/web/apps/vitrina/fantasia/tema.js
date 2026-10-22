// Tema Fantasía (WEB-VITRINA-17): la carta de una taberna encantada. Entra por un libro cerrado con el
// sello de Santa Julia que se abre al tocarlo, con luz de vela que parpadea; las categorías son lugares de
// un mapa y al tocar uno se viaja hasta él. Los productos son provisiones, con el precio en monedas de oro
// y en pesos reales. Sin librerías ni sonido. El HTML de cada pieza se arma en `piezas.js`, donde todo
// dato del negocio pasa por `escapeHtml`.

import { arrancar } from "../lib/arranque.js";
import { idiomasHtml, temaPorId } from "../lib/vitrina.js";
import { lugar, mapa, tesoro, textos } from "./piezas.js";

const TEMA = temaPorId("fantasia");

const $ = (id) => document.getElementById(id);
const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- El libro de la entrada ----
function prepararLibro() {
  const puerta = $("puerta");
  const bloqueados = [document.querySelector(".barra-top"), $("menu")];
  bloqueados.forEach((el) => el.setAttribute("inert", ""));
  $("abrir").focus({ preventScroll: true });
  let tocado = false;
  let abierta = false;

  const entrar = () => {
    if (abierta) return;
    abierta = true;
    puerta.remove();
    bloqueados.forEach((el) => el.removeAttribute("inert"));
    const titulo = $("titulo");
    titulo.tabIndex = -1;
    titulo.focus({ preventScroll: true });
  };

  $("abrir").addEventListener("click", () => {
    if (tocado) return;
    tocado = true;
    if (calmo()) return entrar();

    $("abrir").classList.add("abierto");
    $("toca").hidden = true;
    setTimeout(() => {
      puerta.classList.add("fuera");
      setTimeout(entrar, 600);
    }, 1500);
  });

  // Si el menú no carga, el libro no puede dejar a nadie sin ver el aviso.
  document.addEventListener("vitrina:error", entrar);
}

// ---- Viajar a un lugar del mapa: llega y se ilumina un momento ----
function prepararViaje() {
  document.addEventListener("click", (event) => {
    const enlace = event.target.closest?.(".mapa a");
    const destino = enlace ? document.querySelector(enlace.hash) : null;
    if (!destino || calmo()) return;

    destino.classList.remove("viajado");
    void destino.offsetWidth;
    destino.classList.add("viajado");
    setTimeout(() => destino.classList.remove("viajado"), 1500);
  });
}

// ---- Pintado ----
function render({ lang, secciones }) {
  const t = textos(lang);
  const { categorias, destacado } = secciones;

  // La puerta de entrada ya no está cuando se cambia de idioma con la carta abierta.
  const puerta = $("puerta");
  if (puerta) {
    $("toca").textContent = t.toca;
    $("tapa-sub").textContent = t.taberna;
    $("abrir").setAttribute("aria-label", t.libro);
  }
  $("al-mapa").hidden = categorias.length === 0;
  $("al-mapa").textContent = `🗺 ${lang === "en" ? "Map" : "Mapa"}`;
  const lugarIdiomas = document.querySelector("[data-idiomas-lugar]");
  if (lugarIdiomas && !lugarIdiomas.firstElementChild) lugarIdiomas.innerHTML = idiomasHtml(lang);

  $("contenido").innerHTML =
    mapa(categorias, lang, t) + tesoro(destacado, t) + categorias.map((cat) => lugar(cat, lang, t)).join("");
}

// Una foto que no carga deja el marco con su fondo de respaldo.
document.addEventListener(
  "error",
  (event) => {
    const marco = event.target instanceof HTMLImageElement ? event.target.closest(".foto") : null;
    if (marco) {
      marco.classList.add("sin-foto");
      event.target.remove();
    }
  },
  true,
);

prepararLibro();
prepararViaje();
arrancar({ tema: TEMA, render });
