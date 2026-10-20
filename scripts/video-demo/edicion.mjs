// Edición del video demo: arma el plan de tiempos y los comandos de ffmpeg a partir de pasos.json
// y de plan.json. Todo lo que no toca disco ni procesos está acá, para poder probarlo.
export const FPS = 25;
export const PANTALLAS = ["cliente", "local", "repartidor"];

// Tamaño al que se pasa cada grabación (el de pantalla en el lienzo, sin reescalar después).
export const GEOMETRIA = {
  h: {
    ancho: 1920,
    alto: 1080,
    cliente: { w: 340, h: 736 },
    repartidor: { w: 340, h: 736 },
    local: { w: 1060, h: 662 },
  },
  v: {
    ancho: 1080,
    alto: 1920,
    marco: { w: 900, h: 1230 },
    celular: { w: 568, h: 1230 },
  },
};

// Hacia abajo: la grabación nunca queda más corta que el tramo.
const aFrame = (segundos) => Math.floor(segundos * FPS + 1e-6) / FPS;
const redondear = (n) => Math.round(n * 1000) / 1000;

export function etiquetaVelocidad(velocidad) {
  if (velocidad < 1.5) return null;
  return `×${String(Number.isInteger(velocidad) ? velocidad : velocidad.toFixed(1)).replace(".", ",")}`;
}

/**
 * Cada entrada del plan cubre uno o más pasos; de ahí salen los tramos de la edición.
 * `formato` es "h" (horizontal) o "v" (vertical).
 */
export function armarSegmentos(plan, pasosJson, formato) {
  const porId = new Map(pasosJson.pasos.map((p) => [p.id, p]));
  const cubiertos = new Set();
  const segmentos = [];

  for (const entrada of plan.entradas) {
    for (const id of entrada.ids) {
      if (!porId.has(id)) throw new Error(`El plan nombra el paso «${id}» y no está en pasos.json.`);
      cubiertos.add(id);
    }
    const cfg = entrada[formato];
    if (!cfg) continue;

    const primero = porId.get(entrada.ids[0]);
    const ultimo = porId.get(entrada.ids.at(-1));
    const velocidad = cfg.velocidad ?? 1;
    if (!(velocidad > 0)) throw new Error(`El tramo «${entrada.ids.join("+")}» tiene una velocidad inválida.`);

    const fuentes = {};
    for (const pantalla of PANTALLAS) {
      const ini = primero.videos[pantalla].inicio + (cfg.desde ?? 0);
      const fin = cfg.hasta == null ? ultimo.videos[pantalla].fin : primero.videos[pantalla].inicio + cfg.hasta;
      if (!(fin > ini)) throw new Error(`El tramo «${entrada.ids.join("+")}» queda vacío en ${pantalla}.`);
      fuentes[pantalla] = { desde: redondear(ini), hasta: redondear(fin) };
    }

    // Todas las pantallas duran lo mismo en la edición: se manda por la del cliente.
    const dur = aFrame((fuentes.cliente.hasta - fuentes.cliente.desde) / velocidad);
    if (dur <= 0) throw new Error(`El tramo «${entrada.ids.join("+")}» dura menos de un cuadro con esa velocidad.`);
    const largoOrigen = redondear(dur * velocidad);
    for (const pantalla of PANTALLAS) {
      fuentes[pantalla].hasta = redondear(Math.min(fuentes[pantalla].desde + largoOrigen, fuentes[pantalla].hasta));
    }

    let crop = null;
    if (formato === "v" && entrada.actor === "local") {
      if (!cfg.crop) throw new Error(`El tramo «${entrada.ids.join("+")}» muestra al local en vertical y no tiene crop.`);
      crop = cfg.crop;
    }

    segmentos.push({
      ids: entrada.ids,
      actor: entrada.actor,
      subtitulo: entrada.subtitulo,
      nota: entrada.nota ?? null,
      velocidad,
      etiqueta: etiquetaVelocidad(velocidad),
      fuentes,
      // Para que el crop deslizante se ancle al paso, no al segundo absoluto de la grabación.
      inicioPasoLocal: primero.videos.local.inicio,
      crop,
      dur,
    });
  }

  const sinPlan = pasosJson.pasos.filter((p) => !cubiertos.has(p.id)).map((p) => p.id);
  if (sinPlan.length) throw new Error(`Pasos de pasos.json sin entrada en el plan: ${sinPlan.join(", ")}.`);

  if (!segmentos.length) throw new Error(`El plan no tiene ningún tramo para el formato «${formato}».`);

  let reloj = plan.intro.dur;
  for (const s of segmentos) {
    s.inicio = redondear(reloj);
    reloj += s.dur;
  }
  const cierreInicio = redondear(reloj);
  return {
    formato,
    segmentos,
    intro: { inicio: 0, dur: plan.intro.dur },
    cierre: { inicio: cierreInicio, dur: plan.cierre.dur },
    duracion: redondear(cierreInicio + plan.cierre.dur),
  };
}

