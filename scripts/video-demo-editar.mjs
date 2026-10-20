// Edita las grabaciones del video demo con HyperFrames y saca tres videos para mandar.
// Uso:  npm run video-demo:editar                                   usa la última carpeta completa de video-demo/salida
//       npm run video-demo:editar -- --carpeta <ruta>
//       npm run video-demo:editar -- --solo explicativo-h | explicativo-v | redes
//       npm run video-demo:editar -- --preparar     arma los proyectos de HyperFrames sin renderizar (para revisar)
// Deja explicativo-16x9.mp4, explicativo-9x16.mp4 y redes-9x16.mp4 en <carpeta>/final/, y una tira de
// cuadros de cada uno en final/tiras/. La composición vive en video-demo/edicion/.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FPS,
  PANTALLAS,
  argsTramo,
  armarTomas,
  bitrateParaPeso,
  escapar,
  flechasHtml,
  guionExplicativo,
  panesHtml,
  rellenarPlantilla,
  tamanosFuente,
  textosHtml,
  validarFuentes,
} from "./video-demo/edicion.mjs";
import { armarRedes, escenasHtml, guionRedes, textosRedesHtml } from "./video-demo/redes.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDICION = path.join(RAIZ, "video-demo", "edicion");
const SALIDA = path.join(RAIZ, "video-demo", "salida");
const MAX_BYTES = 16_000_000; // WhatsApp recomprime lo que pasa de ~16 MB

function salirConError(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, "utf8"));

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

const ENTORNO = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };

function correr(comando, args, { silencioso = false } = {}) {
  const res = spawnSync(comando, args, { stdio: silencioso ? ["ignore", "pipe", "pipe"] : "inherit", env: ENTORNO, encoding: "utf8" });
  if (res.error || res.status !== 0) {
    const detalle = res.error ? res.error.message : (res.stderr || "").trim().split("\n").slice(-5).join("\n");
    salirConError(`Falló ${path.basename(comando)}${detalle ? `:\n${detalle}` : "."}`);
  }
  return res.stdout;
}

/** Corre ffmpeg en varios procesos a la vez: son decenas de recortes cortos. */
function correrEnParalelo(tareas, simultaneas = 4) {
  return new Promise((resolve, reject) => {
    let siguiente = 0;
    let vivas = 0;
    let fallo = null;
    const lanzar = () => {
      if (fallo) return;
      if (siguiente >= tareas.length && vivas === 0) return resolve();
      while (vivas < simultaneas && siguiente < tareas.length) {
        const args = tareas[siguiente++];
        vivas++;
        const hijo = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], env: ENTORNO });
        let err = "";
        hijo.stderr.on("data", (d) => (err += d));
        hijo.on("close", (codigo) => {
          vivas--;
          if (codigo !== 0) {
            fallo = new Error(`Falló ffmpeg: ${err.trim().split("\n").slice(-3).join("\n")}`);
            return reject(fallo);
          }
          lanzar();
        });
      }
    };
    lanzar();
  });
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

function duracionesDeGrabacion(carpeta) {
  const out = {};
  for (const p of PANTALLAS) {
    const texto = correr("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(carpeta, `${p}.mp4`)], { silencioso: true });
    out[p] = Number(texto.trim());
  }
  return out;
}

function prepararProyecto(dir) {
  rmSync(dir, { recursive: true, force: true });
  for (const sub of ["media", "fonts", "vendor"]) mkdirSync(path.join(dir, sub), { recursive: true });
  for (const f of ["marca.css", "logo.png", "motor.js"]) copyFileSync(path.join(EDICION, f), path.join(dir, f));
  copyFileSync(path.join(EDICION, "vendor", "gsap.min.js"), path.join(dir, "vendor", "gsap.min.js"));
  for (const fuente of readdirSync(path.join(EDICION, "fonts"))) copyFileSync(path.join(EDICION, "fonts", fuente), path.join(dir, "fonts", fuente));
  // HyperFrames pide este archivo para tratar la carpeta como un proyecto.
  writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ telemetryEnabled: false }, null, 2));
}

const jsonSeguro = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

