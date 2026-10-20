// Edición para redes (9:16, 20 a 25 s): cortes de 0,5 a 1,5 s sobre una grilla de 0,5 s, punch-in
// a los focos, celulares que entran inclinados y barridos con desenfoque. Misma idea que los
// explicativos: nada se redibuja, solo se recorta, se enmarca y se mueve la grabación real.
import { planearCamara, posicionCamara, redondear } from "./camara.mjs";
import { escapar, focosDelTramo, focosPorPantalla, inicioDeFuente, PANTALLAS, saltoDeFuente } from "./edicion.mjs";

export const LIENZO_REDES = { w: 1080, h: 1920 };
export const GRILLA = 0.5;
const SOLAPE = 0.25; // la escena que sale sigue debajo mientras entra la siguiente

const CAJAS = {
  completa: { x: 0, y: 0, w: 1080, h: 1920, r: 0, b: 0 },
  tarjeta: { x: 60, y: 250, w: 960, h: 1560, r: 56, b: 14 },
  arriba: { x: 0, y: 0, w: 1080, h: 950, r: 0, b: 0 },
  abajo: { x: 0, y: 970, w: 1080, h: 950, r: 0, b: 0 },
};

/** Ventana de una pantalla dentro de su caja: px de grabación (fw x fh) y píxeles por píxel (k). */
export function marcoRedes(pantalla, caja, { sw, sh }) {
  let box = CAJAS[caja];
  let k;
  if (pantalla === "local" && (caja === "completa" || caja === "tarjeta")) {
    // La grabación del local es apaisada: la ventana de 1120 px de ancho deja entero el aviso de pedido
    // y la caja se achica a ese alto, centrada (arriba y abajo queda el fondo de marca y el texto).
    k = box.w / 1120;
    const h = Math.round(sh * k);
    box = { ...box, h, y: box.y + Math.round((box.h - h) / 2) };
  } else {
    k = pantalla === "local" ? box.h / sh : box.w / sw;
  }
  const fw = Math.min(sw, Math.round(box.w / k));
  const fh = Math.min(sh, Math.round(box.h / k));
  return { box, k, fw, fh, sw, sh };
}

export function armarRedes(plan, pasosJson, fuentes) {
  const porId = new Map(pasosJson.pasos.map((p) => [p.id, p]));
  const focos = focosPorPantalla(pasosJson);
  const escenas = [];
  let reloj = 0;
  plan.redes.escenas.forEach((def, i) => {
    if (Math.abs(def.dur / GRILLA - Math.round(def.dur / GRILLA)) > 1e-6) throw new Error(`La escena «${def.id}» dura ${def.dur} s y no cae en la grilla de ${GRILLA} s.`);
    const paneles = def.paneles.map((pn) => {
      const velocidad = pn.velocidad ?? 1;
      const entrada = pn.entrada ?? "golpe";
      const caja = entrada === "inclinado" ? "tarjeta" : pn.caja;
      const marco = marcoRedes(pn.pantalla, caja, fuentes[pn.pantalla]);
      const desde = inicioDeFuente(porId, pn.paso, pn.pantalla, pn.desde ?? 0);
      const salto = saltoDeFuente(porId, pn.paso, pn.pantalla, pn.salto);
      const largo = redondear((def.dur + SOLAPE) * velocidad + (salto ? salto.hasta - salto.desde : 0));
      const focosPanel = pn.rect ? [{ t: 0.1, rect: pn.rect }] : focosDelTramo(focos[pn.pantalla], desde, def.dur, velocidad, salto);
      return { pantalla: pn.pantalla, caja, entrada, velocidad, fuente: { desde, largo, ...(salto ? { salto } : {}) }, marco, focos: focosPanel };
    });
    escenas.push({ id: def.id, indice: i, inicio: redondear(reloj), dur: def.dur, texto: def.id === "gancho" ? plan.redes.gancho : def.texto, momento: Boolean(def.momento), llegada: def.llegada ?? null, paneles });
    reloj += def.dur;
  });
  const cierre = { inicio: redondear(reloj), dur: plan.redes.cierre.dur };
  return {
    escenas,
    cierre,
    duracion: redondear(cierre.inicio + cierre.dur),
    cortes: [...escenas.map((e) => e.inicio), cierre.inicio],
  };
}

