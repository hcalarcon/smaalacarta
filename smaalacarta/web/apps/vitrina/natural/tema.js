// Tema Natural (WEB-VITRINA-16): la cordillera y los lagos de San Martín de los Andes. Tres capas de
// montañas con parallax y un cielo que arranca en el momento real del día y pasa a la noche a medida que
// se baja por la carta (con movimiento reducido el cielo queda quieto, en el momento real del día). Las categorías son senderos y los productos, postales. Sin librerías. El HTML de
// cada pieza se arma en `piezas.js`, donde todo dato del negocio pasa por `escapeHtml`.

import { arrancar } from "../lib/arranque.js";
import { marcarSeccionActual } from "../lib/navegacion.js";
import { idiomasHtml, temaPorId } from "../lib/vitrina.js";
import { faseInicial, paleta, posicion } from "./cielo.js";
import { enlaceSendero, imperdible, sendero, textos } from "./piezas.js";

const TEMA = temaPorId("natural");

const $ = (id) => document.getElementById(id);
const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const ahora = new Date();
const FASE = faseInicial(ahora.getHours() + ahora.getMinutes() / 60);

// ---- Cielo y parallax: se recalculan con el scroll, una vez por cuadro ----
let pendiente = false;
let alto = 0;

// Lo que se puede scrollear: se mide al pintar y al cambiar el tamaño, no en cada cuadro.
function medir() {
  alto = document.documentElement.scrollHeight - innerHeight;
}

function pintarCielo() {
  pendiente = false;
  const paisaje = $("paisaje");
  const progreso = alto > 0 ? scrollY / alto : 0;
  const quieto = calmo();
  const c = paleta(quieto ? FASE : posicion(FASE, progreso));

  const estilo = paisaje.style;
  estilo.setProperty("--c1", c.cielo1);
  estilo.setProperty("--c2", c.cielo2);
  estilo.setProperty("--lejos", c.lejos);
  estilo.setProperty("--media", c.media);
  estilo.setProperty("--cerca", c.cerca);
  estilo.setProperty("--astro", c.astro);
  estilo.setProperty("--estrellas", c.estrellas.toFixed(2));
  estilo.setProperty("--p-lejos", `${quieto ? 0 : Math.min(60, scrollY * 0.03).toFixed(1)}px`);
  estilo.setProperty("--p-media", `${quieto ? 0 : Math.min(110, scrollY * 0.08).toFixed(1)}px`);
  estilo.setProperty("--p-cerca", `${quieto ? 0 : Math.min(170, scrollY * 0.16).toFixed(1)}px`);

  const astro = $("astro");
  astro.style.left = `${c.astroX.toFixed(1)}%`;
  astro.style.top = `${c.astroY.toFixed(1)}%`;
  astro.style.opacity = c.astroOpacidad.toFixed(2);
  astro.classList.toggle("luna", c.luna);
}

function pedirCuadro() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(pintarCielo);
}

// ---- Pintado ----
let senderoActual = null;

function render({ lang, secciones }) {
  const t = textos(lang);
  const { categorias, destacado } = secciones;

  const lugar = document.querySelector("[data-idiomas-lugar]");
  if (lugar && !lugar.firstElementChild) lugar.innerHTML = idiomasHtml(lang);

  $("senderos").innerHTML = categorias.map((cat, i) => enlaceSendero(cat, i + 1)).join("");
  $("contenido").innerHTML = imperdible(destacado, t) + categorias.map((cat, i) => sendero(cat, i + 1, t)).join("");

  senderoActual?.disconnect();
  senderoActual = marcarSeccionActual({ secciones: ".sendero", links: "#senderos a" });
  medir();
  pintarCielo();
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

medir();
pintarCielo();
addEventListener("scroll", pedirCuadro, { passive: true });
addEventListener("resize", () => {
  medir();
  pedirCuadro();
});
arrancar({ tema: TEMA, render });
