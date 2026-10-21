// Edición del video demo, parte común y explicativos (horizontal y vertical): arma los tramos de
// grabación, la cámara guiada por los focos de pasos.json y el guion de animación que lee
// video-demo/edicion/motor.js. Todo lo que no toca disco ni procesos está acá, para poder probarlo.
import { FPS, aFrame, planearCamara, posicionCamara, redondear } from "./camara.mjs";

export { FPS, aFrame, redondear };
export const PANTALLAS = ["cliente", "local", "repartidor"];
const FUENTE_POR_DEFECTO = { cliente: [780, 1688], repartidor: [780, 1688], local: [2560, 1600] };

/** Tamaño de cada grabación en píxeles, de pasos.json (o el de siempre). */
export function tamanosFuente(pasosJson) {
  const out = {};
  for (const p of PANTALLAS) {
    const texto = pasosJson.resolucion?.videos?.[p];
    const [w, h] = texto ? texto.split("x").map(Number) : FUENTE_POR_DEFECTO[p];
    out[p] = { sw: w, sh: h };
  }
  return out;
}

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export { escapar };

/** Segundo de la grabación de `pantalla` que corresponde a `desde` segundos después del paso `paso`. */
export function inicioDeFuente(porId, paso, pantalla, desde) {
  const p = porId.get(paso);
  if (!p) throw new Error(`El plan nombra el paso «${paso}» y no está en pasos.json.`);
  const inicio = p.videos[pantalla].inicio + desde;
  if (inicio < 0) throw new Error(`«${paso}» con desde=${desde} cae antes del inicio de la grabación de ${pantalla}.`);
  return redondear(inicio);
}

/** Todos los focos de pasos.json por pantalla, con su `t` en el reloj de esa grabación. */
export function focosPorPantalla(pasosJson) {
  const out = { cliente: [], local: [], repartidor: [] };
  for (const p of pasosJson.pasos) for (const f of p.focos ?? []) out[f.pantalla].push({ t: f.t, rect: { x: f.x, y: f.y, w: f.w, h: f.h }, tipo: f.tipo });
  return out;
}

/** Focos que caen dentro de la ventana de grabación, en segundos desde el inicio del tramo. */
export function focosDelTramo(focos, desde, dur, velocidad, salto = null) {
  const corte = salto ? salto.hasta - salto.desde : 0;
  return focos
    .filter((f) => !salto || f.t < salto.desde || f.t >= salto.hasta)
    .map((f) => ({ ...f, t: redondear((f.t - desde - (salto && f.t >= salto.hasta ? corte : 0)) / velocidad) }))
    .filter((f) => f.t >= 0 && f.t <= dur);
}

/** Salto de la grabación (p. ej. una página que carga en blanco): absoluto en la pantalla, y cuánto se saltea. */
export function saltoDeFuente(porId, paso, pantalla, salto) {
  if (!salto) return null;
  return { desde: inicioDeFuente(porId, paso, pantalla, salto.desde), hasta: inicioDeFuente(porId, paso, pantalla, salto.hasta) };
}

/** Pasos de pasos.json que ningún guion usa ni omite: el script frena y los nombra. */
export function pasosSinPlan(plan, pasosJson) {
  const usados = new Set(plan.omitidos ?? []);
  for (const formato of ["h", "v"]) for (const t of plan.explicativo[formato]) for (const id of [t.paso, ...(t.pasos ?? [])]) usados.add(id);
  for (const e of plan.redes.ideas) for (const pn of e.paneles) for (const c of pn.cortes) usados.add(c.paso);
  return pasosJson.pasos.filter((p) => !usados.has(p.id)).map((p) => p.id);
}

/**
 * Tramos de un explicativo. `formato`: "h" o "v".
 * Cada tramo dura fuente/velocidad, y cada pantalla lee su propia grabación desde su ancla.
 */
