// Edición para redes (9:16, 30 a 35 s): una idea por vez, en un orden fijo (gancho, el cliente elige,
// confirma, te suena, aceptás, el repartidor, listo, seguimiento, entregado, cierre). Cada idea dura de
// 1,5 a 2,5 s y adentro lleva cortes rápidos y zooms de golpe; entre ideas de distinto actor va el pase.
// Misma regla que los explicativos: nada se redibuja, solo se recorta, se enmarca y se mueve la grabación real.
import { planearCamara, redondear } from "./camara.mjs";
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
import { escapar, focosDelTramo, focosPorPantalla, inicioDeFuente, saltoDeFuente } from "./edicion.mjs";

export const LIENZO_REDES = { w: 1080, h: 1920 };
export const GRILLA = 0.5;
export const IDEA = { min: 1.5, max: 2.5 };

/** Zonas fijas (px). Arriba y abajo quedan libres para la interfaz de Reels y TikTok. */
export const ZONAS_REDES = {
  pastilla: { top: 96 },
  titulo: { top: 222, alto: 210 },
  area: { top: 452, alto: 1250 },
};
const CELULAR = 1200;
const TABLETA = 860;
const VENTANA_LOCAL = { fw: 1200, fh: 1600 }; // trozo de la grabación del local que muestra, de a una idea (3:4)
const TABLETA_PARTIDA = 860; // en la pantalla partida muestra la grabación entera (16:10)
const CELULAR_PARTIDO = 600;
const MARGEN = 0.76; // 12 % de margen por lado alrededor del foco

/** Dispositivos de una idea: uno solo centrado, o la tableta arriba y el celular abajo en la pantalla partida. */
export function disposicionRedes(idea, fuentes) {
  const { top, alto } = ZONAS_REDES.area;
  const centrar = (geo, arriba) => ({ geo, izq: Math.round((1080 - geo.ancho) / 2), arriba: Math.round(arriba) });
  if (!idea.split) {
    return idea.paneles.map((pn) => {
      const tipo = ACTORES[pn.pantalla].dispositivo;
      const geo = tipo === "celular" ? geometriaDispositivo(tipo, CELULAR, fuentes[pn.pantalla]) : geometriaDispositivo(tipo, TABLETA, fuentes[pn.pantalla], VENTANA_LOCAL);
      return centrar(geo, top + (alto - geo.alto) / 2);
    });
  }
  const tableta = geometriaDispositivo("tableta", TABLETA_PARTIDA, fuentes.local);
  const celular = geometriaDispositivo("celular", CELULAR_PARTIDO, fuentes.cliente);
  const hueco = (alto - tableta.alto - celular.alto) / 2;
  const colocados = { local: centrar(tableta, top), cliente: centrar(celular, top + tableta.alto + hueco) };
  return idea.paneles.map((pn) => colocados[pn.pantalla]);
}

