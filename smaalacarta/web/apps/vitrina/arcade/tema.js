// Tema Arcade (WEB-VITRINA-13): la carta como una máquina de videojuegos. Entra por una pantalla
// "INSERT COIN"; las categorías son mundos y el destacado, el ítem legendario. Sin librerías: CSS,
// IntersectionObserver y WebAudio (el sonido arranca apagado, WEB-VITRINA-10). El HTML de cada pieza
// se arma en `piezas.js`, donde todo dato del negocio pasa por `escapeHtml`.

import { arrancar } from "../lib/arranque.js";
import { crearSonido } from "../lib/sonido.js";
import { idiomasHtml, temaPorId } from "../lib/vitrina.js";
import { boss, enlaceMundo, mundo, textos } from "./piezas.js";

const TEMA = temaPorId("arcade");
const PUNTAJE_MAXIMO = 999990;

const $ = (id) => document.getElementById(id);
// Se consulta cada vez: la persona puede activar "reducir movimiento" con la página abierta.
const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Sonido: apagado hasta que la persona lo prende ----
const sonido = crearSonido({
  crearAudio: () => new (window.AudioContext || window.webkitAudioContext)(),
});
const sonidoMoneda = () => sonido.sonar([[988, 0, 0.09], [1319, 0.09, 0.4]]);
const sonidoSeleccion = () => sonido.sonar([[660, 0, 0.06]]);
const sonidoInicio = () => sonido.sonar([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.3]]);

function prepararSonido() {
  const botones = document.querySelectorAll(".sonido");
  botones.forEach((boton) => {
    boton.addEventListener("click", () => {
      const prendido = sonido.alternar();
      botones.forEach((otro) => {
        otro.setAttribute("aria-pressed", String(prendido));
        otro.textContent = prendido ? "SND ON" : "SND OFF";
      });
      sonidoSeleccion();
    });
  });
}

// ---- Pantalla de entrada: INSERT COIN → PLAYER 1 READY → carga ----
function prepararPuerta() {
  const puerta = $("puerta");
  const bloqueados = [document.querySelector(".hud"), $("menu")];
  bloqueados.forEach((el) => el.setAttribute("inert", ""));
  $("empezar").focus({ preventScroll: true });
  let empezo = false;
  let abierta = false;

  const abrir = () => {
    if (abierta) return;
    abierta = true;
    puerta.remove();
    bloqueados.forEach((el) => el.removeAttribute("inert"));
    const titulo = $("titulo");
    titulo.tabIndex = -1;
    titulo.focus({ preventScroll: true });
  };

  $("empezar").addEventListener("click", () => {
    if (empezo) return;
    empezo = true;
    sonidoMoneda();
    if (calmo()) return abrir();

    puerta.classList.add("cargando");
    $("empezar").hidden = true;
    puerta.querySelector(".sonido").hidden = true;
    $("listo").hidden = false;
    setTimeout(() => {
      $("barra-carga").hidden = false;
      sonidoInicio();
    }, 900);
    setTimeout(() => {
      puerta.classList.add("fuera");
      setTimeout(abrir, 350);
    }, 2300);
  });

  // Si el menú no carga, la puerta no puede dejar a nadie sin ver el aviso de error.
  document.addEventListener("vitrina:error", abrir);
}

// ---- Puntaje que sube mientras se scrollea ----
function prepararPuntaje() {
  const salida = $("puntaje");
  let pendiente = false;

  const actualizar = () => {
    pendiente = false;
    const alto = document.documentElement.scrollHeight - innerHeight;
    const avance = alto > 0 ? Math.min(1, Math.max(0, scrollY / alto)) : 0;
    salida.textContent = String(Math.round((avance * PUNTAJE_MAXIMO) / 10) * 10).padStart(6, "0");
  };

  addEventListener(
    "scroll",
    () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(actualizar);
    },
    { passive: true },
  );
}

// ---- Mundo actual en el menú de niveles y entrada de las tarjetas ----
let observador = null;
let apariciones = null;

function centrar(link) {
  const barra = link.parentElement;
  const dentro = link.getBoundingClientRect();
  const fuera = barra.getBoundingClientRect();
  const izquierda = barra.scrollLeft + (dentro.left - fuera.left) - (fuera.width - dentro.width) / 2;
  barra.scrollTo?.({ left: izquierda, behavior: calmo() ? "auto" : "smooth" });
}

function observar() {
  observador?.disconnect();
  apariciones?.disconnect();
  document.documentElement.classList.remove("anima");
  if (!("IntersectionObserver" in window)) return;

  observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        document.querySelectorAll("#mundos a").forEach((link) => {
          if (link.hash === `#${entrada.target.id}`) {
            link.setAttribute("aria-current", "true");
            centrar(link);
          } else link.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-30% 0px -60% 0px" },
  );
  document.querySelectorAll(".mundo").forEach((seccion) => observador.observe(seccion));

  if (calmo()) return;
  document.documentElement.classList.add("anima");
  apariciones = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add("ya");
        apariciones.unobserve(entrada.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll(".prod, .boss").forEach((tarjeta) => apariciones.observe(tarjeta));
}

function render({ lang, secciones }) {
  const t = textos(lang);
  const { categorias, destacado } = secciones;

  $("toca").textContent = t.toca;
  const lugar = document.querySelector("[data-idiomas-lugar]");
  if (lugar && !lugar.firstElementChild) lugar.innerHTML = idiomasHtml(lang);

  $("mundos").innerHTML = categorias.map((cat, i) => enlaceMundo(cat, i + 1)).join("");
  $("contenido").innerHTML = boss(destacado, t) + categorias.map((cat, i) => mundo(cat, i + 1, t)).join("");

  observar();
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

document.addEventListener("click", (event) => {
  if (event.target.closest?.("#mundos a")) sonidoSeleccion();
});

prepararSonido();
prepararPuerta();
prepararPuntaje();
arrancar({ tema: TEMA, render });
