// Graba una página a su resolución real (con deviceScaleFactor 2 queda al doble) y la guarda como mp4.
// El recordVideo de Playwright no sirve para esto: siempre captura en píxeles CSS y, si se le pide un video
// más grande, deja la imagen chica en una esquina sobre fondo gris. Acá se usa el screencast de Chrome
// (CDP), que sí entrega los cuadros en píxeles del dispositivo si el navegador arranca con
// `--force-device-scale-factor` y la página no emula otra escala (`viewport: null`).
//
// Mientras se graba no se codifica nada: cada cuadro se escribe a disco como JPEG con su marca de tiempo y se
// libera enseguida (tres Chrome y un x264 a 2560x1600 a la vez dejan sin memoria y sin CPU a los paneles).
// Recién al terminar, `codificarVideo()` arma cada mp4, uno por vez, respetando esas marcas de tiempo.
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const FPS = 30;
// El screencast manda un cuadro por cada cambio visual: se limita a ~25 por segundo.
const INTERVALO_MIN_MS = 40;
const CALIDAD_JPEG = 85;

const numero = (n) => String(n).padStart(6, "0");

// Arranca la grabación y espera el primer cuadro: ese instante es el segundo 0 del video (`origen`, en ms).
// Devuelve { origen, detener }; `detener()` corta el screencast y devuelve { carpeta, cuadros, fin } para
// `codificarVideo()`.
export async function iniciarGrabacion(page, { carpeta }) {
  await mkdir(carpeta, { recursive: true });
  const sesion = await page.context().newCDPSession(page);

  const cuadros = []; // { archivo, t } con t en ms desde `origen`
  const escrituras = new Set();
  let origen = null;
  let ultimoT = -Infinity;
  let retenido = null;
  let temporizador = null;
  let cerrado = false;
  let falloEscritura = null;
  let avisarPrimero;
  const primero = new Promise((resolve) => {
    avisarPrimero = resolve;
  });

  const guardar = (datos, t) => {
    const archivo = path.join(carpeta, `${numero(cuadros.length)}.jpg`);
    cuadros.push({ archivo, t });
    ultimoT = t;
    const escritura = writeFile(archivo, datos)
      .catch((e) => {
        falloEscritura ??= e;
      })
      .finally(() => escrituras.delete(escritura));
    escrituras.add(escritura);
  };

  const soltarRetenido = () => {
    temporizador = null;
    if (!retenido) return;
    const { datos, t } = retenido;
    retenido = null;
    guardar(datos, t);
  };

  sesion.on("Page.screencastFrame", (cuadro) => {
    // Se libera ya: Chrome no manda el siguiente hasta recibir el ack.
    sesion.send("Page.screencastFrameAck", { sessionId: cuadro.sessionId }).catch(() => {});
    if (cerrado) return; // un cuadro que venía en camino cuando se cortó

    const instante = cuadro.metadata?.timestamp ? cuadro.metadata.timestamp * 1000 : Date.now();
    if (origen === null) {
      origen = instante;
      avisarPrimero();
    }
    const t = Math.max(0, instante - origen);
    const datos = Buffer.from(cuadro.data, "base64");

    if (t - ultimoT >= INTERVALO_MIN_MS) {
      retenido = null;
      guardar(datos, t);
    } else {
      // Demasiado seguido: se guarda solo si nada más llega antes (si no, la última imagen se perdería).
      retenido = { datos, t };
      temporizador ??= setTimeout(soltarRetenido, INTERVALO_MIN_MS);
    }
  });

  await sesion.send("Page.startScreencast", { format: "jpeg", quality: CALIDAD_JPEG, maxWidth: 8000, maxHeight: 8000, everyNthFrame: 1 });
  await Promise.race([
    primero,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("El navegador no mandó ningún cuadro para grabar.")), 10_000)),
  ]);

  return {
    // El origen está en la hora del navegador (la del screencast); la bitácora y los focos usan Date.now(), que
    // es el mismo reloj de pared de esta máquina.
    origen,
    async detener() {
      cerrado = true;
      await sesion.send("Page.stopScreencast").catch(() => {});
      if (temporizador) clearTimeout(temporizador);
      soltarRetenido();
      await Promise.all(escrituras);
      if (falloEscritura) throw new Error(`No pude guardar un cuadro en disco: ${falloEscritura.message}`);
      return { carpeta, cuadros, fin: Math.max(0, Date.now() - origen) };
    },
  };
}

// Lista para el demuxer `concat` de ffmpeg: cada cuadro dura hasta el siguiente; el último, hasta `fin`.
export function armarLista(cuadros, fin) {
  const lineas = [];
  cuadros.forEach(({ archivo, t }, i) => {
    const hasta = i + 1 < cuadros.length ? cuadros[i + 1].t : Math.max(fin, t + INTERVALO_MIN_MS);
    lineas.push(`file '${archivo.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`, `duration ${(Math.max(hasta - t, 1) / 1000).toFixed(3)}`);
  });
  // ffmpeg ignora la duración del último `file` si no se repite.
  if (cuadros.length) lineas.push(lineas[lineas.length - 2]);
  return lineas.join("\n");
}

// Codifica los cuadros guardados en un mp4 a 30 fps y borra los JPEG. Uno por vez: se llama en serie.
// `format=yuv420p` va ANTES de `fps`: el filtro duplica cuadros para rellenar las pausas y, si lo hace con el
// JPEG sin convertir, a 2560x1600 se queda sin memoria («Cannot allocate memory») en una pausa larga.
export async function codificarVideo({ carpeta, cuadros, fin }, archivo) {
  const lista = path.join(carpeta, "lista.txt");
  await writeFile(lista, armarLista(cuadros, fin));
  const fallo = await new Promise((resolve) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lista, "-vf", `format=yuv420p,fps=${FPS}`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", archivo],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let texto = "";
    ffmpeg.stderr.on("data", (parte) => {
      texto += parte;
    });
    ffmpeg.on("error", (e) => resolve(e.message));
    ffmpeg.on("close", (codigo) => resolve(codigo === 0 ? null : texto.trim().split("\n").pop() || `ffmpeg salió con ${codigo}`));
  });
  if (fallo) throw new Error(`ffmpeg no pudo guardar ${path.basename(archivo)}: ${fallo}`);
  await rm(carpeta, { recursive: true, force: true });
}
