// Piezas comunes de los dos videos verticales (explicativo y redes): marco de dispositivo, pastilla de
// quién habla, pase entre actores, títulos por palabra y festejo. Todo es texto y números: nada acá
// toca disco ni el navegador, para poder probarlo.
import { redondear } from "./camara.mjs";

export const ACTORES = {
  cliente: { nombre: "Cliente", icono: "📱", color: "#d97706", texto: "#241d16", dispositivo: "celular" },
  local: { nombre: "Tu local", icono: "🏪", color: "#047857", texto: "#f0f2ee", dispositivo: "tableta" },
  repartidor: { nombre: "Repartidor", icono: "🛵", color: "#2563eb", texto: "#f0f2ee", dispositivo: "celular" },
};

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------------------------------------------------------------------------------------------
// Marco de dispositivo

const BISEL = { celular: 20, tableta: 26 };

/**
 * Medidas de un dispositivo. Celular: se da el alto de la pantalla (muestra la grabación entera); tableta:
 * el ancho, y `ventana` es el trozo de la grabación que muestra ({ fw, fh }, por defecto la grabación entera).
 * `k` = píxeles de lienzo por píxel de grabación.
 */
export function geometriaDispositivo(tipo, medida, { sw, sh }, ventana = { fw: sw, fh: sh }) {
  const bisel = BISEL[tipo];
  const pantalla = tipo === "celular" ? { w: Math.round((medida * sw) / sh), h: medida } : { w: medida, h: Math.round((medida * ventana.fh) / ventana.fw) };
  const k = pantalla.w / (tipo === "celular" ? sw : ventana.fw);
  return { tipo, bisel, pantalla, k, ancho: pantalla.w + bisel * 2, alto: pantalla.h + bisel * 2, sw, sh, ventana };
}

/** Ventana de la cámara: lo que muestra la pantalla. El encuadre nunca deja el foco fuera de ella. */
export const marcoCamara = (g) => ({ fw: g.ventana.fw, fh: g.ventana.fh, sw: g.sw, sh: g.sh });

/**
 * HTML de un dispositivo con su pantalla. `videos` va dentro de la grabación (en `cam`, que mueve la cámara).
 * `izq`/`arriba`: dónde queda su esquina en el lienzo; después se anima con transformaciones.
 */
export function dispositivoHtml({ id, pantalla, geo, izq, arriba, camaras }) {
  const radioMarco = geo.tipo === "celular" ? 64 : 46;
  const radioPantalla = geo.tipo === "celular" ? 46 : 22;
  const decoracion =
    geo.tipo === "celular"
      ? `<div class="isla" style="width:${Math.round(geo.pantalla.w * 0.24)}px;left:${Math.round((geo.ancho - geo.pantalla.w * 0.24) / 2)}px;top:${geo.bisel + 12}px"></div>`
      : `<div class="camara-tb" style="left:${Math.round(geo.ancho / 2 - 5)}px"></div>`;
  return `<div class="disp ${geo.tipo}" id="disp-${id}" data-pantalla="${pantalla}" style="left:${izq}px;top:${arriba}px;width:${geo.ancho}px;height:${geo.alto}px">
        <div class="marco" style="width:${geo.ancho}px;height:${geo.alto}px;border-radius:${radioMarco}px"></div>
        <div class="pantalla" style="left:${geo.bisel}px;top:${geo.bisel}px;width:${geo.pantalla.w}px;height:${geo.pantalla.h}px;border-radius:${radioPantalla}px">
          <div class="pane" id="pane-${id}" style="width:${geo.sw}px;height:${geo.sh}px">
            ${camaras}
          </div>
        </div>
        ${decoracion}
      </div>`;
}

/** Una cámara (que se mueve sola) con su grabación adentro. */
export const camaraHtml = (id, geo, video) => `<div class="cam" id="cam-${id}" style="width:${geo.sw}px;height:${geo.sh}px">${video}</div>`;

// ---------------------------------------------------------------------------------------------
// Pastilla de quién habla

/** Una variante de la pastilla por cada combinación de actores que aparece. `actores`: ["cliente"] o ["cliente","local"]. */
export const claveActores = (actores) => actores.join("+");

export function pastillasHtml(claves, top) {
  return [...new Set(claves)]
    .map((clave) => {
      const chips = clave
        .split("+")
        .map((a) => `<span class="chip" style="background:${ACTORES[a].color};color:${ACTORES[a].texto}"><i>${ACTORES[a].icono}</i>${escapar(ACTORES[a].nombre)}</span>`)
        .join('<span class="flecha-chip">→</span>');
      return `<div class="pastilla" id="pastilla-${clave.replace("+", "-")}" style="top:${top}px">${chips}</div>`;
    })
    .join("\n      ");
}
export const idPastilla = (clave) => `#pastilla-${clave.replace("+", "-")}`;

// ---------------------------------------------------------------------------------------------
// Títulos por palabra

/** Palabras sueltas, para que el cartel aparezca entero y no letra por letra. */
export const palabrasHtml = (texto) =>
  texto
    .split(" ")
    .map((w) => `<span class="w">${escapar(w)}</span>`)
    .join(" ");

/** Cuánto tarda en estar entero un cartel de `n` palabras: nunca más de 0,3 s. */
export const TOPE_CARTEL = 0.3;
export function tiemposCartel(n) {
  const dur = 0.15;
  const escalonado = n > 1 ? redondear(Math.min(0.05, (TOPE_CARTEL - dur) / (n - 1) - 0.001), 3) : 0;
  return { dur, escalonado, total: redondear(dur + escalonado * (n - 1)) };
}

