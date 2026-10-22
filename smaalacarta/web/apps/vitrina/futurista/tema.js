// Tema Futurista (WEB-VITRINA-15): la carta como la interfaz de una nave. Al entrar, una línea de luz
// escanea la pantalla y una terminal escribe sola; las fichas de datos se inclinan en 3D con el dedo, el
// mouse, el giroscopio (donde el navegador lo da sin pedir permisos) y el scroll. Sin librerías. El HTML
// de cada pieza se arma en `piezas.js`, donde todo dato del negocio pasa por `escapeHtml`.

import { arrancar, idiomaInicial } from "../lib/arranque.js";
import { marcarSeccionActual } from "../lib/navegacion.js";
import { idiomasHtml, temaPorId } from "../lib/vitrina.js";
import { enlaceSector, lineasDeArranque, objetivo, sector, textos } from "./piezas.js";

const TEMA = temaPorId("futurista");
const MAX_GRADOS = 6;

const $ = (id) => document.getElementById(id);
const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const limitar = (valor) => Math.max(-MAX_GRADOS, Math.min(MAX_GRADOS, valor));

// ---- Terminal que se escribe sola (el CSS la retira a los 3.4 s aunque este código falle) ----
function escribirArranque(lang) {
  const arranque = document.querySelector(".arranque");
  const terminal = $("terminal");
  const texto = lineasDeArranque(lang).join("\n");
  // Con movimiento reducido el CSS no muestra el arranque: no hay nada que escribir.
  if (calmo()) return;

  let i = 0;
  const paso = () => {
    if (arranque.hidden) return;
    terminal.textContent = texto.slice(0, i);
    i += 1;
    if (i <= texto.length) setTimeout(paso, 28);
  };
  paso();

  // Un toque lo salta, y si el menú no carga se va para dejar ver el aviso.
  const saltar = () => {
    arranque.hidden = true;
  };
  arranque.addEventListener("click", saltar);
  document.addEventListener("vitrina:error", saltar);
}

// ---- Inclinación 3D: mouse en escritorio, giroscopio en celulares que no piden permiso y velocidad del scroll ----
let cuadro = false;
const inclinacion = { x: 0, y: 0, scroll: 0 };

function aplicar() {
  cuadro = false;
  const raiz = document.documentElement.style;
  raiz.setProperty("--tx", `${inclinacion.x.toFixed(2)}deg`);
  raiz.setProperty("--ty", `${inclinacion.y.toFixed(2)}deg`);
  raiz.setProperty("--sy", `${inclinacion.scroll.toFixed(2)}deg`);
}

function pedirCuadro() {
  if (cuadro) return;
  cuadro = true;
  requestAnimationFrame(aplicar);
}

function prepararInclinacion() {
  if (calmo()) return;

  addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse") return;
      inclinacion.x = limitar(((event.clientX / innerWidth) * 2 - 1) * MAX_GRADOS);
      inclinacion.y = limitar(((event.clientY / innerHeight) * 2 - 1) * MAX_GRADOS);
      pedirCuadro();
    },
    { passive: true },
  );

  // En iOS el giroscopio pide un permiso: ahí no se usa, y quedan el dedo y el scroll.
  const pideAutorizacion = typeof window.DeviceOrientationEvent?.requestPermission === "function";
  if ("DeviceOrientationEvent" in window && !pideAutorizacion) {
    addEventListener(
      "deviceorientation",
      (event) => {
        if (event.gamma === null || event.beta === null) return;
        inclinacion.x = limitar((event.gamma / 25) * MAX_GRADOS);
        inclinacion.y = limitar(((event.beta - 45) / 25) * MAX_GRADOS);
        pedirCuadro();
      },
      { passive: true },
    );
  }

  // Al scrollear las fichas se inclinan según la velocidad y vuelven a su lugar al frenar.
  let ultimo = scrollY;
  let frenar = null;
  addEventListener(
    "scroll",
    () => {
      inclinacion.scroll = limitar((scrollY - ultimo) * 0.25);
      ultimo = scrollY;
      pedirCuadro();
      clearTimeout(frenar);
      frenar = setTimeout(() => {
        inclinacion.scroll = 0;
        pedirCuadro();
      }, 140);
    },
    { passive: true },
  );
}

// ---- Pintado ----
let sectorActual = null;

function render({ lang, secciones }) {
  const t = textos(lang);
  const { categorias, destacado } = secciones;

  const lugar = document.querySelector("[data-idiomas-lugar]");
  if (lugar && !lugar.firstElementChild) lugar.innerHTML = idiomasHtml(lang);

  $("sectores").innerHTML = categorias.map((cat, i) => enlaceSector(cat, i + 1)).join("");
  $("contenido").innerHTML = objetivo(destacado, t) + categorias.map((cat, i) => sector(cat, i + 1, t)).join("");

  sectorActual?.disconnect();
  sectorActual = marcarSeccionActual({ secciones: ".sector", links: "#sectores a" });
}

// Una foto que no carga deja el marco con su fondo de respaldo.
document.addEventListener(
  "error",
  (event) => {
    const marco = event.target instanceof HTMLImageElement ? event.target.closest(".holo") : null;
    if (marco) {
      marco.classList.add("sin-foto");
      event.target.remove();
    }
  },
  true,
);

escribirArranque(idiomaInicial());
prepararInclinacion();
arrancar({ tema: TEMA, render });