/** Escenas consecutivas con el mismo texto comparten un solo cartel. */
export function gruposDeTexto(timeline) {
  const grupos = [];
  for (const e of timeline.escenas) {
    if (!e.texto) continue;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.texto === e.texto && ultimo.fin === e.inicio) {
      ultimo.fin = redondear(e.inicio + e.dur);
      ultimo.momento ||= e.momento;
    } else grupos.push({ texto: e.texto, inicio: e.inicio, fin: redondear(e.inicio + e.dur), momento: e.momento });
  }
  return grupos;
}

const ETIQUETAS = { cliente: "Cliente", local: "Local", repartidor: "Repartidor" };

export function escenasHtml(timeline) {
  const ultima = timeline.escenas.length - 1;
  return timeline.escenas
    .map((e, i) => {
      const paneles = e.paneles
        .map((pn, j) => {
          const { box, k, fw, fh, sw, sh } = pn.marco;
          const dur = redondear(e.dur + (i === ultima ? 0 : SOLAPE));
          const radio = Math.round(box.r / k);
          const borde = Math.round(box.b / k);
          const sombra = borde ? `box-shadow:0 0 0 ${borde}px #0d0a07,0 0 0 ${borde + Math.round(3 / k)}px rgba(240,242,238,0.22),0 ${borde * 3}px ${borde * 8}px rgba(0,0,0,0.55)` : "";
          const mini = e.momento ? `<div class="mini" style="left:${box.x + 28}px;top:${box.y + box.h - 84}px"><span>${ETIQUETAS[pn.pantalla]}</span></div>` : "";
          return `<div class="caja" id="caja-${i}-${j}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px">
          <div class="pane" id="pane-${i}-${j}" style="width:${fw}px;height:${fh}px;border-radius:${radio}px;${sombra}">
            <div class="cam" id="cam-${i}-${j}" style="width:${sw}px;height:${sh}px"><video id="v-${i}-${j}" class="clip" src="media/r-${i}-${j}.mp4" muted playsinline data-start="${e.inicio}" data-duration="${dur}" data-track-index="${i % 2}" style="left:0;top:0;width:${sw}px;height:${sh}px"></video></div>
          </div>
        </div>${mini}`;
        })
        .join("\n        ");
      const flash = e.llegada != null ? `<div class="flash" id="flash-${i}"></div>` : "";
      return `<div class="esc" id="esc-${i}" style="z-index:${i + 1}">
        ${paneles}
        ${flash}
      </div>`;
    })
    .join("\n      ");
}

export function textosRedesHtml(timeline) {
  return gruposDeTexto(timeline)
    .map((g, n) => {
      const palabras = g.texto.split(" ").map((w) => `<span class="w">${escapar(w)}</span>`).join(" ");
      const tamano = g.momento ? 100 : Math.max(84, Math.min(132, Math.floor(980 / (g.texto.length * 0.56))));
      return `<div class="txt${g.momento ? " centro" : ""}" id="txt-${n}"><div class="txt-fondo"></div><div class="txt-int" style="font-size:${tamano}px">${palabras}</div></div>`;
    })
    .join("\n      ");
}