function valoresComunes(plan, timeline, cierre) {
  return {
    DURACION: String(timeline.duracion),
    INTRO_DUR: String(plan.intro.dur),
    INTRO_TITULO: escapar(plan.intro.titulo),
    CIERRE_INICIO: String(timeline.cierre.inicio),
    CIERRE_DUR: String(timeline.cierre.dur),
    CIERRE_TEXTO: escapar(cierre.texto),
    CIERRE_URL: escapar(cierre.url),
  };
}

async function armarExplicativo({ clave, carpeta, dir, plan, pasos, duraciones }) {
  const formato = clave === "explicativo-h" ? "h" : "v";
  const fuentes = tamanosFuente(pasos);
  const timeline = armarTomas(plan, pasos, formato);
  validarFuentes(timeline.tomas, duraciones);
  const tareas = [];
  timeline.tomas.forEach((t, i) => {
    for (const p of PANTALLAS) {
      if (formato === "v" && p !== t.actor) continue;
      tareas.push(argsTramo(path.join(carpeta, `${p}.mp4`), t.fuentes[p], t.velocidad, path.join(dir, "media", `${p}-${i}.mp4`)));
    }
  });
  await correrEnParalelo(tareas);
  const textos = textosHtml(plan, timeline);
  const guion = guionExplicativo(plan, timeline, fuentes, formato);
  const valores = {
    ...valoresComunes(plan, timeline, plan.cierre),
    PANES: panesHtml(timeline, fuentes, formato),
    FLECHAS: formato === "h" ? flechasHtml(timeline, fuentes) : "",
    SUBTITULOS: textos.subtitulos,
    NOTAS: textos.notas,
    ESTADOS: textos.estados,
    DATOS: jsonSeguro({ guion }),
  };
  return { timeline, valores, plantilla: `plantilla-explicativo-${formato}.html` };
}

async function armarRedesVideo({ carpeta, dir, plan, pasos, duraciones }) {
  const fuentes = tamanosFuente(pasos);
  const timeline = armarRedes(plan, pasos, fuentes);
  validarFuentes(
    timeline.escenas.flatMap((e) => e.paneles.map((pn) => ({ id: e.id, fuentes: { [pn.pantalla]: pn.fuente } }))),
    duraciones,
  );
  const tareas = [];
  timeline.escenas.forEach((e, i) => {
    e.paneles.forEach((pn, j) => {
      tareas.push(argsTramo(path.join(carpeta, `${pn.pantalla}.mp4`), pn.fuente, pn.velocidad, path.join(dir, "media", `r-${i}-${j}.mp4`)));
    });
  });
  await correrEnParalelo(tareas);
  const guion = guionRedes(plan, timeline);
  const valores = {
    ...valoresComunes(plan, timeline, plan.redes.cierre),
    ESCENAS: escenasHtml(timeline),
    TEXTOS: textosRedesHtml(timeline),
    DATOS: jsonSeguro({ guion }),
  };
  return { timeline, valores, plantilla: "plantilla-redes.html", cortes: timeline.cortes };
}

const FORMATOS = [
  { clave: "explicativo-h", salida: "explicativo-16x9.mp4", rango: "h", armar: armarExplicativo, tira: { cada: 4, ancho: 384, alto: 216, columnas: 8 } },
  { clave: "explicativo-v", salida: "explicativo-9x16.mp4", rango: "v", armar: armarExplicativo, tira: { cada: 4, ancho: 216, alto: 384, columnas: 8 } },
  { clave: "redes", salida: "redes-9x16.mp4", rango: "redes", armar: armarRedesVideo, tira: { cada: 2, ancho: 216, alto: 384, columnas: 8 } },
];

/** Renderiza con un solo worker: así HyperFrames manda los cuadros directo al encoder y no llena el disco con miles de imágenes. Reintenta una vez. */
function renderizar(dir, destino, bitrate) {
  const args = [hyperframes, "render", dir, "-o", destino, "--fps", String(FPS), "--video-bitrate", String(bitrate), "--video-frame-format", "png", "--workers", "1", "--quiet"];
  for (let intento = 1; intento <= 2; intento++) {
    const res = spawnSync(process.execPath, args, { stdio: "inherit", env: ENTORNO });
    if (res.status === 0) return;
    console.warn(`⚠ El render falló (intento ${intento} de 2).`);
  }
  salirConError(`Falló el render de ${path.basename(destino)}.`);
}