// ---------------------------------------------------------------------------------------------
// Pase entre actores y festejo

export const DUR_PASE = 0.5;
const ESTELA = 420; // largo de la estela y alto de la ficha, en px (ver .estela y .ficha en marca.css)
const FICHA = 120;

/** HTML del pedido que viaja de un dispositivo al otro (una ficha con su estela, del color de quien recibe). */
export const viajeHtml = (id, actor, y) =>
  `<div class="viaje" id="viaje-${id}" style="top:${y}px"><div class="estela" style="background:linear-gradient(90deg, transparent, ${ACTORES[actor].color})"></div><div class="ficha" style="background:${ACTORES[actor].color};color:${ACTORES[actor].texto}">🧾</div></div>`;

/** Confeti sutil con posiciones fijas (sin azar en el render). */
function armarConfeti(n = 26, ancho = 1080) {
  const colores = ["#d97706", "#047857", "#f0f2ee", "#fbbf24", "#2563eb"];
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return semilla / 2147483647;
  };
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(azar() * ancho),
    y: Math.round(azar() * 160),
    w: 12 + Math.round(azar() * 10),
    h: 18 + Math.round(azar() * 14),
    giro: Math.round((azar() - 0.5) * 720),
    caida: 700 + Math.round(azar() * 800),
    deriva: Math.round((azar() - 0.5) * 160),
    demora: redondear(azar() * 0.35, 2),
    color: colores[i % colores.length],
  }));
}

const CONFETI = armarConfeti(); // el HTML y el guion usan las mismas piezas

export function festejoHtml(id, { checkX, checkY }) {
  const piezas = CONFETI
    .map((c, i) => `<i class="pieza" id="pieza-${id}-${i}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${c.color}"></i>`)
    .join("");
  return `<div class="festejo" id="festejo-${id}">${piezas}<div class="check" id="check-${id}" style="left:${checkX}px;top:${checkY}px"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M13 27 L22 36 L40 16" /></svg></div></div>`;
}

/**
 * Guion del festejo: el check se dibuja y el confeti cae una sola vez.
 * `hasta` (opcional): segundo en que todo se apaga; hace falta cuando el festejo no vive dentro de una escena que se apaga sola.
 */
export function guionFestejo(id, t, hasta = null) {
  const g = [];
  const tw = (s, tt, d, de, a, e = "power2.out", extra = {}) => g.push({ s, t: redondear(tt), d: redondear(d), de, a, e, ...extra });
  const set = (s, tt, a) => g.push({ s, t: redondear(tt), a });
  set(`#festejo-${id}`, 0, { opacity: 0 });
  set(`#check-${id}`, 0, { opacity: 0, scale: 0.4 });
  set(`#check-${id} path`, 0, { strokeDashoffset: 60 });
  set(`#festejo-${id}`, Math.max(t - 0.01, 0.001), { opacity: 1 });
  tw(`#check-${id}`, t, 0.35, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1 }, "back.out(2.4)");
  tw(`#check-${id} path`, t + 0.12, 0.35, { strokeDashoffset: 60 }, { strokeDashoffset: 0 }, "power2.out");
  CONFETI.forEach((c, i) => {
    const s = `#pieza-${id}-${i}`;
    set(s, 0, { opacity: 0, y: 0, x: 0, rotation: 0 });
    tw(s, t + c.demora, 0.12, { opacity: 0 }, { opacity: 0.9 }, "none");
    tw(s, t + c.demora, 1.7, { y: 0, x: 0, rotation: 0 }, { y: c.caida, x: c.deriva, rotation: c.giro }, "power1.in");
    tw(s, t + c.demora + 1.1, 0.6, { opacity: 0.9 }, { opacity: 0 }, "power1.in");
  });
  if (hasta != null) tw(`#festejo-${id}`, hasta - 0.3, 0.3, { opacity: 1 }, { opacity: 0 }, "power1.in");
  return g;
}

/**
 * Guion del pase entre dos actores: el que sale se va hacia la izquierda, el pedido cruza y el que llega
 * entra desde la derecha. Dura DUR_PASE y arranca `DUR_PASE / 2` antes del corte (la grabación que sale
 * sigue en pantalla hasta el corte; la que entra empieza con él).
 */
export function guionPase({ saliente, entrante, viaje, t, desplazamiento = 330, ancho = 1080 }) {
  const g = [];
  const tw = (s, tt, d, de, a, e = "power2.out") => g.push({ s, t: redondear(tt), d: redondear(d), de, a, e });
  const set = (s, tt, a) => g.push({ s, t: redondear(tt), a });
  const mitad = DUR_PASE / 2;
  tw(saliente, t - mitad, mitad, { x: 0, opacity: 1, scale: 1 }, { x: -desplazamiento, opacity: 0, scale: 0.92 }, "power2.in");
  set(viaje, 0, { opacity: 0, x: -ESTELA - FICHA });
  tw(viaje, t - mitad, 0.05, { opacity: 0 }, { opacity: 1 }, "none");
  tw(viaje, t - mitad, DUR_PASE, { x: -ESTELA - FICHA }, { x: ancho - ESTELA + FICHA }, "power2.inOut");
  tw(viaje, t + mitad - 0.05, 0.05, { opacity: 1 }, { opacity: 0 }, "none");
  tw(entrante, t, mitad + 0.05, { x: desplazamiento, opacity: 0, scale: 0.92 }, { x: 0, opacity: 1, scale: 1 }, "power3.out");
  return g;
}
