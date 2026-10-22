// Tema Floral (WEB-VITRINA-14): una carta de casamiento. Ramas y flores que se dibujan solas (CSS),
// pétalos que caen, un separador floral distinto por categoría que se abre al llegar y el destacado
// como sugerencia del chef con sello de lacre. Sin librerías. El HTML de cada pieza se arma en
// `piezas.js`, donde todo dato del negocio pasa por `escapeHtml`.

import { arrancar } from "../lib/arranque.js";
import { marcarSeccionActual } from "../lib/navegacion.js";
import { idiomasHtml, temaPorId } from "../lib/vitrina.js";
import { chef, enlaceCategoria, seccion, textos } from "./piezas.js";

const TEMA = temaPorId("floral");
const COLORES_PETALO = ["#f3c9d0", "#e8aab5", "#fbe4e7", "#d9a3ab", "#f7d6c4"];

const $ = (id) => document.getElementById(id);
// Se lee al pintar: activar "reducir movimiento" con la página abierta vale desde la próxima carga.
const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Pétalos: unos pocos, una sola vez ----
function plantarPetalos() {
  const capa = $("petalos");
  if (calmo() || capa.childElementCount > 0) return;

  const cantidad = innerWidth < 600 ? 9 : 16;
  for (let i = 0; i < cantidad; i += 1) {
    const petalo = document.createElement("i");
    petalo.className = "petalo";
    petalo.style.cssText = [
      `--x:${Math.round(Math.random() * 100)}%`,
      `--s:${8 + Math.round(Math.random() * 8)}px`,
      `--t:${9 + Math.round(Math.random() * 9)}s`,
      `--d:${(Math.random() * -14).toFixed(1)}s`,
      `--vaiven:${Math.round(Math.random() * 160 - 80)}px`,
      `--c:${COLORES_PETALO[i % COLORES_PETALO.length]}`,
    ].join(";");
    capa.append(petalo);
  }
}

// ---- Flores que se abren y categoría actual ----
let abrir = null;
let actual = null;

function observar() {
  abrir?.disconnect();
  actual?.disconnect();
  document.documentElement.classList.remove("anima");
  if (!("IntersectionObserver" in window)) return;

  actual = marcarSeccionActual({ secciones: ".categoria", links: "#cats a" });

  if (calmo()) return;
  document.documentElement.classList.add("anima");
  abrir = new IntersectionObserver(
    (entradas, observador) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add(entrada.target.matches(".chef") ? "visto" : "abierta");
        observador.unobserve(entrada.target);
      });
    },
    { rootMargin: "0px 0px -15% 0px" },
  );
  document.querySelectorAll(".separador, .chef").forEach((flor) => abrir.observe(flor));
}

function render({ lang, secciones }) {
  const t = textos(lang);
  const { categorias, destacado } = secciones;

  $("subtitulo").textContent = t.casa;
  const lugar = document.querySelector("[data-idiomas-lugar]");
  if (lugar && !lugar.firstElementChild) lugar.innerHTML = idiomasHtml(lang);

  $("cats").innerHTML = categorias.map(enlaceCategoria).join("");
  $("contenido").innerHTML = chef(destacado, t) + categorias.map((cat, i) => seccion(cat, i, t)).join("");

  observar();
}

// Una foto que no carga deja el óvalo con su fondo de acuarela.
document.addEventListener(
  "error",
  (event) => {
    const marco = event.target instanceof HTMLImageElement ? event.target.closest(".oval") : null;
    if (marco) {
      marco.classList.add("sin-foto");
      event.target.remove();
    }
  },
  true,
);

plantarPetalos();
arrancar({ tema: TEMA, render });