export function armarTomas(plan, pasosJson, formato) {
  const sinPlan = pasosSinPlan(plan, pasosJson);
  if (sinPlan.length) throw new Error(`Pasos de pasos.json sin lugar en el plan: ${sinPlan.join(", ")}.`);
  const porId = new Map(pasosJson.pasos.map((p) => [p.id, p]));
  const focos = focosPorPantalla(pasosJson);
  const tomas = [];
  let reloj = plan.intro.dur;

  for (const def of plan.explicativo[formato]) {
    const velocidad = def.velocidad ?? 1;
    if (!(velocidad > 0)) throw new Error(`El tramo «${def.id}» tiene una velocidad inválida.`);
    const dur = aFrame(def.fuente / velocidad);
    if (dur <= 0) throw new Error(`El tramo «${def.id}» dura menos de un cuadro.`);
    const largo = redondear(dur * velocidad);
    const fuentes = {};
    const focosTramo = {};
    for (const pantalla of PANTALLAS) {
      const ancla = def.en?.[pantalla] ?? { paso: def.paso, desde: def.desde ?? 0 };
      const desde = inicioDeFuente(porId, ancla.paso, pantalla, ancla.desde);
      const salto = saltoDeFuente(porId, ancla.paso, pantalla, def.salto);
      fuentes[pantalla] = { desde, largo: redondear(largo + (salto ? salto.hasta - salto.desde : 0)), ...(salto ? { salto } : {}) };
      focosTramo[pantalla] = def.focos?.[pantalla] ?? focosDelTramo(focos[pantalla], desde, dur, velocidad, salto);
    }
    tomas.push({
      id: def.id,
      actor: def.actor,
      subtitulo: def.subtitulo,
      nota: def.nota ?? null,
      estado: def.estado ?? null,
      celebra: def.celebra ?? null,
      fijo: Boolean(def.focos),
      reflejo: def.reflejo ?? null,
      velocidad,
      dur,
      inicio: redondear(reloj),
      fuentes,
      focos: focosTramo,
    });
    reloj += dur;
  }
  const cierreInicio = redondear(reloj);
  return {
    formato,
    tomas,
    intro: { inicio: 0, dur: plan.intro.dur },
    cierre: { inicio: cierreInicio, dur: plan.cierre.dur },
    duracion: redondear(cierreInicio + plan.cierre.dur),
  };
}

