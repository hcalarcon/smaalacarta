// Arranque común de los temas: carga el menú, resuelve el idioma, pinta la barra fija y vuelve a pintar
// el tema cuando se cambia de idioma. Cada tema pone solo su `render`. Solo en el navegador.

import { normalizeLang, resolveLang } from "../../menu-app/lib/i18n.js";
import { cargarMenu } from "./datos.js";
import { barraHtml, buildSections, texto } from "./vitrina.js";

const CLAVE_IDIOMA = "sma-idioma";

export export function idiomaInicial() {
  let guardado = null;
  try {
    guardado = normalizeLang(localStorage.getItem(CLAVE_IDIOMA));
  } catch {
    // Sin almacenamiento (modo privado): se usa el idioma del celular.
  }
  // Un link con ?lang= manda sobre lo guardado, para poder compartir la vitrina en un idioma.
  return (
    normalizeLang(new URLSearchParams(location.search).get("lang")) ??
    guardado ??
    resolveLang({ navigatorLanguage: navigator.language })
  );
}

function barraNueva(tema, lang) {
  const caja = document.createElement("div");
  caja.innerHTML = barraHtml(tema, lang);
  return caja.firstElementChild;
}

// `render({ lang, secciones, config })` pinta el tema; se llama de nuevo al cambiar de idioma.
export async function arrancar({ tema, render }) {
  let lang = idiomaInicial();
  document.body.append(barraNueva(tema, lang));

  let datos;
  try {
    datos = await cargarMenu();
  } catch (err) {
    console.error("Vitrina: no se pudo cargar el menú:", err);
    const aviso = Object.assign(document.createElement("p"), {
      className: "vitrina-error",
      textContent: texto("cargando", lang),
    });
    document.querySelector("[data-menu]")?.replaceChildren(aviso);
    // Para que un tema con pantalla de entrada la abra y deje ver el aviso.
    document.dispatchEvent(new CustomEvent("vitrina:error"));
    return;
  }

  const pintar = () => {
    document.documentElement.lang = lang;
    document.querySelector("[data-barra]")?.replaceWith(barraNueva(tema, lang));
    render({ lang, secciones: buildSections(datos.menu, lang), config: datos.config });
    document.querySelectorAll("[data-idiomas] [data-lang]").forEach((boton) => {
      boton.setAttribute("aria-pressed", String(boton.dataset.lang === lang));
    });
  };

  document.addEventListener("click", (event) => {
    const boton = event.target.closest?.("[data-idiomas] [data-lang]");
    const nuevo = normalizeLang(boton?.dataset.lang);
    if (!nuevo || nuevo === lang) return;
    lang = nuevo;
    try {
      localStorage.setItem(CLAVE_IDIOMA, lang);
    } catch {
      // Sin almacenamiento: el idioma vale solo para esta visita.
    }
    pintar();
  });

  pintar();
}