export function armarRedes(plan, pasosJson, fuentes) {
  const porId = new Map(pasosJson.pasos.map((p) => [p.id, p]));
  const focos = focosPorPantalla(pasosJson);
  const enGrilla = (v) => Math.abs(v / GRILLA - Math.round(v / GRILLA)) < 1e-6;
  const ideas = [];
  let reloj = 0;
  plan.redes.ideas.forEach((def, i) => {
    if (!enGrilla(def.dur)) throw new Error(`La idea «${def.id}» dura ${def.dur} s y no cae en la grilla de ${GRILLA} s.`);
    if (def.dur < IDEA.min || def.dur > IDEA.max) throw new Error(`La idea «${def.id}» dura ${def.dur} s: cada idea va de ${String(IDEA.min).replace(".", ",")} a ${String(IDEA.max).replace(".", ",")} s.`);
    if (def.split) {
      const pantallas = def.paneles.map((pn) => pn.pantalla).sort().join("+");
      if (pantallas !== "cliente+local") throw new Error(`La idea «${def.id}» es una pantalla partida y necesita un panel del cliente y uno del local.`);
      if (!(def.llegada >= 0.5 && def.llegada <= def.dur)) throw new Error(`La idea «${def.id}» necesita una llegada entre 0,5 s y ${def.dur} s: el pedido tarda 0,5 s en subir.`);
    } else if (def.llegada != null) throw new Error(`La idea «${def.id}» trae llegada y no es una pantalla partida.`);
    const esqueleto = { split: Boolean(def.split), paneles: def.paneles };
    const lugares = disposicionRedes(esqueleto, fuentes);
    const paneles = def.paneles.map((pn, j) => {
      let inicio = 0;
      const cortes = pn.cortes.map((c) => {
        const velocidad = c.velocidad ?? 1;
        if (!enGrilla(c.dur)) throw new Error(`El corte de «${def.id}» dura ${c.dur} s y no cae en la grilla de ${GRILLA} s.`);
        const desde = inicioDeFuente(porId, c.paso, pn.pantalla, c.desde ?? 0);
        const salto = saltoDeFuente(porId, c.paso, pn.pantalla, c.salto);
        const largo = redondear(c.dur * velocidad + (salto ? salto.hasta - salto.desde : 0));
        const focosCorte = c.focos ?? (c.rect ? [{ t: 0.1, rect: c.rect }] : focosDelTramo(focos[pn.pantalla], desde, c.dur, velocidad, salto));
        const corte = { inicio: redondear(inicio), dur: c.dur, velocidad, fuente: { desde, largo, ...(salto ? { salto } : {}) }, focos: focosCorte };
        inicio += c.dur;
        return corte;
      });
      if (Math.abs(inicio - def.dur) > 1e-6) throw new Error(`Los cortes de ${pn.pantalla} en «${def.id}» suman ${inicio} s y la idea dura ${def.dur} s.`);
      return { pantalla: pn.pantalla, ...lugares[j], cortes };
    });
    const actores = def.paneles.map((pn) => pn.pantalla);
    ideas.push({
      id: def.id,
      indice: i,
      inicio: redondear(reloj),
      dur: def.dur,
      titulo: def.titulo,
      split: Boolean(def.split),
      llegada: def.llegada ?? null,
      celebra: def.celebra ?? null,
      actores,
      clave: claveActores(def.split ? ["cliente", "local"] : actores),
      paneles,
    });
    reloj += def.dur;
  });
  const cierre = { inicio: redondear(reloj), dur: plan.redes.cierre.dur };
  const cortes = ideas.flatMap((e) => [...new Set(e.paneles.flatMap((pn) => pn.cortes.map((c) => redondear(e.inicio + c.inicio))))]);
  return { ideas, cierre, duracion: redondear(cierre.inicio + cierre.dur), cortes: [...new Set([...cortes, cierre.inicio])].sort((a, b) => a - b) };
}

/** Pases: cada vez que la idea siguiente tiene otros actores, el pedido viaja de una a la otra. */
export function pasesRedes(timeline) {
  return timeline.ideas.map((e, i) => (i > 0 && timeline.ideas[i - 1].clave !== e.clave ? { hacia: e.actores.at(-1) } : null));
}

export function escenasHtml(timeline) {
  return timeline.ideas
    .map((e, i) => {
      const dispositivos = e.paneles
        .map((pn, j) => {
          const videos = pn.cortes
            .map((c, n) => {
              const cam = `<video id="v-${i}-${j}-${n}" class="clip" src="media/r-${i}-${j}-${n}.mp4" muted playsinline data-start="${redondear(e.inicio + c.inicio)}" data-duration="${c.dur}" data-track-index="${j}" style="left:0;top:0;width:${pn.geo.sw}px;height:${pn.geo.sh}px"></video>`;
              return camaraHtml(`${i}-${j}-${n}`, pn.geo, cam);
            })
            .join("");
          return dispositivoHtml({ id: `${i}-${j}`, pantalla: pn.pantalla, geo: pn.geo, izq: pn.izq, arriba: pn.arriba, camaras: videos });
        })
        .join("\n        ");
      const festejo = e.celebra != null ? festejoHtml(i, { checkX: 852, checkY: ZONAS_REDES.area.top + 20 }) : "";
      return `<div class="esc" id="esc-${i}" style="z-index:${i + 1}">
        ${dispositivos}
        ${festejo}
      </div>`;
    })
    .join("\n      ");
}

