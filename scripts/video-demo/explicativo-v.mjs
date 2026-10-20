// Explicativo vertical (9:16): una pantalla por vez dentro de un marco de dispositivo, con la pastilla
// de quién habla fija arriba, un pase animado cuando la acción pasa de un actor a otro y los títulos
// en una zona propia, debajo del dispositivo. Los tramos (qué grabación y cuánto) salen de armarTomas.
import { planearCamara, redondear } from "./camara.mjs";
import { PANTALLAS, escapar } from "./edicion.mjs";
import {
  ACTORES,
  DUR_PASE,
  camaraHtml,
  claveActores,
  dispositivoHtml,
  festejoHtml,
  geometriaDispositivo,
  guionFestejo,
  guionPase,
  idPastilla,
  marcoCamara,
  palabrasHtml,
  pastillasHtml,
  tiemposCartel,
  viajeHtml,
} from "./dispositivos.mjs";

/** Zonas fijas del lienzo (px): nada del texto cae sobre la aplicación. */
export const ZONAS = {
  pastilla: { top: 46 },
  estados: { top: 172 },
  area: { top: 250, alto: 1300 },
  nota: { top: 1562 },
  titulo: { top: 1640, alto: 240 },
};
const CELULAR = 1250; // alto de la pantalla del celular
const TABLETA = 900; // ancho de la pantalla de la tableta (el local)
const VENTANA_LOCAL = { fw: 1200, fh: 1600 }; // trozo de la grabación del local que muestra, en vertical (3:4)
const MARGEN = 0.76; // el foco ocupa el 76 % de la ventana: 12 % de margen por lado
const ESCALA_MAX = { cliente: 2.4, repartidor: 2.4, local: 2.2 };
const ZOOM_MAX = { cliente: 2.6, repartidor: 2.6, local: 2.5 };

/** Dónde va cada dispositivo: todos centrados en la misma zona. */
export function dispositivosVertical(fuentes) {
  const out = {};
  for (const p of PANTALLAS) {
    const tipo = ACTORES[p].dispositivo;
    const geo = tipo === "celular" ? geometriaDispositivo(tipo, CELULAR, fuentes[p]) : geometriaDispositivo(tipo, TABLETA, fuentes[p], VENTANA_LOCAL);
    out[p] = { geo, izq: Math.round((1080 - geo.ancho) / 2), arriba: Math.round(ZONAS.area.top + (ZONAS.area.alto - geo.alto) / 2) };
  }
  return out;
}

/** Pases: un pedido que viaja cada vez que cambia el actor. */
export function pasesDe(tomas) {
  return tomas.map((t, i) => (i > 0 && tomas[i - 1].actor !== t.actor ? { desde: tomas[i - 1].actor, hacia: t.actor } : null));
}

export function panelesHtml(timeline, fuentes) {
  const disp = dispositivosVertical(fuentes);
  return PANTALLAS.map((p, pista) => {
    const videos = timeline.tomas
      .map((t, i) => (t.actor === p ? `<video id="v-${p}-${i}" class="clip" src="media/${p}-${i}.mp4" muted playsinline data-start="${t.inicio}" data-duration="${t.dur}" data-track-index="${pista}" style="left:0;top:0;width:${fuentes[p].sw}px;height:${fuentes[p].sh}px"></video>` : ""))
      .join("");
    const { geo, izq, arriba } = disp[p];
    return dispositivoHtml({ id: p, pantalla: p, geo, izq, arriba, camaras: camaraHtml(p, geo, videos) });
  }).join("\n      ");
}

export function textosVerticalHtml(plan, timeline, fuentes) {
  const subtitulos = timeline.tomas.map((t, i) => `<div class="sub" id="sub-${i}"><span>${palabrasHtml(escapar(t.subtitulo))}</span></div>`);
  const notas = timeline.tomas.map((t, i) => (t.nota ? `<div class="nota" id="nota-${i}"><span>${escapar(t.nota)}</span></div>` : "")).filter(Boolean);
  const estados = plan.estados.map((e, i) => `<div class="est" id="est-${i}">${escapar(e)}</div>`).join("");
  const pastillas = pastillasHtml(timeline.tomas.map((t) => claveActores([t.actor])), ZONAS.pastilla.top);
  const centroY = ZONAS.area.top + ZONAS.area.alto / 2 - 60;
  const viajes = pasesDe(timeline.tomas)
    .map((pase, i) => (pase ? viajeHtml(i, pase.hacia, centroY) : ""))
    .filter(Boolean)
    .join("\n      ");
  const festejos = timeline.tomas
    .map((t, i) => (t.celebra != null ? festejoHtml(i, { checkX: 846, checkY: 330 }) : ""))
    .filter(Boolean)
    .join("\n      ");
  return { subtitulos: subtitulos.join("\n      "), notas: notas.join("\n      "), estados, pastillas, viajes, festejos };
}