export function guionRedes(plan, timeline) {
  const g = [];
  const tw = (s, t, d, de, a, e = "power2.out", extra = {}) => g.push({ s, t: redondear(t), d: redondear(d), de, a, e, ...extra });
  const set = (s, t, a) => g.push({ s, t: redondear(t), a });
  const { escenas, cierre } = timeline;
  const grupos = gruposDeTexto(timeline);

  const cam0 = {};
  // Estado inicial.
  escenas.forEach((e, i) => {
    set(`#esc-${i}`, 0, { opacity: 0, x: 0, scale: 1, filter: "blur(0px)", transformOrigin: "50% 50%" });
    e.paneles.forEach((pn, j) => {
      set(`#pane-${i}-${j}`, 0, { x: 0, y: 0, scale: pn.marco.k, transformOrigin: "0% 0%" });
      set(`#caja-${i}-${j}`, 0, { rotationX: 0, rotationY: 0, scale: 1, y: 0, opacity: 1, transformPerspective: 1100, transformOrigin: "50% 50%" });
      set(`#cam-${i}-${j}`, 0, { x: 0, y: 0, scale: 1, transformOrigin: "0% 0%" });
    });
    if (e.llegada != null) set(`#flash-${i}`, 0, { opacity: 0 });
  });
  grupos.forEach((_, n) => set(`#txt-${n}`, 0, { opacity: 0 }));
  set("#cierre-redes .portada-int", 0, { opacity: 0 });

  escenas.forEach((e, i) => {
    const T = e.inicio;
    const fin = T + e.dur + (i === escenas.length - 1 ? 0 : SOLAPE);
    set(`#esc-${i}`, Math.max(T, 0.001), { opacity: 1 });
    set(`#esc-${i}`, fin, { opacity: 0 });

    const entrada = e.paneles[0].entrada;
    if (entrada === "barrido" && i > 0) {
      tw(`#esc-${i}`, T, 0.22, { x: 1080, filter: "blur(22px)" }, { x: 0, filter: "blur(0px)" }, "power3.out");
      tw(`#esc-${i - 1}`, T, 0.22, { x: 0, filter: "blur(0px)" }, { x: -300, filter: "blur(16px)" }, "power2.in");
    } else if (entrada === "golpe") {
      tw(`#esc-${i}`, T, 0.2, { scale: 1.18, filter: "blur(9px)" }, { scale: 1, filter: "blur(0px)" }, "expo.out");
    } else if (entrada === "inclinado") {
      tw(`#esc-${i}`, T, 0.15, { filter: "blur(10px)" }, { filter: "blur(0px)" }, "power2.out");
      e.paneles.forEach((_, j) => {
        tw(`#caja-${i}-${j}`, T, 0.55, { rotationY: -38, rotationX: 16, scale: 0.7, y: 200, opacity: 0.2 }, { rotationY: 0, rotationX: 0, scale: 1, y: 0, opacity: 1 }, "back.out(1.5)");
      });
    }

    // Cámara: punch-in de golpe al foco.
    e.paneles.forEach((pn, j) => {
      const { marco } = pn;
      const frame = { fw: marco.fw, fh: marco.fh, sw: marco.sw, sh: marco.sh };
      const plan1 = planearCamara({
        frame,
        k: marco.k,
        focos: pn.focos,
        dur: e.dur,
        mov: 0.22,
        adelanto: 0.08,
        sostener: 0.5,
        hueco: 0.5,
        vuelve: false,
        llenar: 0.86,
        escalaMax: pn.pantalla === "local" ? 1.9 : 2.2,
      });
      const ini = plan1.inicio;
      set(`#cam-${i}-${j}`, 0.001, { x: ini.x, y: ini.y, scale: ini.s });
      cam0[`${i}-${j}`] = ini;
      for (const m of plan1.movimientos) {
        tw(`#cam-${i}-${j}`, T + m.t, m.d, { x: m.de.x, y: m.de.y, scale: m.de.s }, { x: m.a.x, y: m.a.y, scale: m.a.s }, "expo.out");
      }
    });

    // Momento clave: el aviso le salta al local con un destello y un temblor.
    if (e.llegada != null) {
      const at = T + e.llegada;
      tw(`#flash-${i}`, at, 0.06, { opacity: 0 }, { opacity: 0.55 }, "none");
      tw(`#flash-${i}`, at + 0.06, 0.35, { opacity: 0.55 }, { opacity: 0 }, "power2.out");
      const j = e.paneles.findIndex((pn) => pn.pantalla === "local");
      const c = `#caja-${i}-${j}`;
      tw(c, at, 0.05, { x: 0 }, { x: 12 }, "none");
      tw(c, at + 0.05, 0.05, { x: 12 }, { x: -12 }, "none");
      tw(c, at + 0.1, 0.05, { x: -12 }, { x: 7 }, "none");
      tw(c, at + 0.15, 0.1, { x: 7 }, { x: 0 }, "power2.out");
    }
  });

  // Carteles: palabra por palabra, con rebote.
  grupos.forEach((gr, n) => {
    const id = `#txt-${n}`;
    set(id, Math.max(gr.inicio, 0.001), { opacity: 1 });
    tw(`${id} .w`, gr.inicio + 0.04, 0.24, { opacity: 0, y: 80, scale: 1.4 }, { opacity: 1, y: 0, scale: 1 }, "back.out(2.2)", { escalonado: 0.07 });
    tw(id, gr.fin - 0.12, 0.12, { opacity: 1 }, { opacity: 0 }, "power1.in");
  });

  // Cierre.
  set("#cierre-redes .portada-int", cierre.inicio, { opacity: 1 });
  tw("#cierre-redes .portada-int img", cierre.inicio, 0.5, { scale: 0.6, rotation: -8 }, { scale: 1, rotation: 0 }, "back.out(2)");
  tw("#cierre-redes h1", cierre.inicio + 0.12, 0.35, { opacity: 0, y: 40 }, { opacity: 1, y: 0 }, "power3.out");
  tw("#cierre-redes .url", cierre.inicio + 0.3, 0.35, { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1 }, "back.out(1.8)");
  return g;
}

export { posicionCamara, PANTALLAS };
