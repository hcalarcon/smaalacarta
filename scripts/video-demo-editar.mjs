// Edita las grabaciones del video demo con HyperFrames y saca los dos videos para mandar.
// Uso:  npm run video-demo:editar                     usa la última carpeta completa de video-demo/salida
//       npm run video-demo:editar -- --carpeta <ruta>
// Deja demo-16x9.mp4 y demo-9x16.mp4 en <carpeta>/final/. La composición vive en video-demo/edicion/.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GEOMETRIA,
  PANTALLAS,
  argsFfmpeg,
  armarSegmentos,
  bitrateParaPeso,
  datosParaPlantilla,
  elementosTemporales,
  escapar,
  filtroPantallaHorizontal,
  filtroTramo,
  rellenarPlantilla,
  FPS,
} from "./video-demo/edicion.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDICION = path.join(RAIZ, "video-demo", "edicion");
const SALIDA = path.join(RAIZ, "video-demo", "salida");
const MAX_BYTES = 16_000_000; // WhatsApp recomprime lo que pasa de ~16 MB

function salirConError(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

function carpetaCompleta(carpeta) {
  const faltan = [...PANTALLAS.map((p) => `${p}.mp4`), "pasos.json"].filter((f) => !existsSync(path.join(carpeta, f)));
  if (faltan.length) return `le faltan ${faltan.join(", ")}`;
  if (existsSync(path.join(carpeta, "fallo"))) return "tiene una carpeta fallo/ (la grabación se cortó)";
  if (leerJson(path.join(carpeta, "pasos.json")).completo !== true) return "pasos.json dice que la grabación no se completó";
  return null;
}

function elegirCarpeta(args) {
  const i = args.indexOf("--carpeta");
  if (i !== -1) {
    if (!args[i + 1]) salirConError("--carpeta pide la ruta de una carpeta de video-demo/salida.");
    const carpeta = path.resolve(args[i + 1]);
    const problema = existsSync(carpeta) ? carpetaCompleta(carpeta) : "no existe";
    if (problema) salirConError(`${carpeta}: ${problema}.`);
    return carpeta;
  }
  if (!existsSync(SALIDA)) salirConError("No hay grabaciones: corré `npm run video-demo` primero.");
  const candidatas = readdirSync(SALIDA, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(SALIDA, e.name))
    .sort()
    .reverse();
  const carpeta = candidatas.find((c) => carpetaCompleta(c) === null);
  if (!carpeta) salirConError("Ninguna carpeta de video-demo/salida tiene la grabación completa (cliente, local, repartidor y pasos.json).");
  return carpeta;
}

function correr(comando, args, { entorno = {}, silencioso = false } = {}) {
  const res = spawnSync(comando, args, {
    stdio: silencioso ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", ...entorno },
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) {
    const detalle = res.error ? res.error.message : (res.stderr || "").trim().split("\n").slice(-5).join("\n");
    salirConError(`Falló ${path.basename(comando)}${detalle ? `:\n${detalle}` : "."}`);
  }
}

function binarioHyperframes() {
  const require = createRequire(import.meta.url);
  let paquete;
  try {
    paquete = require.resolve("hyperframes/package.json");
  } catch (error) {
    salirConError(`No encuentro HyperFrames (${error.code ?? error.message}): corré \`npm install\` en la raíz.`);
  }
  const bin = leerJson(paquete).bin;
  return path.join(path.dirname(paquete), typeof bin === "string" ? bin : bin.hyperframes);
}

function prepararProyecto(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "media"), { recursive: true });
  mkdirSync(path.join(dir, "fonts"), { recursive: true });
  mkdirSync(path.join(dir, "vendor"), { recursive: true });
  copyFileSync(path.join(EDICION, "marca.css"), path.join(dir, "marca.css"));
  copyFileSync(path.join(EDICION, "logo.png"), path.join(dir, "logo.png"));
  copyFileSync(path.join(EDICION, "vendor", "gsap.min.js"), path.join(dir, "vendor", "gsap.min.js"));
  for (const fuente of readdirSync(path.join(EDICION, "fonts"))) {
    copyFileSync(path.join(EDICION, "fonts", fuente), path.join(dir, "fonts", fuente));
  }
  // HyperFrames pide estos dos archivos para tratar la carpeta como un proyecto.
  writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ telemetryEnabled: false }, null, 2));
}

function valoresComunes(plan, timeline) {
  const { subtitulos, marcas } = elementosTemporales(timeline);
  return {
    DURACION: String(timeline.duracion),
    INTRO_DUR: String(timeline.intro.dur),
    INTRO_TITULO: escapar(plan.intro.titulo),
    CIERRE_INICIO: String(timeline.cierre.inicio),
    CIERRE_DUR: String(timeline.cierre.dur),
    CIERRE_TEXTO: escapar(plan.cierre.texto),
    CIERRE_URL: escapar(plan.cierre.url),
    SUBTITULOS: subtitulos,
    MARCAS: marcas,
    DATOS: JSON.stringify(datosParaPlantilla(timeline)).replace(/</g, "\\u003c"),
  };
}