/** Error claro si algún tramo pide más grabación de la que hay. `duraciones`: segundos por pantalla. */
export function validarFuentes(tomas, duraciones) {
  for (const t of tomas) {
    for (const [pantalla, f] of Object.entries(t.fuentes)) {
      const fin = f.desde + f.largo;
      if (fin > duraciones[pantalla] + 0.05) throw new Error(`El tramo «${t.id}» pide hasta el segundo ${fin.toFixed(1)} de ${pantalla} y la grabación dura ${duraciones[pantalla].toFixed(1)}.`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Geometría de los dos explicativos (px del lienzo)

const TRANSICION = 0.7;

const escalaPantalla = (alto, sh) => alto / sh;

/** Disposición del horizontal para un tramo: dónde va cada pantalla, grande o chica. */
export function disposicionHorizontal(toma, fuentes) {
  const cy = 570;
  const grande = { cliente: escalaPantalla(800, fuentes.cliente.sh), repartidor: escalaPantalla(800, fuentes.repartidor.sh), local: 1300 / fuentes.local.sw };
  const chica = { cliente: escalaPantalla(470, fuentes.cliente.sh), repartidor: escalaPantalla(470, fuentes.repartidor.sh), local: 500 / fuentes.local.sw };
  const tam = (p, k) => ({ w: fuentes[p].sw * k, h: fuentes[p].sh * k });
  const pone = (p, k, x, o = 1, z = 1) => {
    const t = tam(p, k);
    return { x: Math.round(x), y: Math.round(cy - t.h / 2), k, w: t.w, h: t.h, o, z };
  };
  const out = {};

  if (toma.reflejo) {
    const { de, a } = toma.reflejo;
    const kFrase = { cliente: grande.cliente, repartidor: grande.repartidor, local: 1090 / fuentes.local.sw };
    const izq = tam(de, kFrase[de]);
    const mitad = (1920 - izq.w - tam(a, kFrase[a]).w - 240) / 2;
    out[de] = pone(de, kFrase[de], mitad, 1, 3);
    out[a] = pone(a, kFrase[a], mitad + izq.w + 240, 1, 3);
    const tercero = PANTALLAS.find((p) => p !== de && p !== a);
    out[tercero] = { ...pone(tercero, chica[tercero], 960 - tam(tercero, chica[tercero]).w / 2, 0, 0) };
    const x1 = out[de].x + out[de].w + 24;
    const x2 = out[a].x - 24;
    return { panes: out, flecha: { x1, x2, y: cy } };
  }

  const actor = toma.actor;
  const centro = (p) => 960 - tam(p, grande[p]).w / 2;
  out[actor] = pone(actor, grande[actor], centro(actor), 1, 3);
  const otros = PANTALLAS.filter((p) => p !== actor);
  const libre = (lado) => {
    const g = out[actor];
    return lado === "izq" ? { ini: 0, fin: g.x } : { ini: g.x + g.w, fin: 1920 };
  };
  // Los celulares van a la izquierda y el local a la derecha; si el actor es el local, uno de cada lado.
  const LADOS = {
    cliente: { local: "izq", repartidor: "der" },
    local: { cliente: "izq", repartidor: "der" },
    repartidor: { cliente: "izq", local: "der" },
  };
  const lados = LADOS[actor];
  for (const p of otros) {
    const r = libre(lados[p]);
    const t = tam(p, chica[p]);
    out[p] = pone(p, chica[p], r.ini + (r.fin - r.ini - t.w) / 2, 0.88, 1);
  }
  return { panes: out, flecha: null };
}

// ---------------------------------------------------------------------------------------------
// Guion de animación: lista de {s, t, d, de, a, e} que motor.js vuelca en una timeline de GSAP.
// `de` explícito en cada movimiento: así el render no depende del orden en que se busca cada cuadro.

const ESTADO_PENDIENTE = { backgroundColor: "rgba(240,242,238,0.12)", color: "rgba(240,242,238,0.55)", scale: 1 };
const ESTADO_ACTUAL = { backgroundColor: "#d97706", color: "#241d16", scale: 1.06 };
const ESTADO_HECHO = { backgroundColor: "#047857", color: "#f0f2ee", scale: 1 };

const COLOR_ACENTO = "#d97706";
const COLOR_ETIQUETA = "rgba(240,242,238,0.6)";
const posEtiqueta = (d, fuente) => {
  const w = d.w ?? fuente.sw * d.k;
  return { x: Math.round(d.x + w / 2 - 150), y: d.y - 46 };
};
const posCam = (p) => ({ x: p.x, y: p.y, scale: p.s });

/** Guion del explicativo horizontal (el vertical vive en explicativo-v.mjs). */
export function guionExplicativo(plan, timeline, fuentes) {
  const g = [];
  const tw = (s, t, d, de, a, e = "power2.inOut", extra = {}) => g.push({ s, t: redondear(t), d: redondear(d), de, a, e, ...extra });
  const set = (s, t, a) => g.push({ s, t: redondear(t), a });
  const { tomas, intro, cierre } = timeline;
  const primero = tomas[0];
  const entra = Math.max(0, primero.inicio - 0.4);

  const marcos = {};
  for (const p of PANTALLAS) {
    marcos[p] = { fw: fuentes[p].sw, fh: fuentes[p].sh, sw: fuentes[p].sw, sh: fuentes[p].sh };
  }

  // Estado inicial de todo lo que se anima.
  for (const p of PANTALLAS) {
    set(`#pane-${p}`, 0, { opacity: 0, x: 0, y: 0, scale: 1, transformOrigin: "0% 0%" });
    set(`#cam-${p}`, 0, { x: 0, y: 0, scale: 1, transformOrigin: "0% 0%" });
    set(`#etq-${p}`, 0, { opacity: 0 });
  }
  set("#estados", 0, { opacity: 0 });
  set("#marca", 0, { opacity: 0 });
  set("#ff", 0, { opacity: 0 });
  for (let i = 0; i < plan.estados.length; i++) set(`#est-${i}`, 0, ESTADO_PENDIENTE);
  tomas.forEach((t, i) => {
    set(`#sub-${i}`, 0, { opacity: 0 });
    if (t.nota) set(`#nota-${i}`, 0, { opacity: 0 });
    if (t.reflejo) {
      set(`#linea-${i}`, 0, { scaleX: 0, transformOrigin: "0% 50%" });
      set(`#punta-${i}`, 0, { opacity: 0 });
      set(`#pulso-${i}`, 0, { opacity: 0, x: 0 });
      set(`#aro-${i}`, 0, { opacity: 0 });
    }
  });

  // Intro (arranca con el logo ya visible: sin pantallas en blanco) y cierre.
  set("#intro .portada-int", 0, { opacity: 1 });
  tw("#intro .portada-int img", 0, 0.7, { scale: 0.86 }, { scale: 1 }, "back.out(1.6)");
  tw("#intro h1", 0.25, 0.6, { opacity: 0, y: 26 }, { opacity: 1, y: 0 }, "power3.out");
  tw("#intro .portada-int", intro.dur - 0.45, 0.4, { opacity: 1 }, { opacity: 0 }, "power2.in");
  set("#cierre .portada-int", 0, { opacity: 0 });
  tw("#cierre .portada-int", cierre.inicio + 0.1, 0.6, { opacity: 0, y: 26 }, { opacity: 1, y: 0 }, "power3.out");
  tw("#marca", entra, 0.5, { opacity: 0 }, { opacity: 1 }, "power2.out");
  tw("#estados", entra, 0.5, { opacity: 0, y: -16 }, { opacity: 1, y: 0 }, "power2.out");
  const salida = cierre.inicio - 0.3;

  const previo = {}; // última disposición de cada pantalla
  const camPrevia = {};
  const etiquetaActiva = {};
  let estadoActual = -1;
  let ffVisible = false;

  tomas.forEach((t, i) => {
    const disp = disposicionHorizontal(t, fuentes);
    const T = t.inicio;
    const activas = new Set(t.reflejo ? [t.reflejo.de, t.reflejo.a] : [t.actor]);

    for (const p of PANTALLAS) {
      const d = disp.panes[p];
      const antes = previo[p];
      const de = antes ?? { x: d.x, y: d.y, k: d.k * 0.94, o: 0 };
      const cambia = !antes || ["x", "y", "k", "o"].some((c) => Math.abs((antes[c] ?? 0) - d[c]) > 0.01);
      if (cambia) {
        const dd = i === 0 ? 0.7 : TRANSICION;
        tw(`#pane-${p}`, i === 0 ? entra : T, dd, { x: de.x, y: de.y, scale: de.k, opacity: de.o }, { x: d.x, y: d.y, scale: d.k, opacity: d.o }, "power3.inOut");
        tw(`#etq-${p}`, i === 0 ? entra : T, dd, { ...posEtiqueta(de, fuentes[p]), opacity: de.o }, { ...posEtiqueta(d, fuentes[p]), opacity: d.o }, "power3.inOut");
      }
      set(`#pane-${p}`, T, { zIndex: d.z ?? 1 });
      previo[p] = d;
    }

    // Etiquetas: la de quien actúa en naranja.
    for (const p of PANTALLAS) {
      const activo = activas.has(p);
      if (activo !== (etiquetaActiva[p] ?? false)) {
        tw(`#etq-${p} span`, T, 0.3, { color: activo ? COLOR_ETIQUETA : COLOR_ACENTO }, { color: activo ? COLOR_ACENTO : COLOR_ETIQUETA }, "power2.out");
      }
      etiquetaActiva[p] = activo;
    }

    // Cámara: va al foco antes del toque y después al de resultado; al terminar, muestra el contexto.
    for (const p of PANTALLAS) {
      const marco = marcos[p];
      const k = disp.panes[p].k;
      const activa = activas.has(p);
      const plan1 = activa
        ? planearCamara({
            frame: marco,
            k,
            focos: t.focos[p].map((f) => ({ t: f.t, rect: f.rect })),
            dur: t.dur,
            escalaMax: p === "local" ? 1.9 : 2.4,
            zoomMax: p === "local" ? 1.7 : 2.0,
            llenar: 0.82,
          })
        : { inicio: posicionCamara(marco, { s: 1, cx: marco.sw / 2, cy: marco.sh * 0.5 }), movimientos: [] };
      const ini = plan1.inicio;
      const ant = camPrevia[p];
      const igual = ant && ant.s === ini.s && ant.x === ini.x && ant.y === ini.y;
      if (!igual) {
        const continua = Boolean(ant);
        if (continua) tw(`#cam-${p}`, T, 0.6, posCam(ant), posCam(ini), "power2.inOut");
        else set(`#cam-${p}`, T, posCam(ini));
      }
      let fin = ini;
      for (const m of plan1.movimientos) {
        tw(`#cam-${p}`, T + m.t, m.d, posCam(m.de), posCam(m.a), "power2.inOut");
        fin = m.a;
      }
      camPrevia[p] = fin;
    }

    // Subtítulo.
    tw(`#sub-${i}`, T + 0.1, 0.35, { opacity: 0, y: 22 }, { opacity: 1, y: 0 }, "power2.out");
    if (i < tomas.length - 1) tw(`#sub-${i}`, T + t.dur - 0.25, 0.2, { opacity: 1 }, { opacity: 0 }, "power1.in");

    // Ícono de avance (sin «×N»): solo en los tramos acelerados.
    const acelerado = t.velocidad >= 1.5;
    if (acelerado !== ffVisible) {
      tw("#ff", T, 0.25, { opacity: ffVisible ? 1 : 0 }, { opacity: acelerado ? 1 : 0 }, "power2.out");
      ffVisible = acelerado;
    }

    // «unos minutos después».
    if (t.nota) {
      tw(`#nota-${i}`, T + 0.15, 0.35, { opacity: 0, y: -14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1 }, "back.out(1.8)");
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

    // Flecha entre dos pantallas y aro sobre la que recibe.
    if (t.reflejo && disp.flecha) {
      const f = disp.flecha;
      const largo = f.x2 - f.x1;
      const llegada = t.reflejo.llegada ?? 1;
      const sale = Math.max(0.1, llegada - 0.75);
      tw(`#linea-${i}`, T + sale, 0.55, { scaleX: 0 }, { scaleX: 1 }, "power2.inOut");
      tw(`#pulso-${i}`, T + sale, 0.1, { opacity: 0, x: 0 }, { opacity: 1, x: 0 }, "none");
      tw(`#pulso-${i}`, T + sale + 0.1, 0.55, { x: 0 }, { x: largo - 34 }, "power2.inOut");
      tw(`#punta-${i}`, T + sale + 0.45, 0.2, { opacity: 0 }, { opacity: 1 }, "power1.out");
      tw(`#aro-${i}`, T + llegada - 0.1, 0.15, { opacity: 0, scale: 1.02 }, { opacity: 1, scale: 1 }, "power2.out");
      tw(`#aro-${i}`, T + llegada + 0.15, 0.7, { opacity: 1 }, { opacity: 0 }, "power2.in");
      tw(`#linea-${i}`, T + llegada + 0.9, 0.3, { opacity: 1 }, { opacity: 0 }, "power1.in");
      tw(`#punta-${i}`, T + llegada + 0.9, 0.3, { opacity: 1 }, { opacity: 0 }, "power1.in");
      tw(`#pulso-${i}`, T + llegada + 0.1, 0.2, { opacity: 1 }, { opacity: 0 }, "power1.in");
    }
  });

  for (const p of PANTALLAS) {
    tw(`#pane-${p}`, salida, 0.3, { opacity: previo[p].o }, { opacity: 0 }, "power2.in");
    tw(`#etq-${p}`, salida, 0.3, { opacity: previo[p].o }, { opacity: 0 }, "power2.in");
  }
  tw("#marca", salida, 0.3, { opacity: 1 }, { opacity: 0 }, "power2.in");
  tw("#estados", salida, 0.3, { opacity: 1 }, { opacity: 0 }, "power2.in");
  return g;
}

// ---------------------------------------------------------------------------------------------
// Piezas de HTML que dependen de la grabación

const videoHtml = (id, src, inicio, dur, pista, estilo) =>
  `<video id="${id}" class="clip" src="${src}" muted playsinline data-start="${inicio}" data-duration="${dur}" data-track-index="${pista}" style="${estilo}"></video>`;

const ETIQUETAS = { cliente: "Cliente", local: "Local", repartidor: "Repartidor" };

/** Una ventana (pane) por pantalla, con sus videos tramo a tramo adentro. */
export function panesHtml(timeline, fuentes) {
  return PANTALLAS.map((p, pista) => {
    const marco = { fw: fuentes[p].sw, fh: fuentes[p].sh };
    const radio = Math.round(30 / 0.4739);
    const borde = Math.round(8 / 0.4739);
    const videos = timeline.tomas
      .map((t, i) => {
        return videoHtml(`v-${p}-${i}`, `media/${p}-${i}.mp4`, t.inicio, t.dur, pista, `left:0;top:0;width:${fuentes[p].sw}px;height:${fuentes[p].sh}px`);
      })
      .join("\n          ");
    return `<div class="pane" id="pane-${p}" style="width:${marco.fw}px;height:${marco.fh}px;border-radius:${radio}px;box-shadow:0 0 0 ${borde}px #0d0a07,0 0 0 ${borde + Math.round(2 / 0.4739)}px rgba(240,242,238,0.2),0 ${borde * 3}px ${borde * 8}px rgba(0,0,0,0.5)">
        <div class="cam" id="cam-${p}" style="width:${fuentes[p].sw}px;height:${fuentes[p].sh}px">
          ${videos}
        </div>
      </div>
      <div class="etq" id="etq-${p}"><span>${ETIQUETAS[p]}</span></div>`;
  }).join("\n      ");
}

export function textosHtml(plan, timeline) {
  const subtitulos = timeline.tomas.map((t, i) => `<div class="sub" id="sub-${i}"><span>${escapar(t.subtitulo)}</span></div>`);
  const notas = timeline.tomas.map((t, i) => (t.nota ? `<div class="nota" id="nota-${i}"><span>${escapar(t.nota)}</span></div>` : "")).filter(Boolean);
  const estados = plan.estados.map((e, i) => `<div class="est" id="est-${i}">${escapar(e)}</div>`).join("");
  return { subtitulos: subtitulos.join("\n      "), notas: notas.join("\n      "), estados };
}

export function flechasHtml(timeline, fuentes) {
  return timeline.tomas
    .map((t, i) => {
      if (!t.reflejo) return "";
      const { flecha, panes } = disposicionHorizontal(t, fuentes);
      const a = panes[t.reflejo.a];
      return `<div class="flecha" id="flecha-${i}" style="left:${Math.round(flecha.x1)}px;top:${flecha.y - 7}px;width:${Math.round(flecha.x2 - flecha.x1)}px"><div class="linea" id="linea-${i}"></div><div class="punta" id="punta-${i}"></div><div class="pulso" id="pulso-${i}"></div></div>
      <div class="aro" id="aro-${i}" style="left:${a.x - 10}px;top:${a.y - 10}px;width:${Math.round(a.w) + 20}px;height:${Math.round(a.h) + 20}px"></div>`;
    })
    .filter(Boolean)
    .join("\n      ");
}

// ---------------------------------------------------------------------------------------------
// ffmpeg

/**
 * Recorta un tramo de una grabación, lo acelera y lo deja a FPS fijos, sin tocar el tamaño.
 * `salto` (opcional, segundos absolutos de la grabación) saca un pedazo del medio.
 */
export function argsTramo(entrada, { desde, largo, salto = null }, velocidad, salida, { crf = 14 } = {}) {
  const comun = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-g", String(FPS), "-keyint_min", String(FPS), "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart"];
  const final = `setpts=(PTS-STARTPTS)/${velocidad},fps=${FPS},setsar=1`;
  const base = ["-y", "-loglevel", "error", "-ss", String(desde), "-t", String(largo), "-i", entrada];
  if (!salto) return [...base, "-vf", final, ...comun, salida];
  const a = redondear(salto.desde - desde);
  const b = redondear(salto.hasta - desde);
  const filtro = `[0:v]trim=start=0:end=${a},setpts=PTS-STARTPTS[a];[0:v]trim=start=${b},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,${final}[salida]`;
  return [...base, "-filter_complex", filtro, "-map", "[salida]", ...comun, salida];
}

/** Bitrate de video para que el archivo pese menos que `maxBytes` (con margen para el contenedor). */
export function bitrateParaPeso(duracion, maxBytes = 14_000_000, tope = 8_000_000) {
  return Math.min(tope, Math.floor((maxBytes * 8) / duracion));
}

export function rellenarPlantilla(plantilla, valores) {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, clave) => {
    if (!(clave in valores)) throw new Error(`La plantilla pide {{${clave}}} y no hay valor.`);
    return valores[clave];
  });
}