const ESTADO_PENDIENTE = { backgroundColor: "rgba(240,242,238,0.12)", color: "rgba(240,242,238,0.55)", scale: 1 };
const ESTADO_ACTUAL = { backgroundColor: "#d97706", color: "#241d16", scale: 1.06 };
const ESTADO_HECHO = { backgroundColor: "#047857", color: "#f0f2ee", scale: 1 };
const posCam = (p) => ({ x: p.x, y: p.y, scale: p.s });

export function guionVertical(plan, timeline, fuentes) {
  const g = [];
  const tw = (s, t, d, de, a, e = "power2.inOut", extra = {}) => g.push({ s, t: redondear(t), d: redondear(d), de, a, e, ...extra });
  const set = (s, t, a) => g.push({ s, t: redondear(t), a });
  const { tomas, intro, cierre } = timeline;
  const disp = dispositivosVertical(fuentes);
  const pases = pasesDe(tomas);
  const entra = Math.max(0, tomas[0].inicio - 0.4);
  const salida = cierre.inicio - 0.3;

  // Estado inicial de todo lo que se anima.
  for (const p of PANTALLAS) {
    set(`#disp-${p}`, 0, { opacity: 0, x: 0, y: 0, scale: 1, transformOrigin: "50% 50%" });
    set(`#pane-${p}`, 0, { x: 0, y: 0, scale: disp[p].geo.k, transformOrigin: "0% 0%" });
    set(`#cam-${p}`, 0, { x: 0, y: 0, scale: 1, transformOrigin: "0% 0%" });
  }
  for (const clave of new Set(tomas.map((t) => claveActores([t.actor])))) set(idPastilla(clave), 0, { opacity: 0, y: 0, scale: 1 });
  set("#estados", 0, { opacity: 0 });
  set("#marca", 0, { opacity: 0 });
  set("#ff", 0, { opacity: 0 });
  for (let i = 0; i < plan.estados.length; i++) set(`#est-${i}`, 0, ESTADO_PENDIENTE);
  tomas.forEach((t, i) => {
    set(`#sub-${i}`, 0, { opacity: 0 });
    set(`#sub-${i} .w`, 0, { opacity: 0 });
    if (t.nota) set(`#nota-${i}`, 0, { opacity: 0 });
  });

  // Intro (arranca con el logo ya visible) y cierre.
  set("#intro .portada-int", 0, { opacity: 1 });
  tw("#intro .portada-int img", 0, 0.7, { scale: 0.86 }, { scale: 1 }, "back.out(1.6)");
  tw("#intro h1", 0.25, 0.6, { opacity: 0, y: 26 }, { opacity: 1, y: 0 }, "power3.out");
  tw("#intro .portada-int", intro.dur - 0.45, 0.4, { opacity: 1 }, { opacity: 0 }, "power2.in");
  set("#cierre .portada-int", 0, { opacity: 0 });
  tw("#cierre .portada-int", cierre.inicio + 0.1, 0.6, { opacity: 0, y: 26 }, { opacity: 1, y: 0 }, "power3.out");
  tw("#marca", entra, 0.5, { opacity: 0 }, { opacity: 1 }, "power2.out");
  tw("#estados", entra, 0.5, { opacity: 0, y: -16 }, { opacity: 1, y: 0 }, "power2.out");

  const camPrevia = {};
  let estadoActual = -1;
  let ffVisible = false;

  tomas.forEach((t, i) => {
    const T = t.inicio;
    const p = t.actor;
    const clave = claveActores([p]);
    const previa = i > 0 ? tomas[i - 1].actor : null;

    // Quién habla: la pastilla cambia con una animación corta, y el pedido cruza de un dispositivo al otro.
    if (i === 0) {
      tw(`#disp-${p}`, entra, 0.45, { opacity: 0, y: 40 }, { opacity: 1, y: 0 }, "power3.out");
      tw(idPastilla(clave), entra, 0.35, { opacity: 0, y: 18, scale: 0.85 }, { opacity: 1, y: 0, scale: 1 }, "back.out(2)");
    } else if (pases[i]) {
      g.push(...guionPase({ saliente: `#disp-${previa}`, entrante: `#disp-${p}`, viaje: `#viaje-${i}`, t: T }));
      tw(idPastilla(claveActores([previa])), T - DUR_PASE / 2, 0.15, { opacity: 1, y: 0, scale: 1 }, { opacity: 0, y: -18, scale: 0.9 }, "power2.in");
      tw(idPastilla(clave), T - 0.05, 0.3, { opacity: 0, y: 18, scale: 0.85 }, { opacity: 1, y: 0, scale: 1 }, "back.out(2)");
    }

    // Cámara: va al foco antes del toque; el encuadre deja 12 % de margen y se aleja si el foco no entra.
    const marco = marcoCamara(disp[p].geo);
    const plan1 = planearCamara({
      frame: marco,
      k: disp[p].geo.k,
      focos: t.focos[p].map((f) => ({ t: f.t, rect: f.rect })),
      dur: t.dur,
      vuelve: !t.fijo,
      desde: previa === p ? camPrevia[p] : null,
      llenar: MARGEN,
      escalaMax: ESCALA_MAX[p],
      zoomMax: ZOOM_MAX[p],
    });
    const ini = plan1.inicio;
    const ant = camPrevia[p];
    if (!ant || ant.s !== ini.s || ant.x !== ini.x || ant.y !== ini.y) set(`#cam-${p}`, T, posCam(ini));
    let fin = ini;
    for (const m of plan1.movimientos) {
      tw(`#cam-${p}`, T + m.t, m.d, posCam(m.de), posCam(m.a), "power2.inOut");
      fin = m.a;
    }
    camPrevia[p] = fin;

    // Título entero: aparece por palabra en menos de 0,3 s y se queda hasta el final del tramo.
    const palabras = t.subtitulo.split(" ").length;
    const { dur, escalonado } = tiemposCartel(palabras);
    set(`#sub-${i}`, T + 0.08, { opacity: 1 });
    tw(`#sub-${i} .w`, T + 0.08, dur, { opacity: 0, y: 34, scale: 0.85 }, { opacity: 1, y: 0, scale: 1 }, "back.out(2)", escalonado ? { escalonado } : {});
    tw(`#sub-${i}`, T + t.dur - 0.2, 0.15, { opacity: 1 }, { opacity: 0 }, "power1.in");

    // Ícono de avance (sin «×N»): solo en los tramos acelerados.
    const acelerado = t.velocidad >= 1.5;
    if (acelerado !== ffVisible) {
      tw("#ff", T, 0.25, { opacity: ffVisible ? 1 : 0 }, { opacity: acelerado ? 1 : 0 }, "power2.out");
      ffVisible = acelerado;
    }

    // «unos minutos después».
    if (t.nota) {
      tw(`#nota-${i}`, T + 0.15, 0.3, { opacity: 0, y: -12, scale: 0.94 }, { opacity: 1, y: 0, scale: 1 }, "back.out(1.8)");
      tw(`#nota-${i}`, T + Math.min(t.dur - 0.3, 2.3), 0.3, { opacity: 1 }, { opacity: 0 }, "power1.in");
    }

    // Barra de estados: avanza cuando cambia el estado real.
    if (t.estado && t.estado.idx !== estadoActual) {
      const at = T + t.estado.en;
      for (let n = 0; n < plan.estados.length; n++) {
        const nuevo = n < t.estado.idx ? ESTADO_HECHO : n === t.estado.idx ? ESTADO_ACTUAL : ESTADO_PENDIENTE;
        const viejo = n < estadoActual ? ESTADO_HECHO : n === estadoActual ? ESTADO_ACTUAL : ESTADO_PENDIENTE;
        if (viejo !== nuevo) tw(`#est-${n}`, at, 0.4, viejo, nuevo, n === t.estado.idx ? "back.out(2)" : "power2.out");
      }
      estadoActual = t.estado.idx;
    }

    // Festejo por encima del seguimiento real en «Entregado».
    if (t.celebra != null) g.push(...guionFestejo(i, T + t.celebra, T + t.dur));
  });

  const ultimo = tomas.at(-1).actor;
  tw(`#disp-${ultimo}`, salida, 0.3, { opacity: 1 }, { opacity: 0 }, "power2.in");
  tw(idPastilla(claveActores([ultimo])), salida, 0.3, { opacity: 1 }, { opacity: 0 }, "power2.in");
  tw("#marca", salida, 0.3, { opacity: 1 }, { opacity: 0 }, "power2.in");
  tw("#estados", salida, 0.3, { opacity: 1 }, { opacity: 0 }, "power2.in");
  return g;
}