const videoHtml = (id, src, inicio, dur, pista, estilo = "") =>
  `<video id="${id}" class="clip" src="${src}" muted playsinline data-start="${inicio}" data-duration="${dur}" data-track-index="${pista}"${estilo ? ` style="${estilo}"` : ""}></video>`;

function armarHorizontal({ carpeta, dir, plan, pasos }) {
  const timeline = armarSegmentos(plan, pasos, "h");
  const inicio = timeline.segmentos[0].inicio;
  const largo = timeline.cierre.inicio - inicio;
  const valores = valoresComunes(plan, timeline);
  PANTALLAS.forEach((pantalla, i) => {
    const filtro = filtroPantallaHorizontal(timeline.segmentos, pantalla, GEOMETRIA.h[pantalla]);
    correr("ffmpeg", argsFfmpeg(path.join(carpeta, `${pantalla}.mp4`), filtro, path.join(dir, "media", `${pantalla}.mp4`)), { silencioso: true });
    valores[`VIDEO_${pantalla}`] = videoHtml(`v-${pantalla}`, `media/${pantalla}.mp4`, inicio, largo, i);
  });
  return { timeline, valores };
}

function armarVertical({ carpeta, dir, plan, pasos }) {
  const timeline = armarSegmentos(plan, pasos, "v");
  const { marco, celular } = GEOMETRIA.v;
  const videos = [];
  const aros = [];
  timeline.segmentos.forEach((s, i) => {
    const esLocal = s.actor === "local";
    const tamano = esLocal ? marco : celular;
    const izquierda = Math.round((marco.w - tamano.w) / 2);
    const filtro = `[0:v]${filtroTramo(s, s.actor, tamano)}[salida]`;
    correr("ffmpeg", argsFfmpeg(path.join(carpeta, `${s.actor}.mp4`), filtro, path.join(dir, "media", `seg-${i}.mp4`)), { silencioso: true });
    videos.push(videoHtml(`seg-${i}`, `media/seg-${i}.mp4`, s.inicio, s.dur, 1, `left:${izquierda}px;width:${tamano.w}px`));
    aros.push(
      `<div id="aro-${i}" class="aro clip" data-start="${s.inicio}" data-duration="${s.dur}" data-track-index="2" style="left:${izquierda}px;width:${tamano.w}px"></div>`,
    );
  });
  const valores = valoresComunes(plan, timeline);
  valores.VIDEOS = videos.join("\n        ");
  valores.AROS = aros.join("\n        ");
  return { timeline, valores };
}

const FORMATOS = [
  { clave: "h", plantilla: "plantilla-16x9.html", salida: "demo-16x9.mp4", armar: armarHorizontal },
  { clave: "v", plantilla: "plantilla-9x16.html", salida: "demo-9x16.mp4", armar: armarVertical },
];

const args = process.argv.slice(2);
const carpeta = elegirCarpeta(args);
const plan = leerJson(path.join(EDICION, "plan.json"));
const pasos = leerJson(path.join(carpeta, "pasos.json"));

if (spawnSync("ffmpeg", ["-version"]).status !== 0) salirConError("Hace falta ffmpeg instalado y en el PATH.");
const hyperframes = binarioHyperframes();

const final = path.join(carpeta, "final");
mkdirSync(final, { recursive: true });
console.log(`Editando ${path.relative(RAIZ, carpeta)}…`);

for (const formato of FORMATOS) {
  const dir = path.join(final, "_proyecto", formato.clave);
  prepararProyecto(dir);
  const { timeline, valores } = formato.armar({ carpeta, dir, plan, pasos });
  writeFileSync(path.join(dir, "index.html"), rellenarPlantilla(readFileSync(path.join(EDICION, formato.plantilla), "utf8"), valores));

  const limites = plan.limites;
  const fuera = formato.clave === "h" ? timeline.duracion > limites.h : timeline.duracion < limites.vMin || timeline.duracion > limites.vMax;
  if (fuera) console.warn(`⚠ ${formato.salida} dura ${timeline.duracion} s, fuera de lo pedido (${formato.clave === "h" ? `hasta ${limites.h}` : `${limites.vMin} a ${limites.vMax}`} s). Ajustá velocidades en plan.json.`);

  const destino = path.join(final, formato.salida);
  let bitrate = bitrateParaPeso(timeline.duracion);
  for (let intento = 1; ; intento++) {
    rmSync(destino, { force: true });
    console.log(`Renderizando ${formato.salida} (${timeline.duracion} s, ${(bitrate / 1e6).toFixed(2)} Mbps)…`);
    correr(process.execPath, [hyperframes, "render", dir, "-o", destino, "--fps", String(FPS), "--video-bitrate", String(bitrate), "--video-frame-format", "png", "--quiet"]);
    const peso = statSync(destino).size;
    if (peso < MAX_BYTES) {
      console.log(`✓ ${path.relative(RAIZ, destino)} — ${(peso / 1e6).toFixed(1)} MB`);
      break;
    }
    if (intento === 3) salirConError(`${formato.salida} pesa ${(peso / 1e6).toFixed(1)} MB y no baja de 16 MB: acortá el plan.`);
    bitrate = Math.floor(bitrate * 0.7);
  }
}
console.log(`\nListo. Los dos videos están en ${path.relative(RAIZ, final)}.`);