/** Bitrate de video para que el archivo pese menos que `maxBytes` (con margen para el contenedor). */
export function bitrateParaPeso(duracion, maxBytes = 14_000_000, tope = 6_000_000) {
  return Math.min(tope, Math.floor((maxBytes * 8) / duracion));
}

function expresionX(crop, segmento) {
  if (typeof crop.x === "number") return String(crop.x);
  const { desde, hasta, en, dur } = crop.x;
  const t0 = redondear(segmento.inicioPasoLocal + en);
  return `'${desde}+(${hasta - desde})*clip((t-${t0})/${dur},0,1)'`;
}

/** Filtro de ffmpeg que recorta, acelera y escala un tramo de una grabación. */
export function filtroTramo(segmento, pantalla, tamano) {
  const { desde, hasta } = segmento.fuentes[pantalla];
  const partes = [`trim=start=${desde}:end=${hasta}`];
  // El crop va antes de setpts: la expresión del deslizamiento usa el tiempo de la grabación.
  if (pantalla === "local" && segmento.crop) {
    const { y, w, h } = segmento.crop;
    partes.push(`crop=w=${w}:h=${h}:x=${expresionX(segmento.crop, segmento)}:y=${y}`);
  }
  partes.push(`setpts=(PTS-STARTPTS)/${segmento.velocidad}`, `fps=${FPS}`, `scale=${tamano.w}:${tamano.h}:flags=lanczos`, "setsar=1");
  return partes.join(",");
}

/** Horizontal: un video por pantalla con todos los tramos pegados en orden. */
export function filtroPantallaHorizontal(segmentos, pantalla, tamano) {
  const ramas = segmentos.map((s, i) => `[0:v]${filtroTramo(s, pantalla, tamano)}[t${i}]`);
  const entradas = segmentos.map((_, i) => `[t${i}]`).join("");
  return `${ramas.join(";")};${entradas}concat=n=${segmentos.length}:v=1:a=0[salida]`;
}

export function argsFfmpeg(entrada, filtro, salida) {
  return [
    "-y", "-loglevel", "error", "-i", entrada,
    "-filter_complex", filtro, "-map", "[salida]",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-g", String(FPS), "-keyint_min", String(FPS), "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-r", String(FPS), salida,
  ];
}

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ETIQUETAS = { cliente: "Cliente", local: "Local", repartidor: "Repartidor" };

const atributosTiempo = (inicio, dur) => `data-start="${inicio}" data-duration="${dur}"`;

/** Elementos con tiempo que cambian según la grabación: subtítulos, marcas de velocidad y notas. */
export function elementosTemporales(timeline) {
  const subtitulos = [];
  const marcas = [];
  timeline.segmentos.forEach((s, i) => {
    subtitulos.push(
      `<div id="sub-${i}" class="sub clip" ${atributosTiempo(s.inicio, s.dur)} data-track-index="10"><span class="sub-txt">${escapar(s.subtitulo)}</span></div>`,
    );
    if (s.etiqueta) {
      marcas.push(
        `<div id="vel-${i}" class="vel clip" ${atributosTiempo(s.inicio, s.dur)} data-track-index="11"><span class="marca-txt">${escapar(s.etiqueta)}</span></div>`,
      );
    }
    if (s.nota) {
      marcas.push(
        `<div id="nota-${i}" class="nota clip" ${atributosTiempo(s.inicio, s.dur)} data-track-index="12"><span class="marca-txt">${escapar(s.nota)}</span></div>`,
      );
    }
  });
  return { subtitulos: subtitulos.join("\n      "), marcas: marcas.join("\n      ") };
}

export function etiquetaPantalla(pantalla) {
  return ETIQUETAS[pantalla];
}

/** Datos mínimos que lee el guion de animación de la plantilla. */
export function datosParaPlantilla(timeline) {
  return {
    duracion: timeline.duracion,
    intro: timeline.intro,
    cierre: timeline.cierre,
    segmentos: timeline.segmentos.map((s) => ({
      inicio: s.inicio,
      dur: s.dur,
      actor: s.actor,
      etiqueta: Boolean(s.etiqueta),
      nota: Boolean(s.nota),
    })),
  };
}

export function rellenarPlantilla(plantilla, valores) {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, clave) => {
    if (!(clave in valores)) throw new Error(`La plantilla pide {{${clave}}} y no hay valor.`);
    return valores[clave];
  });
}

export { escapar };