/** Pastillas de quién habla, títulos y viajes: viven fuera de las escenas, en sus zonas fijas. */
export function textosRedesHtml(timeline) {
  const titulos = timeline.ideas
    .map((e, i) => {
      const tamano = Math.min(92, Math.floor((980 * 1.9) / (e.titulo.length * 0.54)));
      return `<div class="titulo" id="titulo-${i}" style="top:${ZONAS_REDES.titulo.top}px;height:${ZONAS_REDES.titulo.alto}px"><div style="font-size:${tamano}px">${palabrasHtml(escapar(e.titulo))}</div></div>`;
    })
    .join("\n      ");
  const pastillas = pastillasHtml(timeline.ideas.map((e) => e.clave), ZONAS_REDES.pastilla.top);
  const centroY = ZONAS_REDES.area.top + ZONAS_REDES.area.alto / 2 - 60;
  const viajes = pasesRedes(timeline)
    .map((pase, i) => (pase ? viajeHtml(i, pase.hacia, centroY) : ""))
    .filter(Boolean)
    .join("\n      ");
  const partidos = timeline.ideas
    .filter((e) => e.split)
    .map((e) => {
      const color = ACTORES.local.color;
      return `<div class="viaje-v" id="viajev-${e.indice}"><div class="ficha" style="background:${color};color:${ACTORES.local.texto}">🧾</div><div class="estela-v" style="background:linear-gradient(0deg, transparent, ${color})"></div></div>`;
    })
    .join("\n      ");
  return { TITULOS: titulos, PASTILLAS: pastillas, VIAJES: `${viajes}\n      ${partidos}` };
}

const posCam = (p) => ({ x: p.x, y: p.y, scale: p.s });