/** Una imagen con un cuadro cada `cada` segundos, para revisar el video sin abrirlo. */
function sacarTira(video, destino, { cada, ancho, alto, columnas }, duracion) {
  const cuadros = Math.ceil(duracion / cada);
  const filas = Math.ceil(cuadros / columnas);
  correr(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", video, "-vf", `fps=1/${cada},scale=${ancho}:${alto},tile=${Math.min(columnas, cuadros)}x${filas}:padding=4:color=0x241d16`, "-frames:v", "1", destino],
    { silencioso: true },
  );
}

const args = process.argv.slice(2);
const iSolo = args.indexOf("--solo");
const solo = iSolo === -1 ? null : args[iSolo + 1];
if (iSolo !== -1 && !FORMATOS.some((f) => f.clave === solo)) salirConError("--solo acepta explicativo-h, explicativo-v o redes.");

const soloPreparar = args.includes("--preparar");
const carpeta = elegirCarpeta(args);
const plan = leerJson(path.join(EDICION, "plan.json"));
const pasos = leerJson(path.join(carpeta, "pasos.json"));
if (plan.fps !== FPS) salirConError(`plan.json dice ${plan.fps} cuadros por segundo y la edición usa ${FPS}.`);

for (const herramienta of ["ffmpeg", "ffprobe"]) if (spawnSync(herramienta, ["-version"]).status !== 0) salirConError(`Hace falta ${herramienta} instalado y en el PATH.`);
const hyperframes = binarioHyperframes();
const duraciones = duracionesDeGrabacion(carpeta);

const final = path.join(carpeta, "final");
const tiras = path.join(final, "tiras");
mkdirSync(tiras, { recursive: true });
console.log(`Editando ${path.relative(RAIZ, carpeta)}…`);

const resumen = [];
for (const formato of FORMATOS) {
  if (solo && formato.clave !== solo) continue;
  const dir = path.join(final, "_proyecto", formato.clave);
  prepararProyecto(dir);
  console.log(`Armando ${formato.salida}…`);
  let armado;
  try {
    armado = await formato.armar({ clave: formato.clave, carpeta, dir, plan, pasos, duraciones });
  } catch (error) {
    salirConError(error.message);
  }
  const { timeline, valores, plantilla } = armado;
  writeFileSync(path.join(dir, "index.html"), rellenarPlantilla(readFileSync(path.join(EDICION, plantilla), "utf8"), valores));
  if (armado.cortes) writeFileSync(path.join(final, "redes-cortes.txt"), `Cortes de redes (segundos):\n${armado.cortes.map((c) => c.toFixed(1)).join("\n")}\n`);

  const [min, max] = plan.limites[formato.rango];
  if (timeline.duracion < min || timeline.duracion > max) console.warn(`⚠ ${formato.salida} dura ${timeline.duracion} s, fuera de lo pedido (${min} a ${max} s). Ajustá velocidades en plan.json.`);

  if (soloPreparar) continue;
  const destino = path.join(final, formato.salida);
  let bitrate = bitrateParaPeso(timeline.duracion);
  for (let intento = 1; ; intento++) {
    rmSync(destino, { force: true });
    console.log(`Renderizando ${formato.salida} (${timeline.duracion} s, ${(bitrate / 1e6).toFixed(2)} Mbps)…`);
    renderizar(dir, destino, bitrate);
    const peso = statSync(destino).size;
    if (peso < MAX_BYTES) {
      console.log(`✓ ${path.relative(RAIZ, destino)} — ${(peso / 1e6).toFixed(1)} MB`);
      resumen.push({ archivo: destino, peso });
      break;
    }
    if (intento === 3) salirConError(`${formato.salida} pesa ${(peso / 1e6).toFixed(1)} MB y no baja de 16 MB: acortá el plan.`);
    bitrate = Math.floor(bitrate * 0.7);
  }
  sacarTira(destino, path.join(tiras, `${formato.salida.replace(".mp4", "")}.png`), formato.tira, timeline.duracion);
}
console.log(`\nListo. Videos en ${path.relative(RAIZ, final)}, tiras en ${path.relative(RAIZ, tiras)}.`);