export function guionRedes(plan, timeline) {
  const g = [];
  const tw = (s, t, d, de, a, e = "power2.out", extra = {}) => g.push({ s, t: redondear(t), d: redondear(d), de, a, e, ...extra });
  const set = (s, t, a) => g.push({ s, t: redondear(t), a });
  const { ideas, cierre } = timeline;
  const pases = pasesRedes(timeline);

  // Estado inicial.
  ideas.forEach((e, i) => {
    set(`#esc-${i}`, 0, { opacity: i === 0 ? 1 : 0, x: 0, scale: 1, transformOrigin: "50% 50%" });
    e.paneles.forEach((pn, j) => {
      set(`#pane-${i}-${j}`, 0, { x: 0, y: 0, scale: pn.geo.k, transformOrigin: "0% 0%" });
      set(`#disp-${i}-${j}`, 0, { x: 0, y: 0, scale: 1, opacity: 1, transformOrigin: "50% 50%" });
      pn.cortes.forEach((_, n) => set(`#cam-${i}-${j}-${n}`, 0, { x: 0, y: 0, scale: 1, transformOrigin: "0% 0%" }));
    });
    set(`#titulo-${i}`, 0, { opacity: 0 });
    set(`#titulo-${i} .w`, 0, { opacity: 0 });
    if (e.split) set(`#viajev-${i}`, 0, { opacity: 0, y: 0 });
  });
  for (const clave of new Set(ideas.map((e) => e.clave))) set(idPastilla(clave), 0, { opacity: 0, y: 0, scale: 1 });
  set("#cierre-redes .portada-int", 0, { opacity: 0 });

  ideas.forEach((e, i) => {
    const T = e.inicio;
    const fin = T + e.dur;
    const previa = i > 0 ? ideas[i - 1] : null;
    if (i > 0) set(`#esc-${i}`, T, { opacity: 1 });
    set(`#esc-${i}`, fin, { opacity: 0 });

    // Entrada: el primero entra de golpe con un zoom; entre actores distintos va el pase; con el mismo, un golpe de corte.
    if (i === 0) {
      tw(`#esc-0`, 0, 0.35, { scale: 1.3 }, { scale: 1 }, "expo.out");
      tw(idPastilla(e.clave), 0, 0.3, { opacity: 0, y: 18, scale: 0.85 }, { opacity: 1, y: 0, scale: 1 }, "back.out(2)");
    } else if (pases[i]) {
      g.push(...guionPase({ saliente: `#esc-${i - 1}`, entrante: `#esc-${i}`, viaje: `#viaje-${i}`, t: T }));
      tw(idPastilla(previa.clave), T - DUR_PASE / 2, 0.15, { opacity: 1, y: 0, scale: 1 }, { opacity: 0, y: -18, scale: 0.9 }, "power2.in");
      tw(idPastilla(e.clave), T - 0.05, 0.3, { opacity: 0, y: 18, scale: 0.85 }, { opacity: 1, y: 0, scale: 1 }, "back.out(2)");
    } else {
      tw(`#esc-${i}`, T, 0.2, { scale: 1.06 }, { scale: 1 }, "expo.out");
    }

    // Cada corte: cámara con zoom de golpe al foco, y un golpe de escala en cada corte nuevo de la misma idea.
    e.paneles.forEach((pn, j) => {
      const marco = marcoCamara(pn.geo);
      pn.cortes.forEach((c, n) => {
        const t0 = T + c.inicio;
        const plan1 = planearCamara({
          frame: marco,
          k: pn.geo.k,
          focos: c.focos,
          dur: c.dur,
          mov: 0.22,
          adelanto: 0.08,
          sostener: 0.5,
          hueco: 0.5,
          vuelve: false,
          llenar: MARGEN,
          escalaMax: 2.2,
          zoomMax: pn.pantalla === "local" ? 2.5 : 1.6, // los celulares ya llenan el cuadro: con más zoom se pierde el contexto
        });
        const ini = plan1.inicio;
        set(`#cam-${i}-${j}-${n}`, Math.max(t0, 0.001), posCam(ini));
        for (const m of plan1.movimientos) tw(`#cam-${i}-${j}-${n}`, t0 + m.t, m.d, posCam(m.de), posCam(m.a), "expo.out");
        if (n > 0) tw(`#disp-${i}-${j}`, t0, 0.18, { scale: 1.05 }, { scale: 1 }, "expo.out");
      });
    });

    // Pantalla partida: el pedido sube del celular a la tableta y al llegar le suena al local.
    if (e.split && e.llegada != null) {
      const at = T + e.llegada;
      const cel = e.paneles.find((pn) => pn.pantalla === "cliente");
      const nb = e.paneles.find((pn) => pn.pantalla === "local");
      const desde = cel.arriba + cel.geo.alto / 2;
      const hasta = nb.arriba + nb.geo.alto / 2;
      const x = 540 - 60;
      set(`#viajev-${i}`, Math.max(at - 0.5, 0.001), { x });
      tw(`#viajev-${i}`, at - 0.5, 0.05, { opacity: 0 }, { opacity: 1 }, "none");
      tw(`#viajev-${i}`, at - 0.5, 0.5, { y: desde }, { y: hasta - 60 }, "power2.inOut");
      tw(`#viajev-${i}`, at - 0.05, 0.05, { opacity: 1 }, { opacity: 0 }, "none");
      const c = `#disp-${i}-${e.paneles.indexOf(nb)}`;
      tw(c, at, 0.05, { x: 0 }, { x: 12 }, "none");
      tw(c, at + 0.05, 0.05, { x: 12 }, { x: -12 }, "none");
      tw(c, at + 0.1, 0.05, { x: -12 }, { x: 7 }, "none");
      tw(c, at + 0.15, 0.1, { x: 7 }, { x: 0 }, "power2.out");
    }

    // Título entero: por palabra, en menos de 0,3 s, siempre en la misma zona.
    const palabras = e.titulo.split(" ").length;
    const { dur, escalonado } = tiemposCartel(palabras);
    set(`#titulo-${i}`, Math.max(T, 0.001), { opacity: 1 });
    tw(`#titulo-${i} .w`, Math.max(T + 0.05, 0.05), dur, { opacity: 0, y: 40, scale: 0.8 }, { opacity: 1, y: 0, scale: 1 }, "back.out(2.2)", escalonado ? { escalonado } : {});
    tw(`#titulo-${i}`, fin - 0.12, 0.1, { opacity: 1 }, { opacity: 0 }, "power1.in");

    if (e.celebra != null) g.push(...guionFestejo(i, T + e.celebra));
  });

  // Cierre.
  set("#cierre-redes .portada-int", cierre.inicio, { opacity: 1 });
  tw("#cierre-redes .portada-int img", cierre.inicio, 0.5, { scale: 0.6, rotation: -8 }, { scale: 1, rotation: 0 }, "back.out(2)");
  tw("#cierre-redes h1", cierre.inicio + 0.12, 0.35, { opacity: 0, y: 40 }, { opacity: 1, y: 0 }, "power3.out");
  tw("#cierre-redes .url", cierre.inicio + 0.3, 0.35, { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1 }, "back.out(1.8)");
  return g;
}
